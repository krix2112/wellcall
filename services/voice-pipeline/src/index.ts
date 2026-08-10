import '../scripts/loadEnv';
import { createGatewayServer, GatewayServerBundle } from './gateway/server';
import { insertTranscriptEntry } from './gateway/db';
import { GatewaySocketManager } from './gateway/socket';
import { TranscriptEntry } from '@wellcall/shared-types';
import TelephonyClient from './telephonyClient';
import { STTClient } from './sttClient';
import { RimeClient } from './rimeClient';
import { CallStateMachine } from './callStateMachine';
import { getPatientById } from './gateway/db';
import fs from 'fs';
import path from 'path';

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

async function bootstrap() {
  gatewayBundle = createGatewayServer();
  await gatewayBundle.start();

  console.log('[orchestrator] Gateway server started successfully.');

  // no fake timer — live pipeline drives real events

  // Example: wire live pipeline for a demo patient using local test.pcm as source
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
