/**
 * Deepgram STT Client — using @deepgram/sdk@1.21.0 Deepgram constructor
 * - startStream(onTranscriptChunk) returns a stop() function
 * - sendAudioChunk(chunk) pushes raw audio into the live connection
 */

type TranscriptCallback = (text: string, isFinal: boolean) => void;

let _deepgramClientInstance: any = null;

/**
 * Returns a singleton Deepgram SDK client instance reused across the application
 */
export function getDeepgramClient(): any {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey || apiKey === 'your_deepgram_api_key_here') {
    throw new Error('[sttClient] DEEPGRAM_API_KEY is missing or placeholder in environment');
  }

  if (!_deepgramClientInstance) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Deepgram } = require('@deepgram/sdk');
    _deepgramClientInstance = new Deepgram(apiKey);
  }
  return _deepgramClientInstance;
}

export class STTClient {
  private sampleRate: number;
  private liveConnection: any | null = null;
  private pendingAudioChunks: Buffer[] = [];
  private connectionOpen = false;
  private finalized = false;

  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? 16000;
  }

  public sendAudioChunk(chunk: Buffer): void {
    if (!this.liveConnection || !this.connectionOpen || this.finalized) {
      this.pendingAudioChunks.push(Buffer.from(chunk));
      return;
    }
    try {
      this.liveConnection.send(chunk);
    } catch (e) {
      console.error('[sttClient] Failed to send audio chunk', e);
    }
  }

  public async startStream(onTranscriptChunk: TranscriptCallback): Promise<() => void> {
    const dg = getDeepgramClient();

    const live = dg.transcription.live({
      model: 'nova-2',
      encoding: 'linear16',
      sample_rate: this.sampleRate,
      channels: 1,
      language: 'en-US',
      interim_results: true,
      smart_format: true,
      utterance_end_ms: 1500,
      vad_events: true,
    });

    this.liveConnection = live;
    this.connectionOpen = false;
    this.finalized = false;

    live.on('open', () => {
      console.log('[sttClient] Deepgram streaming session open.');
      this.connectionOpen = true;
      const queued = this.pendingAudioChunks.splice(0);
      for (const buf of queued) {
        try { live.send(buf); } catch { /* ignore */ }
      }
    });

    live.on('transcriptReceived', (raw: any) => {
      let payload: any = raw;
      if (typeof raw === 'string') {
        try { payload = JSON.parse(raw); } catch { /* ignore */ }
      } else if (raw && typeof raw.data === 'string') {
        try { payload = JSON.parse(raw.data); } catch { payload = raw; }
      }

      const alt = payload?.channel?.alternatives?.[0];
      const text: string = (alt?.transcript ?? '').trim();
      const isFinal: boolean = payload?.is_final === true;
      if (text) {
        try { onTranscriptChunk(text, isFinal); } catch { /* ignore */ }
      }
    });

    live.on('error', (err: any) => {
      console.error('[sttClient] Deepgram error:', err?.message ?? err);
    });

    live.on('close', () => {
      console.log('[sttClient] Deepgram connection closed.');
      this.connectionOpen = false;
    });

    const stop = () => {
      if (this.finalized) return;
      this.finalized = true;
      try { live.finish(); } catch { /* ignore */ }
      this.liveConnection = null;
      this.connectionOpen = false;
    };

    return stop;
  }
}
