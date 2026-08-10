/**
 * Deepgram STT Client — rewritten for @deepgram/sdk v3 (createClient API)
 * - startStream(onTranscriptChunk) returns a stop() function
 * - sendAudioChunk(chunk) pushes raw audio into the live connection
 */

type TranscriptCallback = (text: string, isFinal: boolean) => void;

export class STTClient {
  private apiKey: string;
  private sampleRate: number;
  private liveConnection: any | null = null;
  private pendingAudioChunks: Buffer[] = [];
  private connectionOpen = false;
  private finalized = false;

  constructor(options?: { sampleRate?: number }) {
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
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
    if (!this.apiKey) {
      throw new Error('[sttClient] DEEPGRAM_API_KEY not set in environment');
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');
    const client = createClient(this.apiKey);

    const live = client.listen.live({
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

    live.on(LiveTranscriptionEvents.Open, () => {
      console.log('[sttClient] Deepgram streaming session open.');
      this.connectionOpen = true;
      // Flush any audio buffered before open
      const queued = this.pendingAudioChunks.splice(0);
      for (const buf of queued) {
        try { live.send(buf); } catch { /* ignore */ }
      }
    });

    live.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const alt = data?.channel?.alternatives?.[0];
      const text: string = (alt?.transcript ?? '').trim();
      const isFinal: boolean = data.is_final === true;
      if (text) {
        try { onTranscriptChunk(text, isFinal); } catch { /* ignore */ }
      }
    });

    live.on(LiveTranscriptionEvents.Error, (err: any) => {
      console.error('[sttClient] Deepgram error:', err?.message ?? err);
    });

    live.on(LiveTranscriptionEvents.Close, () => {
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
