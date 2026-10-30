# SnapShare

Ephemeral file sharing that runs entirely in the browser. Files are bundled into a
self-destructing share link with an optional password, an expiry timer (5–60 min),
one-time view, download blocking, and hidden file names.

## How it works (static / local mode)

- `index.html`, `style.css`, `script.js` — the live tool on `aloksystems.freedev.app`.
  No build step, no external dependencies.
- Files are stored as Blobs in IndexedDB, with the transfer metadata alongside them.
- Share links look like `…/SnapShare/#/s/<id>`. They open the receiver view on the
  same browser profile, because the data never leaves the device.
- Expired transfers are pruned on load and while a transfer is open.
- History of created links is kept in `localStorage` (`snapshare_history`).

Because everything is local, a link sent to another device will show the
"Transfer expired" state. Nothing is uploaded, so there is no server-side copy.

## Optional server deployment

The original Vercel implementation is still in the folder and is untouched:

- `src/`, `api/`, `package.json`, `vite.config.ts`, `vercel.json` — React + Vite client
  and the `/api` handler backed by Vercel Blob and Upstash Redis.
- Required environment variables: `BLOB_READ_WRITE_TOKEN`, `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN`.

Deploy that folder to Vercel if you want cross-device links. The static UI in
`index.html` is independent of it and can later be pointed at the API endpoints
(`/api/share/:id`, `/api/share/:id/verify`, `/api/share/:id/image/:imageId`,
`/api/share/:id/delete`).
