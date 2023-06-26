import "dotenv/config";
import { TelegramClient } from "telegram";
import { StoreSession } from "telegram/sessions";

const apiId = parseInt(process.env.TELEGRAM_API_ID!, 10);
const apiHash = process.env.TELEGRAM_API_HASH;
const botAuthToken = process.env.TELEGRAM_BOT_TOKEN;
const MONGODB_URL = process.env.MONGODB_URL!;

if (!MONGODB_URL) {
  console.error("Missing MONGODB_URL");
  process.exit(1);
}

const CHAT_IDS = (process.env.CHAT_IDS as string).split(",");
const TOPIC_IDS = (process.env.TOPIC_IDS as string).split(",");

if (!CHAT_IDS || !Array.isArray(CHAT_IDS) || CHAT_IDS.length === 0) {
  console.error("Missing CHAT_IDS");
  process.exit(1);
}

if (!apiId || !apiHash || !botAuthToken) {
  console.error("Missing environment variables");
  process.exit(1);
}

const client = new TelegramClient(
  new StoreSession("iosqueuebot_session"),
  apiId,
  apiHash,
  { connectionRetries: 5 }
);

(async () => {
  await client.start({
    botAuthToken,
    onError: (err) => console.log(err),
  });
  if (!client.connected) await client.connect();
})();

export { client, CHAT_IDS, TOPIC_IDS, MONGODB_URL };
