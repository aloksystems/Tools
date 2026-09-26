export interface ImageState {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
  data: string;
  previewUrl: string;
  progress: number;
}

export interface ImageMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface TransferSession {
  id: string;
  createdAt: number;
  expiresAt: number;
  images: ImageMetadata[];
  oneTimeView: boolean;
  selfDestruct: boolean;
  hideFilename: boolean;
  allowDownload: boolean;
  viewCount: number;
  downloadCount: number;
  passwordRequired: boolean;
}

export interface TransferHistoryItem {
  id: string;
  createdAt: number;
  expiresAt: number;
  imagesCount: number;
  totalSize: number;
  passwordProtected: boolean;
  oneTimeView: boolean;
}
