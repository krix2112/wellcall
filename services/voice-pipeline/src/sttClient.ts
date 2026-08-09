/**
 * Speech-to-Text (STT) Client Stub: Deepgram Streaming
 */
export class STTClient {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
  }

  public async startStream(onTranscriptChunk: (text: string) => void): Promise<() => void> {
    if (!this.apiKey) {
      console.warn('[sttClient] Warning: DEEPGRAM_API_KEY is not set.');
    }
    console.log('[sttClient] Deepgram streaming session initialized.');
    return () => console.log('[sttClient] Stream closed.');
  }
}
