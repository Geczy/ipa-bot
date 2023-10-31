import { Api } from "telegram";
import { client } from "./client";
import { emojis } from "./lib/globals";
import { containsAnySubstrings } from "./lib/utils";

async function editMessage(sendTo: string, messageId: number, text: string) {
  await client.editMessage(sendTo, {
    message: messageId,
    parseMode: "md",
    text,
  });
}

async function deleteMessage(sendTo: string, messageId: number) {
  try {
    await client.deleteMessages(sendTo, [messageId], {});
  } catch (error) {
    console.log(error);
  }
}

export async function startDecryption({
  message,
  trackId,
  countryCode,
  sendTo,
}: {
  message: Api.Message;
  trackId: string;
  countryCode: string;
  sendTo: string;
}) {
  let processOutput = "";

  const initialMessage = await client.sendMessage(sendTo, {
    message: `♻️ Initializing bot...`,
    replyTo: message,
  });

  console.log(Bun.version);

  // log the command we are spawnning
  console.log(`yarn up ${trackId} ${countryCode} ${sendTo}`);

  const proc = Bun.spawn(
    [
      "yarn",
      "up",
      trackId,
      countryCode,
      sendTo,
      `${message.replyToMsgId || ""}`,
    ],
    {
      onExit(proc, exitCode, signalCode, error) {
        if (processOutput.includes("Starting IPA upload")) {
          deleteMessage(sendTo, initialMessage.id);
        } else {
          console.error(processOutput);
        }
      },
    },
  );

  // Use async iterator to read from stdout
  for await (const chunk of proc.stdout) {
    const msgText = new TextDecoder().decode(chunk);
    const firstLine = msgText.split("\n")[0].trim();

    if (firstLine && containsAnySubstrings(msgText, emojis)) {
      processOutput += `${firstLine}\n`;
      await editMessage(sendTo, initialMessage.id, processOutput);
    }
  }
}
