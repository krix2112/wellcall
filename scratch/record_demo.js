const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

async function main() {
  const videoDir = path.resolve(__dirname, 'video_output');
  if (!fs.existsSync(videoDir)) fs.mkdirSync(videoDir, { recursive: true });

  console.log('[recorder] Launching Google Chrome with video recording...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const context = await browser.newContext({
    recordVideo: {
      dir: videoDir,
      size: { width: 1280, height: 720 },
    },
    viewport: { width: 1280, height: 720 },
  });

  const page = await context.newPage();

  console.log('[recorder] Navigating to http://localhost:3000/mic...');
  await page.goto('http://localhost:3000/mic');
  await page.waitForTimeout(3000);

  console.log('[recorder] Clicking Start Recording button if present...');
  const startBtn = await page.$('#btn-start-recording');
  if (startBtn) {
    await startBtn.click();
    console.log('[recorder] Clicked Start Recording');
  }

  await page.waitForTimeout(4000);

  console.log('[recorder] Navigating to dashboard home http://localhost:3000...');
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(3000);

  console.log('[recorder] Navigating to audit page http://localhost:3000/audit...');
  await page.goto('http://localhost:3000/audit');
  await page.waitForTimeout(3000);

  console.log('[recorder] Closing browser to finalize video file...');
  await context.close();
  await browser.close();

  const files = fs.readdirSync(videoDir);
  console.log('[recorder] Recorded video files:', files);

  if (files.length > 0) {
    const srcVideo = path.join(videoDir, files[0]);
    const targetVideo = path.resolve(__dirname, '../demo-recording.mp4');
    fs.copyFileSync(srcVideo, targetVideo);
    console.log('[recorder] SUCCESS! Recorded video saved to:', targetVideo, 'Size:', fs.statSync(targetVideo).size, 'bytes');
  }
}

main().catch((err) => console.error('[recorder] Error:', err));
