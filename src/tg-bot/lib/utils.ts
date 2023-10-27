import { glob } from "glob";
import { unlink } from "fs/promises";

async function handleFileDeletion(file: string) {
  try {
    await unlink(file);
    console.log(`${file} deleted successfully`);
  } catch (error) {
    console.error(`Error deleting ${file}:`, error);
  }
}

export async function deleteFilesMatchingPattern(pattern: string) {
  try {
    const filePaths = await glob(pattern);
    await Promise.all(filePaths.map(handleFileDeletion));
  } catch (error) {
    console.error("Error:", error);
  }
}

export async function deleteSingleFile(filePath: string) {
  await handleFileDeletion(filePath);
}

export function containsAnySubstrings(
  targetString: string,
  substrings: string[],
): boolean {
  return substrings.some((substring) => targetString.includes(substring));
}
