# Alok Systems Apps

A lightweight, standalone Android app catalogue built with plain HTML, CSS, JavaScript and JSON. No build step and no Node.js server required. The site is fully self-contained and runs on virtually any host — static or shared PHP hosting.

## Run locally

There is no build step. You can open `index.html` directly (`file://`) — the catalogue is loaded from `data/apps.js`, so the pages render without a server. For the exact production behaviour (download progress, the feedback POST) preview over HTTP:

```powershell
python -m http.server 8000
```

Then visit http://localhost:8000. This is only for preview; production is static.

## Project structure

- `index.html`, `apps.html`, `about.html`, `contact.html`, `privacy.html` — the five main pages
- `apps/*.html` — individually refreshable app detail pages
- `data/apps.js` — central app catalogue (single source of truth)
- `downloads/*.apk` — the APK files served to visitors
- `assets/css/site.css`, `assets/js/site.js`, `assets/icons/` — styling, behaviour and app marks
- `.htaccess` — optional Apache tuning (gzip, caching, security headers); harmless elsewhere
- `design-direction.md`, `DEPLOY-CHECKLIST.md` — notes and go-live steps

## Making the contact form work

The contact form posts directly to your Google Form (created with FormForge), and each submission saves straight to your linked Google Drive spreadsheet. No PHP, no API keys, and it works on static hosts like GitHub Pages.

The form uses these Google Form entry IDs (fixed in `assets/js/site.js`):

| Site field | Google Form entry |
|---|---|
| Name | `entry.2007378481` |
| Rating | `entry.1249505218` |
| Topic | `entry.51228101` |
| Message | `entry.192173046` |

> If you ever regenerate the form, the entry IDs will change — update `FEEDBACK_ENDPOINT` and the `FEEDBACK_FIELDS` map in `site.js` to match (open the form and inspect the `name="entry.…"` attributes of its fields).

## Deploying

1. Any static host works — including GitHub Pages. No PHP or server required.
2. Upload the **contents** of this folder to the web root — `index.html` directly inside, beside `assets/`, `apps/`, `data/`, `downloads/`, and `.htaccess`.
3. If you use Apache with `.htaccess` enabled, upload it too; otherwise it is safe to ignore.
4. Update `sitemap.xml` and `robots.txt` with your real domain (they currently use a placeholder), and set canonical / `og:url` tags on every page to match.
5. Visit the served URL, hard-reload `/apps.html` and one `/apps/<slug>.html` page, and submit a test message via the contact form.

## Adding or updating an app

Edit `data/apps.js`. Keep all fields consistent: `id`/`slug` are stable lowercase identifiers, and `slug` must match an existing `apps/<slug>.html` page. Only enable a download after confirming the APK URL serves the file publicly without sign-in.

See `DEPLOY-CHECKLIST.md` for the full finalization list.