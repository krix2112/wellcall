// Load environment variables from repository root .env for both dev and built dist runs.
// Dist runtime lives at services/voice-pipeline/dist, src at services/voice-pipeline/src —
// in both cases the repository root is three levels up.
import fs from 'fs';
import path from 'path';
const _envPath = path.resolve(__dirname, '../../..', '.env');
if (fs.existsSync(_envPath)) {
  const _env = fs.readFileSync(_envPath, 'utf8');
  _env.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([^=\s]+)=(.*)$/);
    if (!m) return;
    const k = m[1];
    let v = m[2] || '';
    v = v.replace(/^"|"$/g, '');
    if (!process.env[k]) process.env[k] = v;
  });
}
import { createGatewayServer, GatewayServerBundle } from './gateway/server';
import { insertTranscriptEntry, getPatientById, getPatients, insertEscalation } from './gateway/db';
import { GatewaySocketManager } from './gateway/socket';
import { TranscriptEntry, Escalation, ExtractedFields, RedFlagMatch, RiskDecision } from '@wellcall/shared-types';

// Intelligence-layer workspace imports
import { extractFields } from '@wellcall/extraction';
import { matchRedFlag, seedRedFlags, seedPatientCarePlan } from '@wellcall/qdrant-memory';
import { decideRisk } from '@wellcall/risk-engine';
import { generateAuditRecord, formatAuditRecordAsText } from '@wellcall/audit-report';
import { notifyNurseSMS } from './notifyNurseSMS';

// Demo Script scenarios
import { DEMO_SCENARIOS, DemoScriptItem } from './demoScript';

let gatewayBundle: GatewayServerBundle | null = null;

/**
 * Singleton getter to access the live GatewaySocketManager instance
 */
export function getSocketManager(): GatewaySocketManager {
  if (!gatewayBundle || !gatewayBundle.socketManager) {
    throw new Error('[orchestrator] GatewaySocketManager is not initialized yet. Call bootstrap() first.');
  }
  return gatewayBundle.socketManager;
}

/**
 * Process a single transcript chunk through the intelligence layer:
 * Groq Extraction -> Qdrant Vector Search -> Risk Engine Decision -> Audit Assembly
 */
export async function processTranscriptChunk(
  callId: string,
  patientId: string,
  transcriptText: string
): Promise<{ extracted: ExtractedFields; redFlagMatch: RedFlagMatch; decision: RiskDecision }> {
  const patient = await getPatientById(patientId);
  const condition = patient?.condition || 'Post-discharge follow-up';

  // 1. Groq LLM Field Extraction
  const extracted = await extractFields(transcriptText, { condition });

  // 2. Qdrant Cloud Vector Red-Flag Match
  const redFlagMatch = await matchRedFlag(patientId, transcriptText);

  // 3. Deterministic Risk Engine Decision
  const decision = decideRisk(extracted, redFlagMatch);

  // 4. Construct & Persist Transcript Entry
  const transcriptEntry: TranscriptEntry = {
    id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    callId,
    speaker: 'patient',
    text: transcriptText,
    timestamp: new Date().toISOString(),
  };
  await insertTranscriptEntry(transcriptEntry);

  // Emit live transcript entry to connected web dashboard
  getSocketManager().emitTranscriptNew(transcriptEntry);

  let escalation: Escalation | undefined = undefined;

  // 5. Emit Escalation Event if Risk Engine Decides Escalate
  if (decision.action === 'escalate') {
    escalation = {
      id: `esc-${Date.now()}`,
      callId,
      patientId,
      reason: decision.reason,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };

    getSocketManager().emitEscalationNew(escalation);
    if (patient) {
      await notifyNurseSMS(escalation, patient);
    }
  }

  // 6. Generate & Format Compliance Audit Record
  if (patient) {
    const auditRecord = generateAuditRecord({
      callId,
      patient,
      transcript: [transcriptEntry],
      extractedFields: [extracted],
      redFlagMatches: [redFlagMatch],
      finalDecision: decision,
      escalation,
    });
    const readableText = formatAuditRecordAsText(auditRecord);
    console.log(`[orchestrator/audit] Generated audit record for call ${callId}:\n${readableText}`);
  }

  return { extracted, redFlagMatch, decision };
}

/**
 * Task 2: Fallback Demo Mode Sequence Runner
 * Feeds a scripted sequence of transcript items through the real intelligence pipeline.
 * Emits live Socket.io events for transcript entries, call status, and risk escalations.
 */
export async function runDemoSequence(
  patientId: string,
  scenarioKey: 'routine' | 'escalation' = 'escalation'
): Promise<{ callId: string; finalAction: string }> {
  const scenario = DEMO_SCENARIOS[scenarioKey] || DEMO_SCENARIOS['escalation'];
  const targetPatientId = patientId || scenario.patientId;
  const callId = `call-demo-${scenarioKey}-${Date.now()}`;

  console.log(`\n====================================================================`);
  console.log(`[FALLBACK DEMO MODE] Running Scenario: ${scenarioKey.toUpperCase()} (Call ID: ${callId})`);
  console.log(`[FALLBACK DEMO MODE] Target Patient ID: ${targetPatientId}`);
  console.log(`====================================================================\n`);

  const socketManager = getSocketManager();
  socketManager.emitCallStatus(callId, 'connected');

  const patient = await getPatientById(targetPatientId);
  const allTranscripts: TranscriptEntry[] = [];
  const allExtracted: ExtractedFields[] = [];
  const allRedFlags: RedFlagMatch[] = [];
  let lastDecision: RiskDecision = { action: 'log', reason: 'Routine check-in, no symptoms detected' };
  let triggeredEscalation: Escalation | undefined = undefined;

  for (const item of scenario.sequence) {
    // Wait item delay
    await new Promise((resolve) => setTimeout(resolve, item.delayMs));

    const entry: TranscriptEntry = {
      id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      callId,
      speaker: item.speaker,
      text: item.text,
      timestamp: new Date().toISOString(),
    };

    allTranscripts.push(entry);
    await insertTranscriptEntry(entry);
    socketManager.emitTranscriptNew(entry);

    if (item.speaker === 'patient') {
      console.log(`\n[demoRunner] Processing Patient Utterance: "${item.text}"`);

      // Run REAL Intelligence Pipeline
      const extracted = await extractFields(item.text, { condition: patient?.condition || '' });
      const redFlagMatch = await matchRedFlag(targetPatientId, item.text);
      const decision = decideRisk(extracted, redFlagMatch);

      allExtracted.push(extracted);
      allRedFlags.push(redFlagMatch);
      lastDecision = decision;

      console.log(`[demoRunner] LLM Extracted     : ${JSON.stringify(extracted)}`);
      console.log(`[demoRunner] Qdrant RedFlag     : ${JSON.stringify(redFlagMatch)}`);
      console.log(`[demoRunner] Risk Action        : ${decision.action.toUpperCase()} (${decision.reason})`);

      if (decision.action === 'escalate') {
        triggeredEscalation = {
          id: `esc-${Date.now()}`,
          callId,
          patientId: targetPatientId,
          reason: decision.reason,
          timestamp: new Date().toISOString(),
          acknowledged: false,
        };

        console.log(`[demoRunner] Escalating call! Emitting escalation:new to dashboard.`);
        await insertEscalation(triggeredEscalation);
        socketManager.emitEscalationNew(triggeredEscalation);
        if (patient) {
          await notifyNurseSMS(triggeredEscalation, patient);
        }
      }
    }
  }

  socketManager.emitCallStatus(callId, 'ended');

  // Generate & Log End-of-Call Audit Record
  if (patient) {
    const auditRecord = generateAuditRecord({
      callId,
      patient,
      transcript: allTranscripts,
      extractedFields: allExtracted,
      redFlagMatches: allRedFlags,
      finalDecision: lastDecision,
      escalation: triggeredEscalation,
    });

    const formattedReport = formatAuditRecordAsText(auditRecord);
    console.log(`\n====================================================================`);
    console.log(`[DEMO COMPLETE] Compliance Audit Report for Call ${callId}:`);
    console.log(`====================================================================`);
    console.log(formattedReport);
    console.log(`====================================================================\n`);
  }

  return { callId, finalAction: lastDecision.action };
}

async function bootstrap() {
  gatewayBundle = createGatewayServer();
  await gatewayBundle.start();

  console.log('[orchestrator] Gateway server started successfully.');

  // Seed Qdrant red-flag vectors at startup — from synthetic patient files
  // AND from the gateway DB's live patient records (so API data and Qdrant
  // embeddings are consistent).
  seedRedFlags().catch((err: any) => {
    console.error('[orchestrator] Qdrant seed (synthetic) failed:', err);
  });
  try {
    const gatewayPatients = await getPatients();
    for (const patient of gatewayPatients) {
      if (patient.redFlagSymptoms && patient.redFlagSymptoms.length > 0) {
        await seedPatientCarePlan(patient);
      }
    }
    console.log(`[orchestrator] Seeded Qdrant from ${gatewayPatients.length} gateway DB patients.`);
  } catch (err) {
    console.warn('[orchestrator] Failed to seed Qdrant from gateway DB:', err);
  }

  console.log('[orchestrator] Gateway ready. Real patient calls are handled via Socket.io /microphone.');
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('[orchestrator] Bootstrap error:', err);
    process.exit(1);
  });
}

// Graceful shutdown on Ctrl+C / termination
process.on('SIGINT', async () => {
  console.log('[orchestrator] Received SIGINT, shutting down gracefully...');
  try {
    if (gatewayBundle && gatewayBundle.server) {
      await gatewayBundle.server.close();
      console.log('[orchestrator] Fastify server closed');
    }
  } catch (e) {
    console.warn('[orchestrator] Error during shutdown:', e);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[orchestrator] Received SIGTERM, shutting down gracefully...');
  try {
    if (gatewayBundle && gatewayBundle.server) {
      await gatewayBundle.server.close();
      console.log('[orchestrator] Fastify server closed');
    }
  } catch (e) {
    console.warn('[orchestrator] Error during shutdown:', e);
  }
  process.exit(0);
});

export { bootstrap };
