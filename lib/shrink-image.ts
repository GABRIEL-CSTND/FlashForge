// BROWSER-ONLY. Shrinks a photo before upload (#72). Phone photos are often 3
// to 8 MB, Vercel takes about 4.5 MB per request, and the AI reads notes fine
// at 1,600 pixels. Browsers turn the photo the right way up (EXIF) when
// decoding it.

const MAX_SIDE = 1600;
// A photo this small and no bigger than MAX_SIDE is sent as it is.
const SMALL_ENOUGH_BYTES = 1.5 * 1024 * 1024;

export async function shrinkImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SMALL_ENOUGH_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) return file;
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
}
