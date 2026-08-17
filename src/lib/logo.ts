const MAX_EDGE = 256;
const MAX_CHARS = 180_000;

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file is not a usable image."));
    img.src = src;
  });
}

/** Compress a logo so it fits local listings. */
export async function readLogoFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Logo must be an image.");
  if (file.size > 4_000_000) throw new Error("Logo must be under 4 MB.");
  const raw = await readFile(file);
  const img = await loadImage(raw);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height, 1));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process the logo.");
  ctx.drawImage(img, 0, 0, width, height);
  let quality = 0.84;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > MAX_CHARS && quality > 0.4) {
    quality -= 0.12;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > MAX_CHARS) throw new Error("Logo is still too large after compression. Try a simpler image.");
  return out;
}
