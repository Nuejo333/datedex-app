/**
 * @module platform/media/imageProcessor
 * Client-side photo compression, resizing (max 1024px), and EXIF GPS metadata stripping
 * via HTML5 Canvas re-encoding before local persistence or private Storage upload.
 */

/**
 * Processed image result guaranteed to be stripped of EXIF/GPS metadata.
 */
export interface ProcessedImageResult {
  dataUrl: string;
  blob: Blob;
  mimeType: 'image/webp' | 'image/jpeg';
  width: number;
  height: number;
}

const MAX_IMAGE_DIMENSION = 1024;

/**
 * Checks whether a JPEG byte buffer contains an EXIF APP1 (`0xFFE1`) metadata segment.
 * Useful both for diagnostics and automated security tests.
 * @param {Uint8Array} bytes - Raw image bytes.
 * @returns {boolean} True if an EXIF APP1 marker is present.
 */
export function hasExifApp1Marker(bytes: Uint8Array): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }
  let offset = 2;
  while (offset + 3 < bytes.length) {
    const markerPrefix = bytes[offset];
    const markerType = bytes[offset + 1];
    if (markerPrefix !== 0xff) break;
    if (markerType === 0xe1) {
      return true;
    }
    if (markerType === 0xda || markerType === 0xd9) break;
    const segLength = ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0);
    if (segLength < 2) break;
    offset += 2 + segLength;
  }
  return false;
}

/**
 * Calculates aspect-ratio-preserving dimensions bounded by `maxDim`.
 * @param {number} width - Original width in pixels.
 * @param {number} height - Original height in pixels.
 * @param {number} [maxDim] - Maximum allowed width or height.
 * @returns {{ width: number; height: number }} Target scaled dimensions.
 */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxDim: number = MAX_IMAGE_DIMENSION,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: maxDim, height: maxDim };
  }
  if (width <= maxDim && height <= maxDim) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxDim / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid or corrupted image file'));
    img.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: 'image/webp' | 'image/jpeg',
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

/**
 * Resizes an image to at most 1024px on its longest edge and re-encodes it through
 * an offscreen Canvas to guarantee 100% removal of EXIF, GPS, and camera metadata.
 * @param {File | Blob} file - User-selected image file.
 * @param {number} [maxDim] - Maximum width/height in pixels (default 1024).
 * @param {number} [quality] - Compression quality 0..1 (default 0.82).
 * @returns {Promise<ProcessedImageResult>} Compressed, EXIF-free WebP/JPEG payload.
 * @throws {Error} When the file is not an image or exceeds 15MB raw input limit.
 */
export async function stripExifAndCompressImage(
  file: File | Blob,
  maxDim: number = MAX_IMAGE_DIMENSION,
  quality: number = 0.82,
): Promise<ProcessedImageResult> {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Only image files are supported');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Image exceeds 15MB maximum upload limit');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImageElement(rawDataUrl);
  const scaled = computeScaledDimensions(img.naturalWidth || img.width, img.naturalHeight || img.height, maxDim);

  const canvas = document.createElement('canvas');
  canvas.width = scaled.width;
  canvas.height = scaled.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable for image processing');
  }

  // Drawing pixels onto a fresh canvas strips all EXIF/IPTC/XMP/GPS headers
  ctx.drawImage(img, 0, 0, scaled.width, scaled.height);

  let mimeType: 'image/webp' | 'image/jpeg' = 'image/webp';
  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') {
    mimeType = 'image/jpeg';
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }
  if (!blob) {
    throw new Error('Failed to encode compressed image');
  }

  const dataUrl = await readFileAsDataUrl(blob);
  return {
    dataUrl,
    blob,
    mimeType,
    width: scaled.width,
    height: scaled.height,
  };
}
