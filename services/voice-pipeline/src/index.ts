import { createGatewayServer } from './gateway/server';
import { GatewaySocketManager } from './gateway/socket';
import { registerGatewayRoutes } from './gateway/routes';
import { db } from './gateway/db';
import { CallStateMachine } from './callStateMachine';

// DIRECT IN-PROCESS WORKSPACE PACKAGE IMPORTS (NO INTER-SERVICE HTTP)
import { extractFields } from '@wellcall/extraction';
import { matchRedFlags, CarePlanStore, SessionMemory } from '@wellcall/qdrant-memory';
import { decideRisk } from '@wellcall/risk-engine';
import { generateAuditReport } from '@wellcall/audit-report';
import { Patient, Escalation } from '@wellcall/shared-types';

async function bootstrap() {
  const server = createGatewayServer();
  await registerGatewayRoutes(server);

  const port = Number(process.env.GATEWAY_PORT) || 3001;
  const host = '0.0.0.0';

  await server.listen({ port, host });
  console.log(`[orchestrator] Gateway Fastify server running on http://localhost:${port}`);

  // Attach Socket.io server manager
  const socketManager = new GatewaySocketManager(server.server);

  // Initialize In-Process Logic Managers
  const carePlanStore = new CarePlanStore();
  const sessionMemory = new SessionMemory();

  console.log('[orchestrator] Monolithic single-process orchestrator ready.');

  // Orchestrator Execution Pipeline (In-Process Call Handler)
  async function processPatientCall(patient: Patient) {
    const callId = `call-${Date.now()}`;
    console.log(`[orchestrator] Starting call pipeline for patient: ${patient.name} (${patient.id})`);

    await db.savePatient(patient);
    await carePlanStore.upsertCarePlan(patient);

    const machine = new CallStateMachine(callId, patient, true);
    socketManager.emitCallStatus(callId, 'ringing');

    // Run fake mode call session and process extractions in-process
    await machine.runFakeDemoSession(async (transcriptEntry) => {
      // 1. Save transcript to SQLite DB and emit via Socket.io
      await db.saveTranscript(transcriptEntry);
      socketManager.emitTranscriptNew(transcriptEntry);

      // 2. Execute extraction in-process (direct function call)
      if (transcriptEntry.speaker === 'patient') {
        const extraction = await extractFields(transcriptEntry.text);
        
        // 3. Match red flags in-process against Qdrant patient care plan
        const redFlagMatch = await matchRedFlags(extraction.symptom, patient.redFlags);

        // 4. Evaluate clinical risk in-process
        const decision = await decideRisk({ extraction, redFlagMatch });

        if (decision.action === 'escalate') {
          const escalation: Escalation = {
            id: `esc-${Date.now()}`,
            callId,
            patientId: patient.id,
            patientName: patient.name,
            timestamp: new Date().toISOString(),
            riskTier: decision.riskTier,
            reason: decision.reason,
            status: 'pending',
          };

          await db.saveEscalation(escalation);
          socketManager.emitEscalationNew(escalation);
        }

        // 5. Generate audit report in-process
        await generateAuditReport({
          callId,
          patient,
          transcripts: [transcriptEntry],
          extractions: [extraction],
          decision,
        });
      }
    });

    socketManager.emitCallStatus(callId, 'ended');
  }

  // Export process function for programmatic execution
  return { processPatientCall, socketManager, server };
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('[orchestrator] Bootstrap failed:', err);
    process.exit(1);
  });
}

export { bootstrap };
