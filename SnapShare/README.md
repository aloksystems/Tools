# SnapShare

SnapShare is a Vite + React file-sharing app with private Vercel Blob uploads, password protection, expiry controls, one-time view, and optional download blocking.

## Deploy on Vercel

1. Push this project to the GitHub repository connected to Vercel.
2. In Vercel, choose **Add New > Project** and import that existing repository.
3. Keep the project root at the repository root. Vercel detects the Vite build automatically.
4. Create a Vercel Blob store from the project dashboard. This provides `BLOB_READ_WRITE_TOKEN`.
5. Create an Upstash Redis database and connect it to the Vercel project. This provides `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
6. Redeploy after the integrations are connected.

Required environment variables in Vercel:

- `BLOB_READ_WRITE_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The browser uploads files directly to private Blob storage, so large files do not pass through a Vercel function request. Redis stores transfer metadata and password access grants with expiry TTLs.

## Local checks

```bash
npm install
npm run lint
npm run build
```

`npm run start` uses `vercel dev`, so local API testing requires the Vercel CLI and the three environment variables above.