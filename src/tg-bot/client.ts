import { TelegramClient } from "telegram";
import { StoreSession } from "telegram/sessions";

const envVars = [
  "TELEGRAM_API_ID",
  "TELEGRAM_API_HASH",
  "TELEGRAM_BOT_TOKEN",
  "MONGODB_URL",
  "CHAT_IDS",
  "TOPIC_IDS",
];
const missingEnvVars = envVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`Missing environment variables: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const apiId = parseInt(process.env.TELEGRAM_API_ID!, 10);
const apiHash = process.env.TELEGRAM_API_HASH!;
const botToken = process.env.TELEGRAM_BOT_TOKEN!;
const mongoDbUrl = process.env.MONGODB_URL!;
const chatIds = process.env.CHAT_IDS!.split(",");
const topicIds = process.env.TOPIC_IDS!.split(",");

const session = new StoreSession("iosqueuebot_session");
const client = new TelegramClient(session, apiId, apiHash, {
  connectionRetries: 5,
});

(async () => {
  await client.start({
    botAuthToken: botToken,
    onError: (err) => console.log(err),
  });
  if (!client.connected) await client.connect();
})();

export {
  client,
  chatIds as CHAT_IDS,
  topicIds as TOPIC_IDS,
  mongoDbUrl as MONGODB_URL,
};
