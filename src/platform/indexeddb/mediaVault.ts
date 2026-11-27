/**
 * @module platform/indexeddb/mediaVault
 * Device-only Private Local Media Vault backed strictly by IndexedDB (`localMedia`).
 * Images are EXIF-stripped and compressed when Canvas is available; videos and images
 * never leave the device (`Zero Cloud Upload`).
 */
import { stripExifAndCompressImage } from '../media/imageProcessor';
import { datedexDb, type DatedexDb, type LocalMediaRecord } from './db';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Input payload accepted by `saveMediaItem`.
 */
export interface SaveMediaItemInput {
  pinId: string;
  file: File | Blob;
  fileName?: string;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read media file'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Persists an image or video media item strictly in local browser IndexedDB (`localMedia`),
 * stripping EXIF metadata from images when Canvas encoding is available.
 * @param {SaveMediaItemInput} input - Pin ID and selected image/video file.
 * @param {DatedexDb} [db] - Optional Dexie instance (defaults to browser singleton).
 * @returns {Promise<LocalMediaRecord>} Saved device-only local media record.
 * @throws {Error} When file type is unsupported or exceeds local size limits.
 */
export async function saveMediaItem(
  input: SaveMediaItemInput,
  db: DatedexDb = datedexDb,
): Promise<LocalMediaRecord> {
  const { pinId, file } = input;
  const mimeType = file.type || 'application/octet-stream';
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');

  if (!isImage && !isVideo) {
    throw new Error('Only image and video files are supported in the Local Media Vault');
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    throw new Error('Image exceeds 15MB maximum local vault limit');
  }
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new Error('Video exceeds 50MB maximum local vault limit');
  }

  let dataUrl: string;
  let finalMime = mimeType;
  let finalSize = file.size;

  if (isImage) {
    const canUseCanvas =
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function' &&
      (() => {
        try {
          return Boolean(document.createElement('canvas').getContext('2d'));
        } catch {
          return false;
        }
      })();

    if (canUseCanvas) {
      try {
        const processed = await stripExifAndCompressImage(file);
        dataUrl = processed.dataUrl;
        finalMime = processed.mimeType;
        finalSize = processed.blob.size;
      } catch {
        // Fallback to direct local Data URL when canvas cannot decode a file
        dataUrl = await readBlobAsDataUrl(file);
      }
    } else {
      dataUrl = await readBlobAsDataUrl(file);
    }
  } else {
    dataUrl = await readBlobAsDataUrl(file);
  }

  const record: LocalMediaRecord = {
    id: globalThis.crypto.randomUUID(),
    pinId,
    mimeType: finalMime,
    kind: isImage ? 'image' : 'video',
    fileName: input.fileName ?? (file instanceof File ? file.name : `media-${Date.now()}`),
    dataUrl,
    sizeBytes: finalSize,
    createdAt: new Date().toISOString(),
  };

  await db.localMedia.put(record);
  return record;
}

/**
 * Lists all local-only media items stored for a specific pin in chronological upload order.
 * @param {string} pinId - Pin UUID.
 * @param {DatedexDb} [db] - Optional Dexie instance.
 * @returns {Promise<LocalMediaRecord[]>} Ordered local media records.
 */
export async function listMediaItemsForPin(
  pinId: string,
  db: DatedexDb = datedexDb,
): Promise<LocalMediaRecord[]> {
  const rows = await db.localMedia.where('pinId').equals(pinId).toArray();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Deletes a single local media item from IndexedDB.
 * @param {string} mediaId - Local media item UUID.
 * @param {DatedexDb} [db] - Optional Dexie instance.
 * @returns {Promise<void>}
 */
export async function deleteMediaItem(
  mediaId: string,
  db: DatedexDb = datedexDb,
): Promise<void> {
  await db.localMedia.delete(mediaId);
}

/**
 * Deletes every local media item belonging to a given pin UUID.
 * @param {string} pinId - Pin UUID.
 * @param {DatedexDb} [db] - Optional Dexie instance.
 * @returns {Promise<void>}
 */
export async function deleteMediaItemsForPin(
  pinId: string,
  db: DatedexDb = datedexDb,
): Promise<void> {
  await db.localMedia.where('pinId').equals(pinId).delete();
}
