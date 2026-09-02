/**
 * Client-side image compression — resizes and re-encodes an image File into a
 * size-capped JPEG data: URI, suitable for storing directly on a Firestore
 * document (shop logo, product photo). No server/IPC dependency: pure
 * browser APIs (FileReader/Image/Canvas), works identically in the Vite dev
 * server and in the packaged Electron renderer.
 */

export interface CompressImageOptions {
  /** Longest side, in pixels, after resizing (aspect ratio preserved). */
  maxDimension: number;
  /** Initial JPEG quality (0-1). Stepped down automatically if still too large. */
  quality?: number;
  /** Max length of the resulting data: URI string. */
  maxBytes?: number;
}

const DEFAULT_QUALITY = 0.82;
const DEFAULT_MAX_BYTES = 180_000;
const QUALITY_STEPS = [0.65, 0.5];

function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = objectUrl;
  });
}

export async function compressImageToDataUrl(file: File, opts: CompressImageOptions): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('not_an_image');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const { maxDimension, quality = DEFAULT_QUALITY, maxBytes = DEFAULT_MAX_BYTES } = opts;

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_unavailable');
    ctx.drawImage(img, 0, 0, width, height);

    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    for (const step of QUALITY_STEPS) {
      if (dataUrl.length <= maxBytes) break;
      dataUrl = canvas.toDataURL('image/jpeg', step);
    }

    if (dataUrl.length > maxBytes) {
      throw new Error('too_large');
    }

    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
