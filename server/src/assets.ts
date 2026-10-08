import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const HASHED = /^\/assets\/.+-[A-Za-z0-9_-]{8,}\.[^/]+$/;

export interface Asset {
  type: string;
  body: Buffer;
  cache?: string;
}

async function read(base: string, path: string): Promise<Asset | null> {
  const file = resolve(join(base, normalize(path)));
  if (file !== base && !file.startsWith(base + sep)) return null;
  try {
    if (!(await stat(file)).isFile()) return null;
    return { type: TYPES[extname(file)] ?? "application/octet-stream", body: await readFile(file) };
  } catch {
    return null;
  }
}

export async function serveAsset(root: string, path: string): Promise<Asset | null> {
  const base = resolve(root);
  const asset = await read(base, path === "/" ? "/index.html" : path);
  if (asset) {
    if (asset.type.startsWith("text/html")) asset.cache = "no-cache";
    else if (HASHED.test(path)) asset.cache = "public, max-age=31536000, immutable";
    return asset;
  }
  const index = await read(base, "/index.html");
  if (index) index.cache = "no-cache";
  return index;
}
