/**
 * Telephony Client Stub: simple EventEmitter-based interface used by demo
 */
import { EventEmitter } from 'events';

export class TelephonyClient extends EventEmitter {
  constructor() {
    super();
  }

  public startServer(): void {
    console.log('[telephonyClient] Telephony server (stub) started');
  }

  public async initiateWebRTCCall(patientId: string): Promise<string> {
    console.log(`[telephonyClient] Initiating WebRTC browser call for patient: ${patientId}`);
    return `call-webrtc-${Date.now()}`;
  }
}
