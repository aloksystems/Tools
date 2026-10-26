# FormForge — Google Form & Sheet Generator

Turn a ChatGPT-generated JSON specification into a **real Google Form** with a **linked response Spreadsheet**, deployed as a Google Apps Script Web App. No external database, no secrets in the client.

## Current web app deployment

Production Web App URL: https://script.google.com/macros/s/AKfycbwmpwPqUR2QfuaUDw636muhCWxCu2c2LE7f3OE5C0DN5Jrqfw1eEIxPNz7KptI6E43z/exec

## Project files

```
FormForge/
├── appsscript.json        # Manifest: timezone, webapp settings, minimal OAuth scopes
├── Code.gs                # doGet, include(), ffGetAuthStatus, ffValidateOnly, ffGenerateForm (orchestrator)
├── Configuration.gs       # Schema version, supported types, allow-lists, limits, defaults, rate limit
├── Validation.gs          # Authoritative server validation + normalization
├── FormService.gs         # FormApp creation, per-type mapping, URL retrieval
├── SpreadsheetService.gs  # Spreadsheet creation, setDestination linking, URL retrieval
├── Index.html             # App shell (header, editor, preview, result, how-to)
├── Styles.html            # Design system CSS (included via templating)
├── Components.html        # Help modal + toast (included via templating)
├── Client.html            # Frontend JS (included via templating)
├── example-form.json      # Standard example (student registration)
├── example-all-types.json # Covers all 8 supported question types
└── README.md
```

## JSON schema (v1.0)

```json
{
  "schemaVersion": "1.0",
  "title": "Student Registration Form",
  "description": "Enter your student details.",
  "settings": {
    "collectEmail": false,
    "limitOneResponse": false,
    "allowResponseEdits": false,
    "confirmationMessage": "Your response has been submitted successfully."
  },
  "questions": [
    { "id": "student_name", "title": "Student Name", "description": "Enter your full name.", "type": "SHORT_ANSWER", "required": true },
    { "id": "course", "title": "Select Course", "description": "", "type": "DROPDOWN", "options": ["BCA","BBA","B.Tech","MCA"], "required": true }
  ]
}
```

Rules:

- `schemaVersion` must be `"1.0"`.
- Root keys allow-list: `schemaVersion, title, description, settings, questions`. Unknown keys are **rejected**.
- `title`: required, non-empty, ≤ 300 chars.
- `description`: optional string, ≤ 2000 chars.
- `settings` keys allow-list: `collectEmail, limitOneResponse, allowResponseEdits` (booleans), `confirmationMessage` (string ≤ 1000). Unknown settings are **rejected, not ignored**.
- `questions`: array, 1–100 items.
- Per question keys allow-list: `id, title, description, type, required, options, scaleConfig`.
- `id`: optional (auto-generated as `q_N` if missing), else `^[A-Za-z0-9_-]{1,64}$`, unique.
- `title`: required non-empty, ≤ 300. `description`: optional string ≤ 1000.
- `type`: one of `SHORT_ANSWER, PARAGRAPH, MULTIPLE_CHOICE, CHECKBOXES, DROPDOWN, DATE, TIME, LINEAR_SCALE` (case-insensitive input, normalized to upper). Anything else rejected.
- `required`: boolean (missing defaults to `false`).
- `options`: **required** for `MULTIPLE_CHOICE, CHECKBOXES, DROPDOWN` (2–50 unique non-empty trimmed strings, each ≤ 200); **forbidden** for other types.
- `scaleConfig` (only `LINEAR_SCALE`): `{ min: 0|1, max: 2..10 (and > min), lowerLabel?, upperLabel? (≤100 each) }`. Defaults `{min:1, max:5}`.
- Payload ≤ 256 KB.

Validation runs **twice**: instant client-side (UX) and authoritative server-side (`Validation.gs`) on every generation. Client values are never trusted and never `eval`'d.

## Supported question types → FormApp mapping

| Spec type | FormApp call | Notes |
|---|---|---|
| `SHORT_ANSWER` | `addTextItem()` | `setTitle, setHelpText, setRequired` |
| `PARAGRAPH` | `addParagraphTextItem()` | same |
| `MULTIPLE_CHOICE` | `addMultipleChoiceItem()` + `setChoiceValues(options)` | radio |
| `CHECKBOXES` | `addCheckboxItem()` + `setChoiceValues(options)` | multi-select |
| `DROPDOWN` | `addListItem()` + `setChoiceValues(options)` | list |
| `DATE` | `addDateItem()` | defaults; year/time toggles not exposed reliably — documented limitation |
| `TIME` | `addTimeItem()` | defaults |
| `LINEAR_SCALE` | `addScaleItem()` + `setBounds(min,max)` + `setLowerLabel/setUpperLabel` | min 0/1, max 2–10 |

Unsupported types (FILE_UPLOAD, GRID, IMAGE, VIDEO, etc.) are **rejected with an error**, never silently mapped.

### Supported vs unsupported Forms features

Supported: title, description, confirmation message, collect-email flag, limit-one-response flag, allow-response-edits flag, required, help text, choice values, scale bounds/labels, response-destination linking.
Not supported via FormApp (documented, warn-don't-fail): custom theme/branding, per-question regex validation, quiz/grading, section/page breaks, pre-filled links, closing dates, email notifications. If you need these, edit the created form manually — the editor link is returned.

## Setup & deployment

### Option A — Apps Script editor (recommended)

1. Go to <https://script.google.com> → **New project**.
2. Copy each file's contents into matching files (create `.gs` files via **+ → Script**, HTML files via **+ → HTML**; replace `Code.gs`, paste `appsscript.json` via **Project Settings → Show appsscript.json**).
   - File names must match the `include('…')` calls: `Index, Styles, Components, Client`.
3. **Deploy → New deployment → Web app**:
   - *Execute as*: **Me** for personal use (you own everything), or **User accessing the web app** so each user owns their forms (recommended for sharing).
   - *Who has access*: **Only myself** (MVP) or **Anyone** (requires Google sign-in with `ANYONE`; use `ANYONE_ANONYMOUS` only if you understand quota/abuse trade-offs).
4. Accept the OAuth consent screen (scopes: `forms, spreadsheets, drive.file, userinfo.email, script.storage`).
5. Open the Web App URL. Paste `example-form.json`, Validate, Generate. Verify the three URLs.

### Option B — clasp

```bash
npm i -g @google/clasp
clasp login
clasp create --title FormForge --type standalone
# copy files in, then:
clasp push
# Deploy as web app from the editor (clasp webapp deploy support varies; editor deploy is authoritative).
```

## Authorization & ownership

- The app uses the Apps Script consent flow only; no API keys or tokens in client code.
- Created Forms/Sheets are owned by the **executing account** (depends on *Execute as* above). Document this for your users.
- If `Session.getActiveUser().getEmail()` is blank (common under `USER_DEPLOYING`), the header shows a generic signed-in state — this is expected, not an error.

## Generation flow (server)

1. `ffGenerateForm(spec, generationId)` → idempotency check (`CacheService`, 6 h) → rate limit (10/10 min per user).
2. Payload guard → `ffValidateSpec` → `ffNormalizeSpec_`.
3. `LockService.getUserLock()` → `ffCreateForm_` (title, description, confirmation, 3 flags, questions in order).
4. `ffGetFormUrls_` (published + edit + id).
5. `ffCreateResponseSpreadsheet_` (`"<title> (Responses)"`) → `ffLinkResponseDestination_` (`setDestination(SPREADSHEET, id)`) → verify `getDestinationId()`.
6. Return `{ ok, form{publishedUrl, editUrl, id}, spreadsheet{url, id}, warnings }`.

Partial failures are explicit: `FORM_CREATION_FAILED / FORM_URL_FAILED / SPREADSHEET_FAILED / LINK_FAILED / LINK_UNVERIFIED` with verified URLs, recovery steps, and **no blind duplicates** (retry reuses `generationId`; client disables double-click).

## Security

- Server revalidates everything; allow-lists for root/settings/question keys; size/count/length caps.
- Safe DOM only (`textContent`, no `innerHTML` with user data); URL allow-list (`docs.google.com, forms.gle, forms.google.com`); no `eval`/`Function` on user data; no secrets client-side; no user-supplied form/sheet IDs; no `UrlFetchApp`.
- User-facing errors are sanitized (`ffSafeServiceMessage_`, 300-char cap) — no stack traces.
- `appsscript.json` requests minimal scopes. Do not add broad Drive/Forms scopes.

## Manual test checklist

1. Valid short-answer form → 3 URLs work (open respondent link in incognito, submit, check Sheet row).
2. `example-all-types.json` → all 8 types render and create.
3. Required vs optional → submit with required blank is blocked in the live Form.
4. Choice with 3+ options → options appear verbatim.
5. Invalid JSON (`{bad`) → syntax error, generate stays disabled.
6. Missing title (`"title":" "`) → `$.title` error.
7. Duplicate `id`s → `$.questions[N].id` duplicate error.
8. `options: []` / `[""]` → options errors.
9. `"type":"FILE_UPLOAD"` → unsupported-type error.
10. `"settings":{"theme":"dark"}` → unsupported-setting error (not ignored).
11. Oversized payload (>256 KB or >100 questions) → size error.
12. Revoked auth (run as logged-out / deny scope) → consent prompt; app shows auth failure, no fake success.
13. Spreadsheet failure (e.g., temporarily break title) → `SPREADSHEET_FAILED` partial with working form URLs + recovery text.
14. Linking failure → `LINK_FAILED` partial with both URLs + manual-link steps.
15. Double-click Generate → one request in flight; same `generationId` returns `deduplicated:true`, no second form.
16. Mobile 360 px → editor + preview stack, buttons usable, JSON editable.
17. Download → Import round-trip preserves spec; Format pretty-prints.
18. Edit title in preview → JSON updates; edit JSON manually → validation invalidated, Generate disabled until re-validate.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Invalid JSON syntax` | Remove ``` fences, trailing commas; use Format. |
| `Unsupported field/setting/type` | Compare against schema tables above; ChatGPT sometimes invents `GRID`/`FILE_UPLOAD` — ask it to regenerate with allowed types only. |
| Consent screen / `Authorization required` | Open the `/exec` URL (not `/dev`), sign in, **Allow**. Check `appsscript.json` scopes. |
| `Rate limit` | Wait ~10 min (10 generations/window). |
| Published URL empty | Forms service delay — open the edit URL → Send. Warning is shown, not silent. |
| `Limit to 1 response` not applied | Requires sign-in collection; warning recorded, form still created. |
| Sheet has no rows yet | Normal — rows appear after first submission. Columns are managed by Forms; do not rename headers. |

## Limits (Configuration.gs)

Questions ≤ 100 · options ≤ 50 (≥ 2) · title ≤ 300 · description ≤ 2000 · option ≤ 200 · confirmation ≤ 1000 · payload ≤ 256 KB · scale 0/1–2..10.
