import { glob } from "glob";
import { unlink } from "fs/promises";

export async function unlinkFilesWithWildcard(pattern: string) {
  try {
    const files = await glob(pattern);

    for (const file of files) {
      await unlink(file);
      console.log(`${file} deleted successfully`);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

export async function removeFile(file: string) {
  try {
    await unlink(file);
    console.log(`${file} deleted successfully`);
  } catch (error) {
    // ignore it, we don't care if the file doesn't exist
    // because we're sure the absolute path is correct
    console.error("Error:", error);
  }
}
