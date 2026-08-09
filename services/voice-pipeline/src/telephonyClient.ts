/**
 * Telephony Client Stub: WebRTC Browser-based Mic Call
 */
export class TelephonyClient {
  public async initiateWebRTCCall(patientId: string): Promise<string> {
    console.log(`[telephonyClient] Initiating WebRTC browser call for patient: ${patientId}`);
    return `call-webrtc-${Date.now()}`;
  }
}
