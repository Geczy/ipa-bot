import { spawn } from "child_process";
import { Api } from "telegram";
import { client } from "./client";
import { emojis } from "./lib/globals";
import { stringContainsArray } from "./stringContainsArray";

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
  let output = "";

  return new Promise(async (resolve, reject) => {
    // Initial message just to get an id
    const sending = await client.sendMessage(sendTo, {
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
      console.log(data.toString());

      // save just the first line of msg in case yarn piggy backs
      const msg = data.toString().split("\n")[0].trim();
      if (!msg.length) return;
      if (!stringContainsArray(data.toString(), emojis)) return;

      output += `${msg}\n`;
      await client.editMessage(sendTo, {
        message: sending.id,
        parseMode: "md",
        text: output,
      });
    });

    yarnProcess.on("close", async () => {
      if (output.includes("Starting IPA upload")) {
        try {
          await client.deleteMessages(sendTo, [sending.id], {});
        } catch (e) {
          console.log(e);
        }

        resolve(output);
        return;
      }

      // Reject the Promise if the process is closed without finding the desired string
      reject("Decryption process closed");
    });
  });
}
