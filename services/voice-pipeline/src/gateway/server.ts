import Fastify, { FastifyInstance } from 'fastify';
import { getPatients, getPatientById, getCallById, getAllAudit, getCallsByPatientId } from './db';
import { GatewaySocketManager } from './socket';
import { runDemoSequence } from '../index';

export interface GatewayServerBundle {
  server: FastifyInstance;
  socketManager: GatewaySocketManager;
  start: () => Promise<string>;
}

export function createGatewayServer(): GatewayServerBundle {
  const server = Fastify({
    logger: true,
  });

  // REST Routes reading from db.ts
  server.get('/patients', async (req, reply) => {
    const patients = await getPatients();
    return reply.send(patients);
  });

  server.get('/patients/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patient = await getPatientById(id);
    if (!patient) {
      return reply.status(404).send({ error: 'Patient not found' });
    }
    return reply.send(patient);
  });

  server.get('/patients/:id/calls', async (req, reply) => {
    const { id } = req.params as { id: string };
    const calls = await getCallsByPatientId(id);
    const auditData = await getAllAudit();

    // Enrich calls with outcome (escalated vs routine)
    const enrichedCalls = calls.map((call: any) => {
      const escalation = auditData.escalations.find((e) => e.callId === call.id);
      return {
        ...call,
        outcome: escalation ? 'escalated' : 'routine',
        escalationReason: escalation?.reason,
      };
    });

    return reply.send(enrichedCalls);
  });

  server.get('/calls/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const callData = await getCallById(id);
    if (!callData) {
      return reply.status(404).send({ error: 'Call not found' });
    }
    return reply.send(callData);
  });

  server.get('/audit', async (req, reply) => {
    const auditData = await getAllAudit();
    return reply.send(auditData);
  });

  /**
   * Task 3: REST Trigger Endpoint for Fallback Demo Mode
   * POST /demo/run?scenario=routine|escalation&patientId=patient-01
   * Runs the demo transcript sequence through the real intelligence pipeline (Groq -> Qdrant -> Risk Engine)
   */
  server.post('/demo/run', async (req, reply) => {
    const query = (req.query as { scenario?: string; patientId?: string }) || {};
    const body = (req.body as { scenario?: string; patientId?: string }) || {};

    const scenario = (query.scenario || body.scenario || 'escalation') as 'routine' | 'escalation';
    const patientId = query.patientId || body.patientId || (scenario === 'routine' ? 'patient-02' : 'patient-01');

    // Run demo sequence asynchronously in background
    runDemoSequence(patientId, scenario).catch((err) => {
      console.error(`[gateway/server] Error in demo sequence run:`, err);
    });

    return reply.send({
      success: true,
      message: `Fallback Demo Mode started for scenario: "${scenario}" (Patient: ${patientId})`,
      scenario,
      patientId,
    });
  });

  // GET helper variant for easy browser trigger testing
  server.get('/demo/run', async (req, reply) => {
    const query = (req.query as { scenario?: string; patientId?: string }) || {};
    const scenario = (query.scenario || 'escalation') as 'routine' | 'escalation';
    const patientId = query.patientId || (scenario === 'routine' ? 'patient-02' : 'patient-01');

    runDemoSequence(patientId, scenario).catch((err) => {
      console.error(`[gateway/server] Error in demo sequence run:`, err);
    });

    return reply.send({
      success: true,
      message: `Fallback Demo Mode started for scenario: "${scenario}" (Patient: ${patientId})`,
      scenario,
      patientId,
    });
  });

  server.get('/test-escalate', async (req, reply) => {
    const patientId = (req.query as { patientId?: string })?.patientId || 'patient-01';
    const fakeEscalation = {
      id: `esc-demo-${Date.now()}`,
      callId: 'call-demo-101',
      patientId,
      reason: "Patient's description matches a known high-risk pattern: 'Sudden chest tightness or heavy sternal pressure'",
      timestamp: new Date().toISOString(),
      acknowledged: false,
    };
    socketManager.emitEscalationNew(fakeEscalation);
    return reply.send({ success: true, escalation: fakeEscalation });
  });

  // Attach Socket.io to Fastify HTTP server
  const socketManager = new GatewaySocketManager(server.server);

  const start = async (): Promise<string> => {
    const port = Number(process.env.GATEWAY_PORT) || 3001;
    const host = '0.0.0.0';
    const address = await server.listen({ port, host });
    console.log(`[gateway/server] Fastify + Socket.io running on ${address}`);
    return address;
  };

  return { server, socketManager, start };
}
