const fs = require('fs');
const path = require('path');
const { RimeClient } = require('../dist/rimeClient');

(async () => {
  try {
    const client = new RimeClient();
    const text = "Hey, just calling to check in — how are you feeling today?";
    console.log('[testRime] Calling Rime.speak with text:', text);
    const buf = await client.speak(text);
    const outDir = path.join(__dirname);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'test-rime-output.wav');
    fs.writeFileSync(outPath, buf);
    const stat = fs.statSync(outPath);
    console.log('[testRime] Wrote', outPath, 'size=', stat.size, 'bytes');
  } catch (e) {
    console.error('[testRime] Error', e);
    process.exitCode = 2;
  }
})();
