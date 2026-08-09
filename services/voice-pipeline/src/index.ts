import { createGatewayServer } from './gateway/server';
import { insertTranscriptEntry } from './gateway/db';
import { TranscriptEntry } from '@wellcall/shared-types';

async function bootstrap() {
  const gateway = createGatewayServer();
  await gateway.start();

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

    // b) emit over transcript:new via socket helper
    gateway.socketManager.emitTranscriptNew(fakeEntry);
  }, 5000);
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('[orchestrator] Bootstrap error:', err);
    process.exit(1);
  });
}

export { bootstrap };
