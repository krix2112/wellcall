/**
 * Deepgram STT Client
 * - Uses @deepgram/sdk transcription.live() to create a live websocket-style connection
 * - startStream(onTranscriptChunk) returns a stop() function
 * - sendAudioChunk(chunk) pushes raw audio into the live connection
 */
import EventEmitter from 'events';
import querystring from 'querystring';

type TranscriptCallback = (text: string, isFinal: boolean) => void;

export class STTClient {
  private apiKey: string;
  private sampleRate: number;
  private dg: any | null = null;
  private liveConnection: any | null = null;
  private emitter: EventEmitter | null = null;
  private reconnectAttempts = 1;
  private pendingAudioChunks: Buffer[] = [];
  private connectionOpen = false;

  constructor(options?: { sampleRate?: number }) {
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
    this.sampleRate = options?.sampleRate ?? 16000;
  }

  public sendAudioChunk(chunk: Buffer): void {
    if (!this.liveConnection || !this.connectionOpen) {
      this.pendingAudioChunks.push(Buffer.from(chunk));
      console.warn('[sttClient] sendAudioChunk buffered until Deepgram connection opens');
      return;
    }

    try {
      if (typeof this.liveConnection.send === 'function') {
        this.liveConnection.send(chunk);
      } else if (typeof this.liveConnection.sendAudio === 'function') {
        this.liveConnection.sendAudio(chunk);
      } else if (typeof this.liveConnection.write === 'function') {
        // some SDKs expose a write
        this.liveConnection.write(chunk);
      } else {
        console.warn('[sttClient] liveConnection has no send/sendAudio/write method');
      }
    } catch (e) {
      console.error('[sttClient] Failed to send audio chunk', e);
    }
  }

  public async startStream(onTranscriptChunk: TranscriptCallback): Promise<() => void> {
    if (!this.apiKey) {
      throw new Error('[sttClient] DEEPGRAM_API_KEY not set in environment');
    }

    // Load SDK dynamically to avoid hard dependency at build-time errors
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sdk = require('@deepgram/sdk');
      this.dg = sdk && sdk.Deepgram ? new sdk.Deepgram(this.apiKey) : null;
    } catch (e) {
      throw new Error('[sttClient] @deepgram/sdk is required but not installed');
    }

    if (!this.dg) throw new Error('[sttClient] Failed to initialize Deepgram SDK');

    const keyterms = [
      'chest pain',
      'shortness of breath',
      'fever',
      'dizziness',
      'swelling',
      'nausea',
      'medication',
      'incision',
    ];

    const options: any = {
      model: 'nova-3',
      encoding: 'linear16',
      sample_rate: this.sampleRate,
      channels: 1,
      language: 'en-US',
      interim_results: true,
      smart_format: true,
      keyterm: keyterms,
    };

    const debugUrl = `wss://api.deepgram.com/v1/listen?${querystring.stringify(options)}`;
    console.log('[sttClient] Deepgram live URL:', debugUrl);

    this.emitter = new EventEmitter();

    const connectOnce = async (): Promise<void> => {
      // create live connection via SDK
      let live: any = null;
      try {
        live = (this.dg as any).transcription?.live?.(options);
      } catch (e) {
        throw new Error('[sttClient] Deepgram SDK failed to create live transcription connection: ' + String(e));
      }

      if (!live) throw new Error('[sttClient] Deepgram SDK did not return a live connection');

      this.liveConnection = live;

      // attach events — SDK live connection should emit 'open','message','close','error'
      const onOpen = () => {
        console.log('[sttClient] Deepgram streaming session initialized (open).');
        this.connectionOpen = true;
        const queued = this.pendingAudioChunks.splice(0, this.pendingAudioChunks.length);
        for (const pendingChunk of queued) {
          try {
            if (typeof this.liveConnection?.send === 'function') {
              this.liveConnection.send(pendingChunk);
            } else if (typeof this.liveConnection?.sendAudio === 'function') {
              this.liveConnection.sendAudio(pendingChunk);
            } else if (typeof this.liveConnection?.write === 'function') {
              this.liveConnection.write(pendingChunk);
            }
          } catch (e) {
            console.error('[sttClient] Failed to flush buffered audio chunk', e);
          }
        }
      };

      const onMessage = (raw: any) => {
        // Raw payload may be string or object; ensure parsed JSON when necessary
        let payload: any = raw;
        if (typeof raw === 'string') {
          try {
            payload = JSON.parse(raw);
          } catch (e) {
            // sometimes SDK wraps JSON in an object with 'data'
            try {
              const asStr = raw.toString();
              payload = JSON.parse(asStr);
            } catch (_) {
              return;
            }
          }
        } else if (Buffer.isBuffer(raw)) {
          try {
            payload = JSON.parse(raw.toString());
          } catch (e) {
            return;
          }
        } else if (raw && typeof raw === 'object' && typeof raw.data === 'string') {
          try {
            payload = JSON.parse(raw.data);
          } catch (_) {
            payload = raw;
          }
        }

        // Defensive: extract transcript
        let transcript = '';
        let isFinal = false;

        try {
          if (payload?.channel?.alternatives && payload.channel.alternatives.length > 0) {
            transcript = payload.channel.alternatives[0].transcript || '';
            isFinal = Boolean(payload.is_final ?? payload.isFinal ?? false);
          } else if (payload?.results && Array.isArray(payload.results) && payload.results[0]?.alternatives) {
            transcript = payload.results[0].alternatives[0]?.transcript || '';
            isFinal = Boolean(payload.results[0]?.is_final ?? false);
          } else if (payload?.alternatives && Array.isArray(payload.alternatives)) {
            transcript = payload.alternatives[0]?.transcript || '';
          } else if (typeof payload?.transcript === 'string') {
            transcript = payload.transcript;
          }
        } catch (e) {
          // ignore parsing errors
        }

        if (transcript && transcript.trim().length > 0) {
          try {
            onTranscriptChunk(transcript.trim(), Boolean(isFinal));
          } catch (e) {
            console.error('[sttClient] onTranscriptChunk callback threw', e);
          }
        }
      };

      const onClose = (info: any) => {
        console.warn('[sttClient] Deepgram connection closed', info);
        this.connectionOpen = false;
        if (this.reconnectAttempts > 0) {
          this.reconnectAttempts -= 1;
          console.log('[sttClient] attempting one reconnect');
          // attempt reconnect
          connectOnce().catch((e) => console.error('[sttClient] reconnect failed', e));
        } else {
          console.error('[sttClient] no reconnects left');
        }
      };

      const onError = (err: any) => {
        console.error('[sttClient] Deepgram connection error', err && err.message ? err.message : err);
      };

      // bind handlers
      try {
        if (typeof live.on === 'function') {
          live.on('open', onOpen);
          live.on('message', onMessage);
          live.on('close', onClose);
          live.on('error', onError);
        } else if (typeof live.addEventListener === 'function') {
          live.addEventListener('open', onOpen);
          live.addEventListener('message', (ev: any) => onMessage(ev?.data ?? ev));
          live.addEventListener('close', onClose);
          live.addEventListener('error', onError);
        } else {
          console.warn('[sttClient] live connection has no event API');
        }
      } catch (e) {
        console.warn('[sttClient] failed attaching live handlers', e);
      }
    };

    await connectOnce();

    const stop = async () => {
      try {
        if (this.liveConnection) {
          if (typeof this.liveConnection.close === 'function') this.liveConnection.close();
          else if (typeof this.liveConnection.end === 'function') this.liveConnection.end();
        }
      } catch (e) {
        // ignore
      }
      this.liveConnection = null;
    };

    return stop;
  }
}
