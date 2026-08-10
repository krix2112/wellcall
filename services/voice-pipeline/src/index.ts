import '../scripts/loadEnv';
import { createGatewayServer, GatewayServerBundle } from './gateway/server';
import { insertTranscriptEntry, getPatientById } from './gateway/db';
import { GatewaySocketManager } from './gateway/socket';
import { TranscriptEntry, Escalation } from '@wellcall/shared-types';
import { TelephonyClient } from './telephonyClient';
import { STTClient } from './sttClient';
import { RimeClient } from './rimeClient';
import { CallStateMachine } from './callStateMachine';
import fs from 'fs';
import path from 'path';

// Task 1: Intelligence-layer imports for Phase 3 pipeline integration
import { extractFields } from '@wellcall/extraction';
import { matchRedFlag } from '@wellcall/qdrant-memory';
import { decideRisk } from '@wellcall/risk-engine';
import { generateAuditRecord, formatAuditRecordAsText } from '@wellcall/audit-report';

let gatewayBundle: GatewayServerBundle | null = null;

/**
 * Singleton getter to access the live GatewaySocketManager instance
 * across all orchestrator pipeline modules (e.g. callStateMachine.ts).
 */
export function getSocketManager(): GatewaySocketManager {
  if (!gatewayBundle || !gatewayBundle.socketManager) {
    throw new Error('[orchestrator] GatewaySocketManager is not initialized yet. Call bootstrap() first.');
  }
  return gatewayBundle.socketManager;
}

/**
 * Task 2: Phase 3 Integration Pipeline function (Prepared for live wiring)
 * Processes an incoming transcript chunk from patient audio:
 * 1. Calls Groq LLM field extraction (extractFields)
 * 2. Matches against Qdrant Cloud patient red flags (matchRedFlag)
 * 3. Evaluates deterministic risk action (decideRisk)
 * 4. Emits live transcript entry to web dashboard over Socket.io
 * 5. Emits live escalation banner alert on high-risk escalation
 * 6. Generates & logs compliance audit record (generateAuditRecord)
 */
export async function processTranscriptChunk(
  callId: string,
  patientId: string,
  transcriptText: string
): Promise<void> {
  try {
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
  } catch (err) {
    console.error(`[orchestrator] Error processing transcript chunk for call ${callId}:`, err);
  }
}

async function bootstrap() {
  gatewayBundle = createGatewayServer();
  await gatewayBundle.start();

  console.log('[orchestrator] Gateway server started successfully.');

  /*
   * =========================================================================================
   * Task 3: PHASE 3 INTEGRATION WIRING COMMENT BLOCK
   * =========================================================================================
   * When callStateMachine.ts emits live transcript chunks from Deepgram STT, swap out the 
   * fake timer loop below and connect callStateMachine.ts events directly to processTranscriptChunk():
   * 
   * callMachine.on('transcript', async (chunkText: string) => {
   *   await processTranscriptChunk(callId, patientId, chunkText);
   * });
   * =========================================================================================
   */

  /*
   * FAKE TIMER / DEMO SIMULATION (Commented out ready to swap once callStateMachine is ready)
   * 
   * const FAKE_DEMO_TIMER_ENABLED = false; // Set to true to run legacy timer simulation
   * if (FAKE_DEMO_TIMER_ENABLED) {
   *   setTimeout(async () => {
   *     await processTranscriptChunk(
   *       'demo-call-101',
   *       'patient-01',
   *       'My chest feels tight when I try to take deep breaths'
   *     );
   *   }, 5000);
   * }
   */

  // Wire live pipeline for demo patient using local test.pcm as source
  try {
    const telephony = new TelephonyClient();
    telephony.startServer();
    const stt = new STTClient();
    const rime = new RimeClient();

    const patient = await getPatientById('patient-01');
    if (patient) {
      const callMachine = new CallStateMachine('demo-call-1', patient, false);
      callMachine.attachSocketManager(gatewayBundle.socketManager);

      // start live call orchestration
      callMachine.runLiveCall({ telephonyClient: telephony, sttClient: stt, rimeClient: rime }).catch((e) => {
        console.error('[orchestrator] Demo live call failed:', e);
      });

      // stream test.pcm into telephony as simulated patient audio
      const pcmPath = path.resolve(__dirname, '../test/test.pcm');
      if (fs.existsSync(pcmPath)) {
        const buf = fs.readFileSync(pcmPath);
        const chunkSize = 4000;
        (async () => {
          for (let offset = 0; offset < buf.length; offset += chunkSize) {
            const slice = buf.slice(offset, offset + chunkSize);
            telephony.emit('audio', slice);
            await new Promise((r) => setTimeout(r, 100));
          }
          // signal end
          telephony.emit('end');
        })();
      }
    }
  } catch (e) {
    console.warn('[orchestrator] Demo orchestration skipped:', e);
  }
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
