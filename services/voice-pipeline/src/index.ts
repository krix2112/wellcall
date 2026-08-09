import { createGatewayServer, GatewayServerBundle } from './gateway/server';
import { insertTranscriptEntry } from './gateway/db';
import { GatewaySocketManager } from './gateway/socket';
import { TranscriptEntry } from '@wellcall/shared-types';

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

  let sequenceCounter = 1;

  // TODO: remove this fake timer once callStateMachine drives real events
  setInterval(async () => {
    const fakeEntry: TranscriptEntry = {
      id: `tr-fake-${Date.now()}-${sequenceCounter}`,
      callId: 'call-demo-101',
      speaker: sequenceCounter % 2 === 1 ? 'system' : 'patient',
      text:
        sequenceCounter % 2 === 1
          ? 'Hello, this is Wellcall checking in on your recovery.'
          : 'My chest feels tight when I try to take deep breaths.',
      timestamp: new Date().toISOString(),
    };

    sequenceCounter++;

    // a) insert fake TranscriptEntry into DB via db.ts
    await insertTranscriptEntry(fakeEntry);

    // b) emit over transcript:new via singleton socket helper
    getSocketManager().emitTranscriptNew(fakeEntry);
  }, 5000);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('[orchestrator] Bootstrap error:', err);
    process.exit(1);
  });
}

export { bootstrap };
