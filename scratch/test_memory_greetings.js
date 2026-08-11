const fs = require('fs');
const path = require('path');

// Load environment variables from .env to match gateway server (Qdrant Cloud)
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf-8');
  envConfig.split('\n').forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const io = require('socket.io-client');
const { setMemory } = require('../services/qdrant-memory/dist/sessionMemory');

const SOCKET_URL = 'http://localhost:3001';

async function runTest() {
  console.log('=== STARTING MEMORY-AWARE GREETING VERIFICATION TEST ===\n');

  // TEST 3: Fresh patient with zero memory (patient-03: Robert)
  console.log('--- TEST 3: Fresh patient with zero memory (patient-03: Robert) ---');
  const robGreeting = await testVoiceStart('patient-03', 'Robert');
  console.log(`RECEIVED: "${robGreeting}"`);

  // TEST 1: Seed a symptom memory for patient-02 (Jane)
  console.log('\n--- TEST 1: Seed a symptom memory for patient-02 (Jane) ---');
  const mem = await setMemory(
    'patient-02',
    'call-test-101',
    'Jane reported mild chest tightness during post-discharge check-in. Routine follow-up logged.',
    'symptom',
    false // wasEscalated: false
  );
  console.log(`[MEMORY CREATED] ID: ${mem.id}, Category: ${mem.category}, Escalated: ${mem.wasEscalated}`);

  // TEST 2: Second call for patient-02 (Jane) — expecting memory greeting
  console.log('\n--- TEST 2: Second call for patient-02 (Jane) — expecting memory greeting ---');
  const janeGreeting = await testVoiceStart('patient-02', 'Jane');
  console.log(`RECEIVED: "${janeGreeting}"`);

  // TEST 4: Seed an escalated memory for patient-01 (John)
  console.log('\n--- TEST 4: Seed an escalated memory for patient-01 (John) ---');
  const escMem = await setMemory(
    'patient-01',
    'call-test-102',
    'John reported severe chest tightness — ESCALATED: Red flag matched.',
    'symptom',
    true // wasEscalated: true
  );
  console.log(`[MEMORY CREATED] ID: ${escMem.id}, Category: ${escMem.category}, Escalated: ${escMem.wasEscalated}`);

  const johnGreeting = await testVoiceStart('patient-01', 'John');
  console.log(`RECEIVED: "${johnGreeting}"`);

  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}

function testVoiceStart(patientId, expectedFirstName) {
  return new Promise((resolve) => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] });
    const callId = `call-test-vs-${Date.now()}`;

    socket.on('connect', () => {
      socket.emit('voice:start', { patientId, callId });
    });

    socket.on('voice:response', ({ text }) => {
      socket.disconnect();
      resolve(text);
    });

    setTimeout(() => {
      console.warn(`[TIMEOUT] No greeting received for ${patientId}`);
      socket.disconnect();
      resolve(null);
    }, 5000);
  });
}

runTest();
