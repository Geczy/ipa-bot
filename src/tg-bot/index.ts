import { dirname } from "path";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { CHAT_IDS, TOPIC_IDS, client } from "./client";
import MongoDB from "./lib/mongo";
import { MongoApp } from "./lib/types";
import { deleteSingleFile, deleteFilesMatchingPattern } from "./lib/utils";
import { startDecryption } from "./startDecryption";
import { uploadDecryptedFile } from "./uploadDecryptedFile";
import { Api } from "telegram";

let isProcessing = false;
const requestQueue: { trackId: string; message: Api.Message }[] = [];
const adminIds = process.env.ADMIN_IDS?.split(",") || [];

async function cleanUp(mongoDB?: MongoDB) {
  console.log("Cleaning up...");
  isProcessing = false;
  if (mongoDB) await mongoDB.close();
  processNextRequest();
}

async function processNextRequest() {
  if (requestQueue.length === 0) return;
  const nextRequest = requestQueue.shift();
  if (nextRequest) await handleAppRequest(nextRequest.message);
}

async function handleReboot(message: Api.Message) {
  const mongoDB = MongoDB.getInstance();
  await mongoDB.close();

  console.log(`${dirname(__dirname)}/ipa-files/decrypted/*`);
  await deleteFilesMatchingPattern(
    `${dirname(__dirname)}/ipa-files/decrypted/*`,
  );
  await deleteFilesMatchingPattern(
    `${dirname(__dirname)}/ipa-files/encrypted/*`,
  );

  const sendToChatId = message.chatId?.toString() as string;
  await client.sendMessage(sendToChatId, {
    message: "Done",
    replyTo: message,
  });
}

export async function handleDelete(message: Api.Message) {
  const sendToChatId = message.chatId?.toString() as string;
  const parsedUrl = parseAppStoreUrl(message.text);

  if (!parsedUrl.isValid) {
    await client.sendMessage(sendToChatId, {
      message: "❌ Invalid App Store URL.",
      replyTo: message,
    });
    await cleanUp();
    return;
  }

  const { trackId } = parsedUrl;

  if (trackId && trackId.length && trackId.length < 15) {
    const mongoDB = MongoDB.getInstance();
    await mongoDB.connect();
    const collection = mongoDB.getCollection("app_info_collection");

    if (!collection) {
      console.error("MongoDB collection not found");
      await cleanUp(mongoDB);
      return;
    }

    // Lookup the last document by trackId and delete it
    let appInfo = await collection.findOneAndDelete({ trackId });
    if (appInfo?.ok) {
      await client.sendMessage(sendToChatId, {
        message: `✅ Deleted app with trackId: ${trackId}`,
        replyTo: message,
      });
    } else {
      console.error(appInfo);
      await client.sendMessage(sendToChatId, {
        message: `❌ Failed to delete app with trackId: ${trackId}`,
        replyTo: message,
      });
    }
  }
}

function parseAppStoreUrl(url: string) {
  url = url.trim();

  if (url.startsWith("/request")) {
    const urlParts = url.trim().split(" ");
    if (urlParts.length < 2) {
      return { isValid: false };
    }

    url = urlParts[1].trim();
  } else if (!/apps\.apple\.com|itunes\.apple\.com/.test(url)) {
    return { isValid: false };
  }

  const idRegex = /\/id(\d+)/;
  const countryRegex = /apple\.com\/(\w\w)\//;

  const countryId = url.match(idRegex);
  const matchCountry = url.match(countryRegex);

  const trackId = countryId ? countryId[1] : "";
  const countryCode = matchCountry ? matchCountry[1] : "us";

  if (!(trackId && trackId.length && trackId.length < 15)) {
    return { isValid: false };
  }

  return { isValid: true, trackId, countryCode };
}

async function handleQueue(
  message: Api.Message,
  sendToChatId: string,
  trackId: string,
) {
  if (requestQueue.find((request) => request.trackId === trackId)) {
    await client.sendMessage(sendToChatId, {
      message: `⌛ That app is already in the queue. Please wait...`,
      replyTo: message,
    });
    return;
  }

  // Add the request to the queue if maximum limit not reached
  if (requestQueue.length >= 5) {
    await client.sendMessage(sendToChatId, {
      message: `⌛ Maximum request limit of 5 reached. Please try again later.`,
      replyTo: message,
    });
    return;
  }

  await client.sendMessage(sendToChatId, {
    message: `⏳ Your request has been added to the queue. Please wait...`,
    replyTo: message,
  });

  requestQueue.push({ trackId: trackId!, message });
  return;
}

async function findAppInfo(trackId: string) {
  const mongoDB = MongoDB.getInstance();
  await mongoDB.connect();
  const collection = mongoDB.getCollection("app_info_collection");

  if (!collection) {
    console.error("MongoDB collection not found");
    await cleanUp(mongoDB);
    return;
  }

  return await collection.findOne<MongoApp>({ trackId }, { sort: { _id: -1 } });
}

async function decryptAndDownloadApp(
  message: Api.Message,
  trackId: string,
  countryCode: string,
  sendTo: string,
) {
  console.log("Downloading app for trackId:", trackId);
  await startDecryption({
    message,
    trackId,
    countryCode,
    sendTo,
  });

  const appInfo = await findAppInfo(trackId);
  if (!appInfo) throw new Error("App not found after decryption");

  await uploadDecryptedFile(appInfo, message);
  return appInfo;
}

async function sendExistingFileMessage(
  appInfo: MongoApp,
  message: Api.Message,
) {
  const msgs = await client.getMessages(appInfo.chatId, {
    ids: [appInfo.fileId],
  });

  if (Array.isArray(msgs) && msgs.length && message.chat) {
    await client.sendMessage(message.chat, {
      message: msgs[0],
      replyTo: message,
    });
  } else {
    console.error("No message found for trackId:", appInfo.trackId);
  }
}

async function handleExistingAppInfo(appInfo: MongoApp, message: Api.Message) {
  if (!parseInt(`${appInfo.fileId || "0"}`, 10)) {
    console.log("File not found for trackId:", appInfo.trackId);
    await uploadDecryptedFile(appInfo, message);
  } else {
    console.log("File found for trackId:", appInfo.trackId);
    await sendExistingFileMessage(appInfo, message);
  }
}

async function handleAppRequest(message: Api.Message) {
  const sendToChatId = message.chatId?.toString() as string;
  const parsedUrl = parseAppStoreUrl(message.text);

  if (!parsedUrl.isValid) {
    await client.sendMessage(sendToChatId, {
      message: "❌ Invalid App Store URL.",
      replyTo: message,
    });
    await cleanUp();
    return;
  }

  const { trackId, countryCode } = parsedUrl;

  if (isProcessing) {
    await handleQueue(message, sendToChatId, trackId!);
    return;
  }

  isProcessing = true;

  let appInfo = await findAppInfo(trackId!);

  try {
    if (!appInfo) {
      appInfo = await decryptAndDownloadApp(
        message,
        trackId!,
        countryCode!,
        sendToChatId,
      );
    } else {
      await handleExistingAppInfo(appInfo, message);
    }
  } catch (error) {
    console.error("Error occurred:", error);
  }

  if (appInfo) {
    // Just double make sure files got cleaned up, in the event there's errors
    console.log(
      `${dirname(__dirname)}/ipa-files/decrypted/${appInfo.filename}`,
    );
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

  await cleanUp();
}

function isAuthorizedPrivateChat(event: NewMessageEvent) {
  return event.isPrivate && adminIds.includes(`${event.message.senderId}`);
}

function isAuthorizedGroupChat(event: NewMessageEvent) {
  const sendToChatId = event.message.chatId?.toString() as string;
  const isGroupChatAllowed =
    !event.isPrivate && CHAT_IDS.includes(sendToChatId);

  return isGroupChatAllowed && isAuthorizedGroupTopic(event);
}

function isAuthorizedAdmin(event: NewMessageEvent) {
  return event.chatId && adminIds.includes(`${event.message.senderId}`);
}

function isAuthorizedGroupTopic(event: NewMessageEvent) {
  const message = event.message;
  const topicId = message.replyToMsgId;
  const sendToChatId = message.chatId?.toString() as string;
  const index = CHAT_IDS.indexOf(sendToChatId);
  const allowedTopicId = parseInt(TOPIC_IDS[index], 10);

  if (topicId === undefined && allowedTopicId === 0) return true; // not a topic group
  return allowedTopicId === topicId;
}

async function handleRegularCommands(message: Api.Message) {
  if (
    message.text.startsWith("/request") ||
    /apps\.apple\.com|itunes\.apple\.com/.test(message.text)
  ) {
    handleAppRequest(message);
  }
}

async function handleAdminCommands(event: NewMessageEvent) {
  if (isAuthorizedAdmin(event)) {
    const { message } = event;
    if (message.text.startsWith("/reboot")) await handleReboot(message);
    if (message.text.startsWith("/delete")) await handleDelete(message);
  }
}

client.addEventHandler(async (event) => {
  if (isAuthorizedPrivateChat(event) || isAuthorizedGroupChat(event)) {
    await handleRegularCommands(event.message);
    await handleAdminCommands(event);
  }
}, new NewMessage());
