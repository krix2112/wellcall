import { createGatewayServer } from './gateway/server';
import {
  Patient,
  ExtractedFields,
  RedFlagMatch,
  RiskDecision,
  Escalation,
  TranscriptEntry,
} from '@wellcall/shared-types';
import { extractFields } from '@wellcall/extraction';
import { matchRedFlag, seedRedFlags, seedPatientCarePlan } from '@wellcall/qdrant-memory';
import { decideRisk } from '@wellcall/risk-engine';
import { generateAuditRecord, formatAuditRecordAsText } from '@wellcall/audit-report';
import { notifyNurseSMS } from './notifyNurseSMS';
import {
  getPatientById,
  getPatients,
  insertCall,
  insertTranscriptEntry,
  insertEscalation,
} from './gateway/db';
import { STTClient } from './sttClient';

export interface ProcessChunkResult {
  extracted: ExtractedFields;
  redFlagMatch: RedFlagMatch;
  decision: RiskDecision;
}

let gatewayBundle: ReturnType<typeof createGatewayServer> | null = null;

function getSocketManager() {
  if (!gatewayBundle) throw new Error('[orchestrator] Gateway bundle not initialized');
  return gatewayBundle.socketManager;
}

// Shared STTClient instance for orchestrator event listening
export const orchestratorSTTClient = new STTClient();

orchestratorSTTClient.on('transcript', async (data: { text: string; confidence?: number; timestamp?: number }) => {
  console.log('[orchestrator] Got transcript:', data.text);
  try {
    const callId = `call-stt-${Date.now()}`;
    const patientId = 'patient-01';
    await processTranscriptChunk(callId, patientId, data.text);
  } catch (err) {
    console.error('[orchestrator] Error processing transcript event:', err);
  }
});

/**
 * Task 1: Intelligence Pipeline Execution Function
 */
export async function processTranscriptChunk(
  callId: string,
  patientId: string,
  transcriptText: string
): Promise<ProcessChunkResult> {
  const patient = await getPatientById(patientId);

  const transcriptEntry: TranscriptEntry = {
    id: `tx-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    callId,
    speaker: 'patient',
    text: transcriptText,
    timestamp: new Date().toISOString(),
  };

  // Persist transcript entry & emit via Socket.io
  await insertTranscriptEntry(transcriptEntry);
  if (gatewayBundle) {
    getSocketManager().emitTranscriptNew(transcriptEntry);
  }

  // 1. Groq LLM Extraction
  const extracted = await extractFields(transcriptText);

  // 2. Qdrant Red-Flag Matching
  const redFlagMatch = await matchRedFlag(patientId, transcriptText);

  // 3. Risk Decision Engine
  const decision = decideRisk(extracted, redFlagMatch);

  // 4. Persistence & Escalation Alert Handling
  let escalation: Escalation | undefined = undefined;

  if (decision.action === 'escalate') {
    escalation = {
      id: `esc-${Date.now()}`,
      callId,
      patientId,
      reason: decision.reason,
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };

    await insertEscalation(escalation);
    if (gatewayBundle) {
      getSocketManager().emitEscalationNew(escalation);
    }
    if (patient) {
      await notifyNurseSMS(escalation, patient);
    }
  }

  // 5. Generate & Format Compliance Audit Record
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
 */
export async function runDemoSequence(
  patientId: string,
  scenarioKey: 'routine' | 'escalation' | 'correction' = 'escalation'
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

  for (const item of scenario.sequence) {
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
      console.log(`[demoRunner] Processing Patient Utterance: "${item.text}"`);

      const result = await processTranscriptChunk(callId, targetPatientId, item.text);
      allExtracted.push(result.extracted);
      allRedFlags.push(result.redFlagMatch);
      lastDecision = result.decision;

      console.log(`[demoRunner] LLM Extracted     : ${JSON.stringify(result.extracted)}`);
      console.log(`[demoRunner] Qdrant RedFlag     : ${JSON.stringify(result.redFlagMatch)}`);
      console.log(`[demoRunner] Risk Action        : ${result.decision.action.toUpperCase()} (${result.decision.reason})`);

      if (result.decision.action === 'escalate' && scenarioKey !== 'correction') {
        console.log(`[demoRunner] Escalating call! Emitting escalation:new to dashboard.`);
        break;
      }
    }
  }

  socketManager.emitCallStatus(callId, 'ended');

  return { callId, finalAction: lastDecision.action };
}

const DEMO_SCENARIOS: Record<string, { patientId: string; sequence: { speaker: 'patient' | 'system'; text: string; delayMs: number }[] }> = {
  escalation: {
    patientId: 'patient-01',
    sequence: [
      { speaker: 'system', text: 'Hello John, this is Sara, your care assistant, checking in after your heart surgery. How are you doing today?', delayMs: 500 },
      { speaker: 'patient', text: 'My chest feels tight when I try to take deep breaths', delayMs: 1500 },
      { speaker: 'system', text: 'I understand you are experiencing chest tightness. I am notifying your care team and escalating to a nurse immediately.', delayMs: 1000 },
    ],
  },
  routine: {
    patientId: 'patient-01',
    sequence: [
      { speaker: 'system', text: 'Hello John, this is Sara, your care assistant, checking in after your heart surgery. How are you doing today?', delayMs: 500 },
      { speaker: 'patient', text: 'I feel fine, just resting at home', delayMs: 1500 },
      { speaker: 'system', text: 'Great to hear! Have you been taking your prescribed blood thinners as instructed?', delayMs: 1000 },
      { speaker: 'patient', text: 'Yes, I took them this morning with breakfast.', delayMs: 1500 },
      { speaker: 'system', text: 'Wonderful. Thank you for the update. Have a restful day!', delayMs: 1000 },
    ],
  },
  correction: {
    patientId: 'patient-01',
    sequence: [
      { speaker: 'system', text: 'Hello Jane, this is Sara, your care assistant, checking in after your discharge. How are you feeling today?', delayMs: 500 },
      { speaker: 'patient', text: "I'm having really sharp chest pain and it's hard to breathe", delayMs: 1500 },
      { speaker: 'system', text: 'I understand you are experiencing chest pain. Can you tell me more about where the pain is located?', delayMs: 1000 },
      { speaker: 'patient', text: 'Oh sorry, I misspoke! I meant my shoulder is sore from sleeping wrong, my chest is totally fine.', delayMs: 1500 },
      { speaker: 'system', text: 'Thank you for clarifying that your chest is fine and it is just shoulder soreness. Have a restful day!', delayMs: 1000 },
    ],
  },
};

async function bootstrap() {
  gatewayBundle = createGatewayServer();
  await gatewayBundle.start();

  console.log('[orchestrator] Gateway server started successfully.');

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

process.on('SIGINT', async () => {
  console.log('[orchestrator] Received SIGINT, shutting down gracefully...');
  try {
    if (gatewayBundle && gatewayBundle.server) {
      await gatewayBundle.server.close();
    }
  } catch (e) {
    // ignore
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[orchestrator] Received SIGTERM, shutting down gracefully...');
  try {
    if (gatewayBundle && gatewayBundle.server) {
      await gatewayBundle.server.close();
    }
  } catch (e) {
    // ignore
  }
  process.exit(0);
});

export { bootstrap };
