import { del, get } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
import { Redis } from "@upstash/redis";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { Readable } from "node:stream";

interface ImageMetadata {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
}

interface TransferSession {
  id: string;
  createdAt: number;
  expiresAt: number;
  images: ImageMetadata[];
  password?: string;
  oneTimeView: boolean;
  selfDestruct: boolean;
  hideFilename: boolean;
  allowDownload: boolean;
  viewCount: number;
  downloadCount: number;
  hasBeenViewed: boolean;
}

interface ShareAccessGrant {
  transferId: string;
  expiresAt: number;
}

const MAX_EXPIRY_MINUTES = 60;
const ALLOWED_EXPIRY_PRESETS = new Set(["5m", "10m", "30m", "1h", "custom"]);

function getRedis() {
  return Redis.fromEnv();
}

function transferKey(id: string) {
  return `snapshare:transfer:${id}`;
}

function grantKey(token: string) {
  return `snapshare:grant:${token}`;
}

function parseCookies(cookieHeader?: string) {
  if (!cookieHeader) return {} as Record<string, string>;
  return cookieHeader.split(";").reduce((cookies, pair) => {
    const separator = pair.indexOf("=");
    if (separator > -1) {
      const key = pair.slice(0, separator).trim();
      cookies[key] = decodeURIComponent(pair.slice(separator + 1).trim());
    }
    return cookies;
  }, {} as Record<string, string>);
}

function noStore(res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function setGrantCookie(res: VercelResponse, id: string, token: string, expiresAt: number) {
  res.setHeader("Set-Cookie", `snapshare_access_${id}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${new Date(expiresAt).toUTCString()}`);
}

function clearGrantCookie(res: VercelResponse, id: string) {
  res.setHeader("Set-Cookie", `snapshare_access_${id}=; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

async function getTransfer(id: string) {
  return getRedis().get<TransferSession>(transferKey(id));
}

async function removeTransfer(session: TransferSession) {
  const redis = getRedis();
  await redis.del(transferKey(session.id));
  await Promise.all(session.images.map((image) => del(image.url)));
}

async function issueGrant(res: VercelResponse, id: string, expiresAt: number) {
  const token = crypto.randomBytes(24).toString("hex");
  const grant: ShareAccessGrant = { transferId: id, expiresAt };
  await getRedis().set(grantKey(token), grant, { ex: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)) });
  setGrantCookie(res, id, token, expiresAt);
}

async function hasGrant(req: VercelRequest, id: string) {
  const token = parseCookies(req.headers.cookie)[`snapshare_access_${id}`];
  if (!token) return false;
  const grant = await getRedis().get<ShareAccessGrant>(grantKey(token));
  return !!grant && grant.transferId === id && Date.now() < grant.expiresAt;
}

function expiryMinutes(expiry: unknown, customExpiryMinutes: unknown) {
  if (typeof expiry !== "string" || !ALLOWED_EXPIRY_PRESETS.has(expiry)) return null;
  if (expiry === "5m") return 5;
  if (expiry === "10m") return 10;
  if (expiry === "30m") return 30;
  if (expiry === "1h") return 60;
  const parsed = Number.parseInt(String(customExpiryMinutes), 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= MAX_EXPIRY_MINUTES ? parsed : null;
}

function getPath(req: VercelRequest) {
  return new URL(req.url || "/", `https://${req.headers.host || "localhost"}`).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
}

async function uploadToken(req: VercelRequest, res: VercelResponse) {
  const result = await handleUpload({
    request: req,
    body: req.body,
    onBeforeGenerateToken: async (_pathname, _clientPayload, multipart) => ({
      allowedContentTypes: ["image/*", "video/*"],
      maximumSizeInBytes: 15 * 1024 * 1024,
      addRandomSuffix: true,
      tokenPayload: JSON.stringify({ multipart }),
    }),
  });
  return res.status(200).json(result);
}

async function createTransfer(req: VercelRequest, res: VercelResponse) {
  const { images, expiry, customExpiryMinutes, password, oneTimeView, selfDestruct, hideFilename, allowDownload, customSlug } = req.body || {};
  if (!Array.isArray(images) || images.length === 0) return res.status(400).json({ error: "No files provided" });

  const minutes = expiryMinutes(expiry, customExpiryMinutes);
  if (!minutes) return res.status(400).json({ error: "Invalid expiry. Choose between 1 and 60 minutes." });

  const validImages = images.map((image: any) => ({
    id: crypto.randomUUID(),
    name: String(image?.name || "asset"),
    type: String(image?.type || "application/octet-stream"),
    size: Number(image?.size || 0),
    url: String(image?.url || ""),
  }));
  if (validImages.some((image) => !image.url.startsWith("https://"))) return res.status(400).json({ error: "Invalid uploaded file" });

  let id = crypto.randomBytes(4).toString("hex");
  if (typeof customSlug === "string") {
    const slug = customSlug.replace(/[^a-zA-Z0-9-_]/g, "").trim();
    if (slug.length >= 3) id = slug;
  }

  const redis = getRedis();
  if (await redis.exists(transferKey(id))) return res.status(400).json({ error: "Slug already in use" });

  const expiresAt = Date.now() + minutes * 60 * 1000;
  const session: TransferSession = {
    id,
    createdAt: Date.now(),
    expiresAt,
    images: validImages,
    password: typeof password === "string" && password.trim() ? password.trim() : undefined,
    oneTimeView: !!oneTimeView,
    selfDestruct: !!selfDestruct,
    hideFilename: !!hideFilename,
    allowDownload: allowDownload !== false,
    viewCount: 0,
    downloadCount: 0,
    hasBeenViewed: false,
  };
  await redis.set(transferKey(id), session, { ex: minutes * 60 });
  return res.json({ id, expiresAt, imagesCount: validImages.length });
}

async function getShare(req: VercelRequest, res: VercelResponse, id: string) {
  noStore(res);
  const session = await getTransfer(id);
  if (!session) return res.status(404).json({ error: "Transfer not found" });
  if (Date.now() >= session.expiresAt) {
    await removeTransfer(session);
    clearGrantCookie(res, id);
    return res.status(404).json({ error: "Transfer expired" });
  }
  const access = await hasGrant(req, id);
  if (session.password && !access) return res.status(401).json({ passwordRequired: true, expiresAt: session.expiresAt, id });
  if (access) await issueGrant(res, id, session.expiresAt);
  session.viewCount += 1;
  await getRedis().set(transferKey(id), session, { ex: Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000)) });
  return res.json({ ...session, images: session.images.map((image, index) => ({ id: image.id, name: session.hideFilename ? `Asset_${index + 1}.${image.name.split(".").pop() || "bin"}` : image.name, type: image.type, size: image.size })) });
}

async function verifyShare(req: VercelRequest, res: VercelResponse, id: string) {
  noStore(res);
  const session = await getTransfer(id);
  if (!session) return res.status(404).json({ error: "Transfer not found" });
  if (Date.now() >= session.expiresAt) return res.status(404).json({ error: "Transfer expired" });
  if (session.password && session.password !== String(req.body?.password || "")) {
    clearGrantCookie(res, id);
    return res.status(401).json({ error: "Incorrect password" });
  }
  await issueGrant(res, id, session.expiresAt);
  return res.json({ success: true, expiresAt: session.expiresAt });
}

async function serveImage(req: VercelRequest, res: VercelResponse, id: string, imageId: string) {
  noStore(res);
  const session = await getTransfer(id);
  if (!session) return res.status(404).json({ error: "Transfer not found" });
  if (Date.now() >= session.expiresAt) {
    await removeTransfer(session);
    return res.status(404).json({ error: "Transfer expired" });
  }
  if (session.password && !(await hasGrant(req, id))) return res.status(401).json({ error: "Password required" });
  const image = session.images.find((item) => item.id === imageId);
  if (!image) return res.status(404).json({ error: "File not found" });
  const isDownload = req.query.download === "true";
  if (isDownload && !session.allowDownload) return res.status(403).json({ error: "Download disabled for this transfer" });

  const blob = await get(image.url, { access: "public", useCache: false });
  if (!blob || blob.statusCode !== 200) return res.status(404).json({ error: "File missing" });
  res.setHeader("Content-Type", image.type);
  if (isDownload) {
    const name = session.hideFilename ? `asset.${image.name.split(".").pop() || "bin"}` : image.name;
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`);
    session.downloadCount += 1;
    await getRedis().set(transferKey(id), session, { ex: Math.max(1, Math.ceil((session.expiresAt - Date.now()) / 1000)) });
  }
  Readable.fromWeb(blob.stream as any).pipe(res);
  if (session.oneTimeView || (session.selfDestruct && isDownload)) setTimeout(() => void removeTransfer(session), 15000);
}

async function deleteTransfer(req: VercelRequest, res: VercelResponse, id: string) {
  const session = await getTransfer(id);
  if (!session) return res.status(404).json({ error: "Transfer not found" });
  if (session.password && session.password !== String(req.body?.password || "")) return res.status(401).json({ error: "Incorrect password" });
  await removeTransfer(session);
  clearGrantCookie(res, id);
  return res.json({ success: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const path = getPath(req);
    if (req.method === "POST" && path[0] === "blob-upload") return uploadToken(req, res);
    if (req.method === "POST" && path[0] === "upload") return createTransfer(req, res);
    if (path[0] !== "share" || !path[1]) return res.status(404).json({ error: "Not found" });
    const id = path[1];
    if (req.method === "POST" && path[2] === "verify") return verifyShare(req, res, id);
    if (req.method === "POST" && path[2] === "delete") return deleteTransfer(req, res, id);
    if (req.method === "GET" && path[2] === "image" && path[3]) return serveImage(req, res, id, path[3]);
    if (req.method === "GET" && path.length === 2) return getShare(req, res, id);
    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
}