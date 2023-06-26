export interface MongoApp {
  _id: string;
  trackId: string;
  fileSizeBytes: string;
  price: number;
  primaryGenreName: string;
  description: string;
  bundleId: string;
  artworkUrl512: string;
  releaseNotes: string;
  currentVersionReleaseDate: Date;
  version: string;
  trackName: string;
  trackViewUrl: string;
  filename: string;
  chatId: string;
  topicId: string;
  fileId: number;
}
