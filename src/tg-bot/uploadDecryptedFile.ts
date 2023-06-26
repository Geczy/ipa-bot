import axios from "axios";
import { statSync } from "fs";
import { dirname } from "path";
import sharp from "sharp";
import { Api } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { Button } from "telegram/tl/custom/button";
import { client } from "./client";
import MongoDB from "./lib/mongo";
import { MongoApp } from "./lib/types";

export async function uploadDecryptedFile(
  {
    trackId,
    chatId,
    bundleId,
    trackViewUrl,
    artworkUrl512,
    releaseNotes,
    currentVersionReleaseDate,
    version,
    trackName,
    filename,
  }: MongoApp,
  replyTo: number
) {
  if (!filename || !bundleId || !trackViewUrl || !artworkUrl512) {
    console.error("Incorrect arguments");
    return 1;
  }

  const response = await axios.get(artworkUrl512, {
    responseType: "arraybuffer",
  });
  const imageBuffer = response.data;

  const thumbnailBuffer = await sharp(imageBuffer)
    .resize({ width: 150, height: 150 })
    .jpeg({ quality: 80, progressive: true })
    .toBuffer({
      resolveWithObject: true,
    });

  let attributes = [];

  attributes.push(
    new Api.DocumentAttributeFilename({
      fileName: `${trackName} ${version}.ipa`,
    })
  );

  attributes.push(
    new Api.DocumentAttributeVideo({
      roundMessage: true,
      duration: 0,
      w: thumbnailBuffer.info.width,
      h: thumbnailBuffer.info.height,
    })
  );

  const buttons = [Button.url("iTunes", trackViewUrl)];
  const markup = client.buildReplyMarkup(buttons);
  const msgResponse = await client.sendMessage(chatId, {
    message: `Uploading ${trackName} ${version} - 0%`,
    replyTo,
  });

  let timeoutInProgress = false;
  let previousProgress = 0;

  try {
    const file = `${dirname(__dirname)}/ipa-files/decrypted/${filename}`;
    const toUpload = new CustomFile(
      `${trackName} ${version}.ipa`,
      statSync(file).size,
      file
    );

    const dateObj = new Date(currentVersionReleaseDate);
    const formattedDate = dateObj.toISOString().split("T")[0]; // Extract yyyy-mm-dd

    const maxCaptionLength = 500;
    let caption = `**Release Notes**\n${formattedDate} · ${version}\n${releaseNotes}`;

    if (caption.length > maxCaptionLength) {
      caption = `${caption.substring(0, maxCaptionLength)}...`;
    }

    const fileMessage = await client.sendFile(chatId, {
      replyTo,
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
                message: msgResponse.id,
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
      thumb: thumbnailBuffer.data,
      attributes,
    });

    console.log("File uploaded successfully");

    const mongoDB = MongoDB.getInstance();
    await mongoDB.connect();
    const collection = mongoDB.getCollection("app_info_collection");

    if (collection) {
      await collection.updateOne(
        { trackId },
        { $set: { fileId: fileMessage.id } }
      );
    }
  } catch (error) {
    console.error(error);
    await client.editMessage(chatId, {
      message: msgResponse.id,
      text: `Uploading ${trackName} ${version} has failed`,
    });
    return 1;
  }

  await client.deleteMessages(chatId, [msgResponse.id], {});
  return 0;
}
