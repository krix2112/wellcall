import { io } from 'socket.io-client';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';

console.log(`[emitFakeEscalation] Connecting to gateway at ${GATEWAY_URL}...`);

const socket = io(GATEWAY_URL);

socket.on('connect', () => {
  console.log(`[emitFakeEscalation] Connected with socket ID: ${socket.id}`);

  const fakeEscalation = {
    id: `esc-demo-${Date.now()}`,
    callId: 'call-demo-101',
    patientId: 'patient-01',
    reason: "Patient's description matches a known high-risk pattern: 'Sudden chest tightness or heavy sternal pressure'",
    timestamp: new Date().toISOString(),
    acknowledged: false,
  };

  console.log('[emitFakeEscalation] Emitting escalation:new event:', fakeEscalation);
  socket.emit('escalation:test_trigger' as any, fakeEscalation);

  setTimeout(() => {
    socket.disconnect();
    process.exit(0);
  }, 1000);
});
