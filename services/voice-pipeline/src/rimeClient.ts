/**
 * Rime TTS Client: Coda Voice Synthesis
 *
 * NOTE: Rime Coda accepts plain text only for prosody (commas, periods, question marks).
 * Do NOT pass or generate SSML or other markup (e.g. <speak>, <break>) — the service
 * will not interpret SSML and passing markup may produce unexpected output. Keep text
 * plain and punctuation-driven.
 */
export class RimeClient {
  private apiKey: string;
  private speaker: string;
  // promise queue ensures speak calls are executed sequentially
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    this.apiKey = process.env.RIME_API_KEY || '';
    this.speaker = process.env.RIME_SPEAKER || 'celeste';
  }

  public async speak(text: string): Promise<Buffer> {
    // disallow SSML/markup
    if (/<[^>]+>/.test(text)) {
      throw new Error('SSML/markup not allowed: Rime Coda accepts plain text only.');
    }

    if (!this.apiKey) {
      console.warn('[rimeClient] Warning: RIME_API_KEY is not set.');
    }

    const doFetch = async (): Promise<Buffer> => {
      const url = 'https://users.rime.ai/v1/rime-tts';
      const body = { speaker: this.speaker, text, modelId: 'coda' };
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Accept': 'audio/wav' };
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;

      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!res.ok) {
        const txt = await res.text().catch(() => '<no body>');
        throw new Error(`[rimeClient] Rime TTS error ${res.status}: ${txt}`);
      }
      const ab = await res.arrayBuffer();
      return Buffer.from(ab);
    };

    // enqueue and preserve return value for this call
    const exec = this.queue.then(() => doFetch());
    // update queue to continue after this call (swallow errors so queue continues)
    this.queue = exec.then(() => undefined).catch(() => undefined);
    return exec;
  }
}
