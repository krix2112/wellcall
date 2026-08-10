import twilio from 'twilio';
import { Escalation, Patient } from '@wellcall/shared-types';

/**
 * Dispatches an urgent SMS alert to the on-call nurse when a patient escalation occurs.
 * Does NOT throw errors under any circumstances to prevent crashing gateway escalation flow.
 */
export async function notifyNurseSMS(
  escalation: Escalation,
  patient: Patient
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const nurseTo = process.env.NURSE_PHONE_NUMBER;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

  if (
    !accountSid ||
    !authToken ||
    !nurseTo ||
    (!twilioPhone && !whatsappFrom) ||
    accountSid === 'your_twilio_account_sid_here' ||
    authToken === 'your_twilio_auth_token_here' ||
    nurseTo === 'your_nurse_phone_number_here'
  ) {
    console.warn(
      '[notifyNurseSMS] Twilio credentials or phone numbers missing/placeholder. Skipping live SMS dispatch.'
    );
    return;
  }

  const patientPhoneStr = patient.phone ? ` (Phone: ${patient.phone})` : '';
  const messageBody = `🚨 URGENT NURSE ALERT: High-risk escalation for patient "${patient.name}"${patientPhoneStr}.\n\nReason: ${escalation.reason}\nCall ID: ${escalation.callId}\nTimestamp: ${new Date(escalation.timestamp).toLocaleString()}`;

  // If TWILIO_WHATSAPP_FROM is explicitly set, format with whatsapp: prefix; otherwise send standard SMS
  const useWhatsApp = Boolean(whatsappFrom && whatsappFrom !== 'your_twilio_whatsapp_from_here');
  const from = useWhatsApp
    ? whatsappFrom!.startsWith('whatsapp:')
      ? whatsappFrom!
      : `whatsapp:${whatsappFrom}`
    : twilioPhone!;
  const to = useWhatsApp ? (nurseTo.startsWith('whatsapp:') ? nurseTo : `whatsapp:${nurseTo}`) : nurseTo;

  try {
    const client = twilio(accountSid, authToken);
    const result = await client.messages.create({
      body: messageBody,
      from,
      to,
    });
    console.log(`[notifyNurseSMS] SMS sent successfully. SID: ${result.sid}, Status: ${result.status}`);
  } catch (err) {
    console.error('[notifyNurseSMS] Error sending SMS via Twilio:', err);
    // Never rethrow — safe execution path guaranteed
  }
}
