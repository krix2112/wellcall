import { FastifyInstance } from 'fastify';
import { getPatients, getPatientById, getCallById, getAllAudit } from './db';

export async function registerGatewayRoutes(server: FastifyInstance): Promise<void> {
  // GET /patients - Active patient roster
  server.get('/patients', async (request, reply) => {
    const patients = await getPatients();
    return reply.send(patients);
  });

  // GET /patients/:id - Single patient details
  server.get('/patients/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const patient = await getPatientById(id);
    if (!patient) {
      return reply.status(404).send({ error: 'Patient not found' });
    }
    return reply.send(patient);
  });

  // GET /calls/:id - Single call session details
  server.get('/calls/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const callData = await getCallById(id);
    if (!callData) {
      return reply.status(404).send({ error: 'Call session not found' });
    }
    return reply.send(callData);
  });

  // GET /audit - Escalation audit report table
  server.get('/audit', async (request, reply) => {
    const auditData = await getAllAudit();
    return reply.send(auditData);
  });
}
