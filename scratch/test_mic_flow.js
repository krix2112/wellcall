const { io } = require('socket.io-client');

async function testMicFlow() {
  console.log('--- Testing /mic Flow ---');
  const socket = io('http://localhost:3001', { transports: ['websocket'] });

  const callId = `call-mic-${Date.now()}`;
  console.log(`[test] Emitting single voice:start for callId: ${callId}`);

  socket.on('connect', () => {
    console.log('[test] Connected to gateway socket:', socket.id);
    socket.emit('voice:start', { patientId: 'patient-01', callId });
  });

  socket.on('voice:response', ({ callId: cid, text }) => {
    console.log(`[test] Received voice:response for ${cid}: "${text}"`);
  });

  socket.on('voice:audio', ({ callId: cid, audio }) => {
    console.log(`[test] Received voice:audio buffer for ${cid}: ${audio?.byteLength || audio?.length} bytes`);
  });

  socket.on('call:status', ({ callId: cid, status }) => {
    console.log(`[test] Received call:status for ${cid}: ${status}`);
  });

  socket.on('escalation:new', (esc) => {
    console.log(`[test] Received escalation:new -> escId: ${esc.id}, callId: ${esc.callId}, reason: ${esc.reason}`);
  });

  // Wait 2 seconds, then send a sample patient utterance to trigger processing pipeline
  setTimeout(() => {
    console.log('[test] Simulating patient speech utterance: "I am having severe chest pain and short of breath"');
    socket.emit('voice:transcript', {
      callId,
      text: 'I am having severe chest pain and short of breath',
      isFinal: true,
    });
  }, 2500);

  setTimeout(() => {
    console.log('--- Test Complete. Closing Socket. ---');
    socket.close();
    process.exit(0);
  }, 8000);
}

testMicFlow();
