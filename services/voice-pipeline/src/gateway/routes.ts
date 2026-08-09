import { FastifyInstance } from 'fastify';
import { db } from './db';

export async function registerGatewayRoutes(server: FastifyInstance): Promise<void> {
  // GET /patients - Roster of active patients
  server.get('/patients', async (request, reply) => {
    const patients = await db.getPatients();
    return reply.send({ data: patients });
  });

  // GET /patients/:id - Single patient care plan and details
  server.get('/patients/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const patient = await db.getPatientById(id);
    if (!patient) {
      return reply.status(404).send({ error: 'Patient not found' });
    }
    return reply.send({ data: patient });
  });

  // GET /calls/:id - Single call session details and transcripts
  server.get('/calls/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const call = await db.getCallById(id);
    if (!call) {
      return reply.status(404).send({ error: 'Call session not found' });
    }
    const transcripts = await db.getTranscriptsByCallId(id);
    return reply.send({ data: { call, transcripts } });
  });

  // GET /audit - Escalation audit report table
  server.get('/audit', async (request, reply) => {
    const escalations = await db.getEscalations();
    return reply.send({ data: escalations });
  });
}
