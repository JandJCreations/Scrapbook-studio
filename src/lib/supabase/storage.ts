import { createClient } from "@/lib/supabase/client";

export const MEDIA_BUCKET = "user-content";
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;

export async function getSignedUrl(path: string): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function getSignedUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (paths.length === 0) return map;

  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return map;

  for (const entry of data) {
    if (entry.signedUrl && entry.path) map.set(entry.path, entry.signedUrl);
  }
  return map;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = header.match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Supabase's free plan refuses any single file over 50 MB; a paid plan can raise it with NEXT_PUBLIC_MAX_UPLOAD_MB. */
export const MAX_UPLOAD_BYTES = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || 50) * 1024 * 1024;

export function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

/** Storage keys only take plain characters; a name like "Beach 🌊 #2 (é).mov" would be refused outright. */
export function safeFileName(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.]+/, "");
  return cleaned || "file";
}

/**
 * Uploads to Storage like `storage.upload`, but reports how much has been sent
 * (supabase-js has no progress events), so a big video shows a moving bar
 * instead of sitting at 0% until it is done.
 */
export function uploadWithProgress(
  options: { baseUrl: string; anonKey: string; accessToken: string; path: string; body: Blob; contentType: string },
  onProgress: (fraction: number) => void,
): Promise<void> {
  const { baseUrl, anonKey, accessToken, path, body, contentType } = options;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl}/storage/v1/object/${MEDIA_BUCKET}/${encoded}`);
    xhr.setRequestHeader("authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.setRequestHeader("content-type", contentType || "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(new Error(uploadErrorMessage(xhr.status, xhr.responseText, body.size)));
    };
    xhr.onerror = () => reject(new Error("Lost the connection while uploading. Check your internet and try again."));
    xhr.ontimeout = () => reject(new Error("The upload took too long. Try again."));
    xhr.send(body);
  });
}

function uploadErrorMessage(status: number, responseText: string, size: number): string {
  let message = "";
  try {
    const parsed = JSON.parse(responseText) as { message?: string; statusCode?: string };
    message = parsed.message ?? "";
    if (parsed.statusCode === "413") status = 413;
  } catch {
    // Not JSON: fall back to the status.
  }
  if (status === 413 || /maximum allowed size/i.test(message)) {
    return `Too big to save (${formatMegabytes(size)}). Each file can be up to ${formatMegabytes(MAX_UPLOAD_BYTES)}.`;
  }
  if (status === 401 || status === 403) return "You were signed out. Sign in again and retry.";
  return message || `Upload failed (error ${status}). Try again.`;
}
