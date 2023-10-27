import { spawn } from "child_process";
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

  const yarnProcess = spawn("yarn", [
    "up",
    trackId,
    countryCode,
    sendTo,
    `${message.replyToMsgId || ""}`,
  ]);

  yarnProcess.stdout.on("data", async (data: Buffer) => {
    const msgText = data.toString();
    const firstLine = msgText.split("\n")[0].trim();

    if (firstLine && containsAnySubstrings(msgText, emojis)) {
      processOutput += `${firstLine}\n`;
      await editMessage(sendTo, initialMessage.id, processOutput);
    }
  });

  return new Promise<string>((resolve, reject) => {
    yarnProcess.on("close", async () => {
      if (processOutput.includes("Starting IPA upload")) {
        await deleteMessage(sendTo, initialMessage.id);
        resolve(processOutput);
      } else {
        reject(new Error("Decryption process closed"));
      }
    });
  });
}
