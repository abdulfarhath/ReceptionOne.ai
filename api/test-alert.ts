import { TwilioWhatsAppChannelAdapter } from "./src/messaging/twilio-channel.js";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !fromPhone) {
    console.error("❌ Twilio environment variables are missing in .env.");
    process.exit(1);
  }

  const channel = new TwilioWhatsAppChannelAdapter({
    accountSid,
    authToken,
    from: fromPhone,
  });

  const targetPhone = "+918977287230";

  try {
    console.log(`Sending manual test alert to ${targetPhone}...`);
    await channel.sendText(
      targetPhone,
      `🚨 Test Alert: Hi, this is a direct test message to verify your WhatsApp integration!`
    );
    console.log(`🎉 Message sent successfully to ${targetPhone}! Check your WhatsApp.`);
  } catch (err) {
    console.error("❌ Failed to send message:", err);
  }
}

main();
