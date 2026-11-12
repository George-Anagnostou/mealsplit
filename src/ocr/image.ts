import { targetSize } from './plan';

function decode(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      resolve(im);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image. Try a JPEG or PNG photo.'));
    };
    im.src = url;
  });
}

/**
 * Photo -> a canvas ready for OCR: upright, shrunk (see plan.ts), greyscale, contrast-stretched
 * (helps with faded thermal paper).
 *
 * - HEIC: the file input is `accept="image/*"`, so iOS hands over a JPEG it converted itself.
 * - Orientation: phone photos are often stored sideways with an EXIF flag. Both decoders below
 *   apply it. `createImageBitmap` is asked to explicitly; an `<img>` always does.
 */
export async function prepImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(
    () => null,
  );
  const source: CanvasImageSource = bitmap ?? (await decode(file));
  const [w, h] =
    source instanceof HTMLImageElement
      ? [source.naturalWidth, source.naturalHeight]
      : [source.width, source.height];
  const size = targetSize(w, h);

  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('Canvas is not available.');
  g.drawImage(source, 0, 0, size.width, size.height);
  bitmap?.close();

  const img = g.getImageData(0, 0, size.width, size.height);
  const px = img.data;
  let lo = 255;
  let hi = 0;
  for (let i = 0; i < px.length; i += 4) {
    const y = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    px[i] = y;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < px.length; i += 4) {
    const y = ((px[i] - lo) * 255) / span;
    px[i] = px[i + 1] = px[i + 2] = y;
  }
  g.putImageData(img, 0, 0);
  return canvas;
}
