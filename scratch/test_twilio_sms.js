const fs = require('fs');
const path = require('path');
const twilio = require(path.resolve(__dirname, '../node_modules/.pnpm/twilio@5.13.1/node_modules/twilio'));

// Load .env manually
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

async function testSMS() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const nurseTo = process.env.NURSE_PHONE_NUMBER;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  console.log('Testing Twilio Plain SMS (without WhatsApp prefix):');
  console.log('AccountSid:', accountSid);
  console.log('From:', twilioPhone);
  console.log('To:', nurseTo);

  try {
    const client = twilio(accountSid, authToken);
    const result = await client.messages.create({
      body: '🚨 TEST NURSE ALERT: High-risk escalation test for patient Jane Smith.',
      from: twilioPhone,
      to: nurseTo,
    });
    console.log(`✅ SUCCESS! SMS sent successfully. SID: ${result.sid}, Status: ${result.status}`);
  } catch (err) {
    console.error('❌ FAILED! Error sending SMS via Twilio:', err.message, 'Code:', err.code);
  }
}

testSMS();
