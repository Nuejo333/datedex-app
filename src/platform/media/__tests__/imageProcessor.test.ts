/**
 * @module platform/media/__tests__/imageProcessor.test
 * Unit tests for EXIF APP1 detection, dimension scaling, and Canvas-based EXIF stripping.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  computeScaledDimensions,
  hasExifApp1Marker,
  stripExifAndCompressImage,
} from '../imageProcessor';

describe('imageProcessor', () => {
  it('detects JPEG EXIF APP1 markers and scales oversized dimensions <= 1024px', () => {
    const jpegWithExif = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x06, 0x45, 0x78, 0xff, 0xd9]);
    const cleanJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46, 0xff, 0xd9]);

    expect(hasExifApp1Marker(jpegWithExif)).toBe(true);
    expect(hasExifApp1Marker(cleanJpeg)).toBe(false);

    expect(computeScaledDimensions(4000, 2000, 1024)).toEqual({ width: 1024, height: 512 });
    expect(computeScaledDimensions(800, 600, 1024)).toEqual({ width: 800, height: 600 });
  });

  it('re-encodes uploaded images through Canvas to strip EXIF metadata', async () => {
    const origCreateElement = document.createElement.bind(document);
    const drawImage = vi.fn();

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage }),
          toBlob: (cb: (b: Blob | null) => void) =>
            cb(new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: 'image/webp' })),
        } as unknown as HTMLCanvasElement;
      }
      return origCreateElement(tagName);
    });

    const origImage = globalThis.Image;
    class MockImage {
      naturalWidth = 2048;
      naturalHeight = 1024;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_val: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    globalThis.Image = MockImage as unknown as typeof Image;

    try {
      const inputFile = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1])], 'photo.jpg', {
        type: 'image/jpeg',
      });
      const result = await stripExifAndCompressImage(inputFile);
      expect(result.width).toBe(1024);
      expect(result.height).toBe(512);
      expect(result.mimeType).toBe('image/webp');
      expect(drawImage).toHaveBeenCalledOnce();
    } finally {
      globalThis.Image = origImage;
      vi.restoreAllMocks();
    }
  });
});
