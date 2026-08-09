import Fastify, { FastifyInstance } from 'fastify';
import { getPatients, getPatientById, getCallById, getAllAudit } from './db';
import { GatewaySocketManager } from './socket';

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
