import { dirname } from "path";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { CHAT_IDS, TOPIC_IDS, client } from "./client";
import MongoDB from "./lib/mongo";
import { MongoApp } from "./lib/types";
import { deleteSingleFile, deleteFilesMatchingPattern } from "./lib/utils";
import { startDecryption } from "./startDecryption";
import { uploadDecryptedFile } from "./uploadDecryptedFile";
import { Api } from "telegram";

let isBusy = false;
const requestQueue: { trackId: string; message: Api.Message }[] = [];
const admins = process.env.ADMIN_IDS?.split(",") || [];

async function finished(mongoDB?: MongoDB) {
  console.log("Cleaning up...");

  // Reset states, get ready for next app
  isBusy = false;

  if (mongoDB) {
    // Close the MongoDB connection
    await mongoDB.close();
  }

  // Process next request in the queue
  if (requestQueue.length > 0) {
    const nextRequest = requestQueue.shift();
    if (nextRequest) {
      await handleRequest(nextRequest.message);
    }
  }
}

async function handleReboot(message: Api.Message) {
  const mongoDB = MongoDB.getInstance();
  await mongoDB.close();

  await deleteFilesMatchingPattern(
    `${dirname(__dirname)}/ipa-files/decrypted/*`,
  );
  await deleteFilesMatchingPattern(
    `${dirname(__dirname)}/ipa-files/encrypted/*`,
  );

  const sendTo = message.chatId?.toString() as string;
  await client.sendMessage(sendTo, {
    message: "Done",
    replyTo: message,
  });
}

export async function handleDelete(message: Api.Message) {
  const sendTo = message.chatId?.toString() as string;
  const urlParts = message.text.trim().split(" ");
  if (urlParts.length < 2 || !message.text.includes("apps.apple.com")) {
    await client.sendMessage(sendTo, {
      message: "❌ Invalid App Store URL.",
      replyTo: message,
    });
    return 1;
  }

  const url = urlParts[1].trim();
  const idRegex = /\/id(\d+)/;
  const match = url.match(idRegex);
  const trackId = match ? match[1] : null;

  if (trackId && trackId.length && trackId.length < 15) {
    const mongoDB = MongoDB.getInstance();
    await mongoDB.connect();

    // Access a collection
    const collection = mongoDB.getCollection("app_info_collection");

    // Should never happen
    if (!collection) {
      console.log("It happened??");
      await finished(mongoDB);
      return 1;
    }

    // Lookup the last document by trackId and delete it
    let appInfo = await collection.findOneAndDelete({ trackId });
    if (appInfo.ok) {
      await client.sendMessage(sendTo, {
        message: `✅ Deleted app with trackId: ${trackId}`,
        replyTo: message,
      });
    } else {
      await client.sendMessage(sendTo, {
        message: `❌ Failed to delete app with trackId: ${trackId}`,
        replyTo: message,
      });
    }
  }
}

async function handleRequest(message: Api.Message) {
  const sendTo = message.chatId?.toString() as string;
  const urlParts = message.text.trim().split(" ");
  if (
    urlParts.length < 2 ||
    !/apps\.apple\.com|itunes\.apple\.com/.test(message.text)
  ) {
    await client.sendMessage(sendTo, {
      message: "❌ Invalid App Store URL.",
      replyTo: message,
    });
    await finished();
    return 1;
  }

  const url = urlParts[1].trim();

  const idRegex = /\/id(\d+)/;
  const countryRegex = /apple\.com\/(\w\w)\//;

  const countryId = url.match(idRegex);
  const matchCountry = url.match(countryRegex);

  const trackId = countryId ? countryId[1] : "";
  const countryCode = matchCountry ? matchCountry[1] : "us";

  if (!(trackId && trackId.length && trackId.length < 15)) {
    await client.sendMessage(sendTo, {
      message: "❌ Invalid App Store URL.",
      replyTo: message,
    });
    await finished();
    return 1;
  }

  if (isBusy) {
    if (requestQueue.find((request) => request.trackId === trackId)) {
      await client.sendMessage(sendTo, {
        message: `⌛ That app is already in the queue. Please wait...`,
        replyTo: message,
      });
      return;
    }

    // Add the request to the queue if maximum limit not reached
    if (requestQueue.length >= 5) {
      await client.sendMessage(sendTo, {
        message: `⌛ Maximum request limit of 5 reached. Please try again later.`,
        replyTo: message,
      });
      return;
    }

    await client.sendMessage(sendTo, {
      message: `⏳ Your request has been added to the queue. Please wait...`,
      replyTo: message,
    });

    requestQueue.push({ trackId, message });
    return;
  }

  isBusy = true;

  const mongoDB = MongoDB.getInstance();
  await mongoDB.connect();

  // Access a collection
  const collection = mongoDB.getCollection("app_info_collection");

  // Should never happen
  if (!collection) {
    console.log("It happened??");
    await finished(mongoDB);
    return 1;
  }

  // Lookup the last document by trackId
  let appInfo = await collection.findOne<MongoApp>(
    { trackId },
    { sort: { _id: -1 } },
  );

  try {
    if (!appInfo) {
      console.log("Downloading app for trackId:", trackId);
      await startDecryption({ message, trackId, countryCode, sendTo });

      // Lookup the app we just decrypted by trackId
      appInfo = await collection.findOne<MongoApp>(
        { trackId },
        { sort: { _id: -1 } },
      );

      // TODO: Safe to ignore?
      if (!appInfo) {
        console.log("Not safe to ignore lol");
        // Should never reach here but decided to add this just in case
        console.error("No app found still for trackId:", trackId);
        await finished(mongoDB);
        return 1;
      }

      await uploadDecryptedFile(appInfo, message);
    } else if (!parseInt(`${appInfo.fileId || "0"}`, 10)) {
      console.log("No file found for trackId:", trackId);
      await uploadDecryptedFile(appInfo, message);
    } else {
      console.log("File found for trackId:", trackId);
      const msgs = await client.getMessages(appInfo.chatId, {
        ids: [appInfo.fileId],
      });

      if (Array.isArray(msgs) && msgs.length && message.chat) {
        await client.sendMessage(message.chat, {
          message: msgs[0],
          replyTo: message,
        });
      } else {
        console.error("No message found for trackId:", trackId);
      }
    }
  } catch (error) {
    console.error("Error occurred:", error);
  } finally {
    if (appInfo) {
      // Just double make sure its all removed, in the event there's errors
      const decrypted = `${dirname(__dirname)}/ipa-files/decrypted/${
        appInfo.filename
      }`;
      await deleteSingleFile(decrypted);

      // Could not be downloaded
      // This one is the bundle id with a wildcard, since we don't know the exact filename
      const encrypted = `${dirname(__dirname)}/ipa-files/encrypted/${
        appInfo.bundleId
      }*`;
      await deleteFilesMatchingPattern(encrypted);
    }

    await finished(mongoDB);
  }
}

client.addEventHandler(async (event) => {
  const message = event.message;
  const sendTo = message.chatId?.toString() as string;

  if (event.isPrivate && !admins.includes(`${event.message.senderId}`)) return;
  if (!event.isPrivate && !CHAT_IDS.includes(sendTo)) return 1;

  // Lock down to certain topicId's
  const topicId = message.replyToMsgId;
  const index = CHAT_IDS.indexOf(sendTo);
  if (parseInt(TOPIC_IDS[index], 10) && TOPIC_IDS[index] !== `${topicId}`) {
    console.error("Unauthorized topicId");
    return 1;
  }

  if (message.text.startsWith("/request")) handleRequest(message);

  // Admin commands
  if (!event.chatId || !admins.includes(`${message.senderId}`)) return;
  if (message.text.startsWith("/reboot")) handleReboot(message);
  if (message.text.startsWith("/delete")) handleDelete(message);
}, new NewMessage());
