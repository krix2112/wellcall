import Fastify, { FastifyInstance } from 'fastify';

/**
 * Creates and configures Fastify server instance for gateway.
 */
export function createGatewayServer(): FastifyInstance {
  const server = Fastify({
    logger: true,
  });

  server.get('/health', async () => {
    return { status: 'ok', service: 'wellcall-gateway-orchestrator' };
  });

  return server;
}
