# Deploy & Finalization Checklist

Work through these top-to-bottom. Items marked **you** need a decision only you can make.

## State

- ✅ Static site validated: all pages, `data/apps.js`, CSS/JS, and APK downloads serve HTTP 200.
- ✅ APK hashes in `data/apps.js` match `downloads/`.
- ✅ Duplicate root-level `*.apk` copies removed; only `downloads/` ships.
- ✅ `site.js` is host-agnostic (no hardcoded host).
- ✅ Contact form posts to your Google Apps Script / FormForge endpoint (no PHP, no keys).

## 1. Pick a host + point your domain (you)

Any static or PHP-capable host works. Requirements:

- PHP + cURL for the contact form.
- HTTPS (required for APK downloads to be trusted by modern browsers).

## 2. Replace the placeholder hostname (you)

Swap `aloksystems.freedev.app` for your real domain in:

- `sitemap.xml` (all `<loc>`)
- `robots.txt` (`Sitemap:` line)
- `index.html`, `apps.html`, `about.html`, `contact.html`, `privacy.html`, `apps/*.html` (`<link rel="canonical">`, `<meta property="og:url">`)

One-line find-and-replace:

```powershell
Get-ChildItem -Recurse -Include *.html,*.xml,*.txt |
  ForEach-Object { (Get-Content $_.FullName -Raw) -replace 'aloksystems-apps\.freedev\.app','YOUR-DOMAIN' | Set-Content $_.FullName -NoNewline }
```

## 3. Upload (you)

Upload the **contents** of this folder to your web root — `index.html` directly inside, beside `assets/`, `apps/`, `data/`, `downloads/`, and `.htaccess`.

## 4. Contact form (you)

Submit a test message from the live site and confirm it appears in your Drive spreadsheet. No API keys or Apps Script deployment are required — the form posts directly to your Google Form (`FEEDBACK_ENDPOINT` / `FEEDBACK_FIELDS` in `assets/js/site.js`).

## 5. Real icons & metadata (you)

In `data/apps.js` for each app:

- Replace placeholder icons (`iconIsPlaceholder: true`) with real exported artwork.
- Fill `releaseDate` (currently null), `screenshots` (currently empty), and verify descriptions/features/package/permission/changelog fields.

## 6. Final checks

1. Site loads over HTTPS with the real domain.
2. An APK download works in a signed-out browser.
3. Contact form saves a submission to your Drive spreadsheet.
4. Submit `sitemap.xml` to Google Search Console (optional).