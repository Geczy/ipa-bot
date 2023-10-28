import axios from "axios";
import { statSync } from "fs";
import { dirname } from "path";
import sharp, { OutputInfo } from "sharp";
import { Api } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { Button } from "telegram/tl/custom/button";
import { client } from "./client";
import MongoDB from "./lib/mongo";
import { MongoApp } from "./lib/types";
import { handleDelete } from ".";

async function fetchArtwork(url: string): Promise<Buffer> {
  const response = await axios.get(url, { responseType: "arraybuffer" });
  return response.data;
}

async function createThumbnail(imageBuffer: Buffer) {
  return await sharp(imageBuffer)
    .resize({ width: 150, height: 150 })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer({ resolveWithObject: true });
}

function buildAttributes(
  trackName: string,
  version: string,
  thumbnailInfo: OutputInfo,
) {
  return [
    new Api.DocumentAttributeFilename({
      fileName: `${trackName} ${version}.ipa`,
    }),
    new Api.DocumentAttributeVideo({
      roundMessage: true,
      duration: 0,
      w: thumbnailInfo.width,
      h: thumbnailInfo.height,
    }),
  ];
}

function buildCaption(
  releaseDate: string,
  version: string,
  releaseNotes: string,
  maxCaptionLength = 500,
): string {
  const dateObj = new Date(releaseDate);
  const formattedDate = dateObj.toISOString().split("T")[0];
  let caption = `**Release Notes**\n${formattedDate} · ${version}\n${releaseNotes}`;
  return caption.length > maxCaptionLength
    ? `${caption.substring(0, maxCaptionLength)}...`
    : caption;
}
async function handleUploadError(
  chatId: MongoApp["chatId"],
  trackName: string,
  version: string,
  messageResponse: Api.Message,
  originalMessage: Api.Message,
) {
  await client.editMessage(chatId, {
    message: messageResponse.id,
    text: `Uploading ${trackName} ${version} has failed`,
  });
  await handleDelete(originalMessage);
}

async function uploadFileWithProgress(
  chatId: MongoApp["chatId"],
  toUpload: CustomFile,
  replyToMsgId: number,
  markup: Api.TypeReplyMarkup | undefined,
  caption: string,
  trackName: MongoApp["trackName"],
  version: MongoApp["version"],
  thumbnailData: Buffer,
  attributes: (Api.DocumentAttributeFilename | Api.DocumentAttributeVideo)[],
  messageId: number,
) {
  let timeoutInProgress = false;
  let previousProgress = 0;
  return await client.sendFile(chatId, {
    replyTo: replyToMsgId,
    forceDocument: true,
    caption,
    buttons: markup,
    progressCallback: (progress) => {
      const roundedProgress = Math.round(progress * 100);
      if (!timeoutInProgress && roundedProgress !== previousProgress) {
        timeoutInProgress = true;
        previousProgress = roundedProgress;
        setTimeout(async () => {
          try {
            await client.editMessage(chatId, {
              message: messageId,
              parseMode: "md",
              text: `Uploading ${trackName} ${version} - ${roundedProgress}%`,
            });
          } catch (e) {
            // Could be finished uploading so nothing to edit anymore
          }
          timeoutInProgress = false;
        }, 3000);
      }
    },
    file: toUpload,
    thumb: thumbnailData,
    attributes,
  });
}

async function updateMongoCollection(
  trackId: MongoApp["trackId"],
  fileId: number,
) {
  const mongoDB = MongoDB.getInstance();
  await mongoDB.connect();
  const collection = mongoDB.getCollection("app_info_collection");
  if (collection) {
    await collection.updateOne({ trackId }, { $set: { fileId } });
  }
}

export async function uploadDecryptedFile(
  appInfo: MongoApp,
  originalMessage: Api.Message,
) {
  const replyToMsgId = originalMessage.id;
  const {
    trackId,
    chatId,
    trackViewUrl,
    artworkUrl512,
    releaseNotes,
    currentVersionReleaseDate,
    version,
    trackName,
    filename,
  } = appInfo;

  if (!filename || !trackViewUrl || !artworkUrl512) {
    console.error("Missing required arguments");
    return 1;
  }

  const imageBuffer = await fetchArtwork(artworkUrl512);
  const thumbnailBuffer = await createThumbnail(imageBuffer);
  const attributes = buildAttributes(trackName, version, thumbnailBuffer.info);

  const buttons = [Button.url("iTunes", trackViewUrl)];
  const markup = client.buildReplyMarkup(buttons);
  const msgResponse = await client.sendMessage(chatId, {
    message: `Uploading ${trackName} ${version} - 0%`,
    replyTo: replyToMsgId,
  });

  try {
    const filePath = `${dirname(__dirname)}/ipa-files/decrypted/${filename}`;
    const fileSize = statSync(filePath).size;
    const toUpload = new CustomFile(
      `${trackName} ${version}.ipa`,
      fileSize,
      filePath,
    );

    const caption = buildCaption(
      currentVersionReleaseDate,
      version,
      releaseNotes,
    );

    const fileMessage = await uploadFileWithProgress(
      chatId,
      toUpload,
      replyToMsgId,
      markup,
      caption,
      trackName,
      version,
      thumbnailBuffer.data,
      attributes,
      msgResponse.id,
    );

    await updateMongoCollection(trackId, fileMessage.id);
  } catch (error) {
    console.error(error);
    await handleUploadError(
      chatId,
      trackName,
      version,
      msgResponse,
      originalMessage,
    );
    return 1;
  }

  await client.deleteMessages(chatId, [msgResponse.id], {});
  return 0;
}
