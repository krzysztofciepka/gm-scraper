import fs from "fs";
import path from "path";

const MEDIA_DIR = path.join(process.cwd(), "media");

export async function downloadPhotos(
  googlePlaceId: string,
  photoUrls: string[]
): Promise<{ filePath: string; sourceUrl: string }[]> {
  const placeDir = path.join(MEDIA_DIR, googlePlaceId);
  fs.mkdirSync(placeDir, { recursive: true });

  const results: { filePath: string; sourceUrl: string }[] = [];

  for (let i = 0; i < photoUrls.length; i++) {
    const url = photoUrls[i];
    try {
      const response = await fetch(url);
      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = detectExtension(response.headers.get("content-type"));
      const filename = `${i}${ext}`;
      const filePath = path.join("media", googlePlaceId, filename);
      const absolutePath = path.join(MEDIA_DIR, googlePlaceId, filename);

      fs.writeFileSync(absolutePath, buffer);
      results.push({ filePath, sourceUrl: url });
    } catch (err) {
      console.error(`Failed to download photo ${i} for ${googlePlaceId}:`, err);
    }
  }

  return results;
}

function detectExtension(contentType: string | null): string {
  if (!contentType) return ".jpg";
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  return ".jpg";
}
