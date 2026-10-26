/**
 * FormForge — Code.gs
 * Entry point, HTML rendering, server-callable orchestration.
 *
 * Execution model: deploy as Web App with Execute as = accessing user so that
 * created Forms/Sheets are owned by the person clicking Generate. See README.
 */

function doGet() {
  var t = HtmlService.createTemplateFromFile('Index');
  t.appName = 'FormForge';
  return t.evaluate()
    .setTitle('FormForge — Google Form & Sheet Generator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** HTML include helper used as <?!= include('Styles'); ?> */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Keep generation warning-state setup beside the web-app entry point.
var ffLastWarnings_ = [];
function ffResetWarnings_() {
  ffLastWarnings_ = [];
}

/**
 * Lightweight auth status for header display.
 * Returns { email, canCreate } — email may be blank under some deployments.
 */
function ffGetAuthStatus() {
  var email = '';
  try {
    email = Session.getActiveUser().getEmail() || '';
  } catch (e) {
    email = '';
  }
  return { email: email, canCreate: true };
}

/**
 * Server-side dry-run validation (no resources created).
 * Accepts object or JSON string. Returns { ok, errors[] }.
 */
function ffValidateOnly(input) {
  ffGuardPayload_(input);
  var result = ffValidateSpec(input);
  if (result.ok) {
    return { ok: true, errors: [] };
  }
  return { ok: false, errors: result.errors };
}

/**
 * Main generation endpoint called via google.script.run.
 *
 * @param {Object|string} input  Normalized or raw spec (object preferred).
 * @param {string} generationId  Client-generated UUID for idempotency.
 * @return {Object} result envelope.
 */
function ffGenerateForm(input, generationId) {
  ffResetWarnings_();
  var startedAt = new Date();
  var gid = (typeof generationId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(generationId.trim()))
    ? generationId.trim()
    : Utilities.getUuid();

  // ---- Idempotency: return cached result if this generationId was seen ----
  var cache = null;
  try { cache = CacheService.getUserCache(); } catch (e) { cache = null; }
  var cacheKey = 'ff_gen_' + gid;
  if (cache) {
    try {
      var prev = cache.get(cacheKey);
      if (prev) {
        var parsed = JSON.parse(prev);
        parsed.deduplicated = true;
        return parsed;
      }
    } catch (e) { /* ignore cache read errors */ }
  }

  // ---- Payload guard + validation ----
  try {
    ffGuardPayload_(input);
  } catch (e) {
    return ffFailResult_(gid, 'PAYLOAD_TOO_LARGE', String(e.message || e), []);
  }

  var validation = ffValidateSpec(input);
  if (!validation.ok) {
    return {
      ok: false,
      generationId: gid,
      stage: 'validation',
      errorCode: 'VALIDATION_FAILED',
      message: 'Specification is invalid. Fix the listed errors and try again.',
      errors: validation.errors,
      warnings: [],
      form: null,
      spreadsheet: null,
      deduplicated: false
    };
  }
  var normalized = validation.normalized;

  // ---- Serialize concurrent generations for this user ----
  var lock = null;
  try { lock = LockService.getUserLock(); } catch (e) { lock = null; }
  if (!lock) return ffFailResult_(gid, 'LOCK_UNAVAILABLE', 'Could not safely start generation. Please retry in a moment.', []);
  try {
    lock.waitLock(15000);
  } catch (e) {
    return ffFailResult_(gid, 'GENERATION_BUSY', 'Another generation is still running. Please wait a moment and retry.', []);
  }

  var form = null;
  var formUrls = null;
  try {
    // Re-check idempotency after acquiring the per-user lock to close the
    // race where two copies of the same request arrive at the same time.
    if (cache) {
      try {
        var lockedPrev = cache.get(cacheKey);
        if (lockedPrev) {
          var lockedResult = JSON.parse(lockedPrev);
          lockedResult.deduplicated = true;
          return lockedResult;
        }
      } catch (e) { /* Continue safely; the lock still serializes generation. */ }
    }
    try {
      ffEnforceRateLimit_();
    } catch (e) {
      return ffFailResult_(gid, 'RATE_LIMITED', String(e.message || e), []);
    }

    // ---- Step 1: create + configure form ----
    try {
      form = ffCreateForm_(normalized);
    } catch (e) {
      return ffFailResult_(gid, 'FORM_CREATION_FAILED', ffSafeServiceMessage_(e), ffGetWarnings_(), {
        errors: [{ path: '$.questions', message: ffSafeServiceMessage_(e) }]
      });
    }

    try {
      formUrls = ffGetFormUrls_(form);
    } catch (e) {
      return ffPartialResult_(gid, 'FORM_URL_FAILED',
        'Form was created but its URLs could not be read: ' + ffSafeServiceMessage_(e),
        form, null, ffGetWarnings_());
    }

    // ---- Step 2: create spreadsheet ----
    var ss = null;
    var ssInfo = null;
    try {
      ss = ffCreateResponseSpreadsheet_(normalized.title);
      ssInfo = ffGetSpreadsheetInfo_(ss);
    } catch (e) {
      return ffPartialResult_(gid, 'SPREADSHEET_FAILED',
        'Form was created, but the response spreadsheet could not be created: ' + ffSafeServiceMessage_(e) +
        '. Your form is usable — create a response sheet later from the form editor (Responses → Link to Sheets).',
        formUrls, null, ffGetWarnings_());
    }

    // ---- Step 3: link destination ----
    var link = null;
    try {
      link = ffLinkResponseDestination_(form, ssInfo.id);
    } catch (e) {
      return ffPartialResult_(gid, 'LINK_FAILED',
        'Form and spreadsheet were created, but automatic response linking failed: ' + ffSafeServiceMessage_(e) +
        '. Recovery: open the form editor → Responses → Link to Sheets and select "' + ssInfo.id + '". No duplicate resources were created on our side.',
        formUrls, ssInfo, ffGetWarnings_());
    }

    if (!link.linked) {
      return ffPartialResult_(gid, 'LINK_UNVERIFIED',
        'Form and spreadsheet were created, but linkage could not be verified (destination id mismatch). ' +
        'Open the form editor → Responses → Link to Sheets to confirm. Spreadsheet id: ' + ssInfo.id + '.',
        formUrls, ssInfo, ffGetWarnings_());
    }

    var result = {
      ok: true,
      generationId: gid,
      stage: 'complete',
      errorCode: null,
      message: 'Form and linked spreadsheet created successfully.',
      errors: [],
      warnings: ffGetWarnings_(),
      form: { id: formUrls.id, publishedUrl: formUrls.publishedUrl, editUrl: formUrls.editUrl, title: normalized.title },
      spreadsheet: { id: ssInfo.id, url: ssInfo.url },
      linked: true,
      createdAt: startedAt.toISOString(),
      deduplicated: false
    };
    if (cache) {
      try { cache.put(cacheKey, JSON.stringify(result), 21600); } catch (e) {}
    }
    return result;
  } finally {
    if (lock) { try { lock.releaseLock(); } catch (e) {} }
  }
}

function ffGetWarnings_() {
  // The generation warning list is initialized in Code.gs for the Web App entry point.
  // Read it defensively without shadowing.
  try {
    // In Apps Script all .gs files share one global scope.
    if (typeof ffLastWarnings_ !== 'undefined' && ffLastWarnings_ !== null && Array.isArray(ffLastWarnings_)) {
      return ffLastWarnings_.slice();
    }
  } catch (e) {}
  return [];
}

function ffFailResult_(gid, code, message, warnings, extra) {
  var r = {
    ok: false,
    generationId: gid,
    stage: 'failed',
    errorCode: code,
    message: message,
    errors: [],
    warnings: warnings || [],
    form: null,
    spreadsheet: null,
    deduplicated: false
  };
  if (extra && extra.errors) r.errors = extra.errors;
  return r;
}

function ffPartialResult_(gid, code, message, formUrlsOrForm, ssInfo, warnings) {
  var formOut = null;
  if (formUrlsOrForm) {
    if (formUrlsOrForm.publishedUrl !== undefined || formUrlsOrForm.editUrl !== undefined || formUrlsOrForm.id) {
      formOut = { id: formUrlsOrForm.id || '', publishedUrl: formUrlsOrForm.publishedUrl || '', editUrl: formUrlsOrForm.editUrl || '' };
    } else {
      // Raw Form object passed — extract safely.
      try {
        var u = ffGetFormUrls_(formUrlsOrForm);
        formOut = { id: u.id, publishedUrl: u.publishedUrl, editUrl: u.editUrl };
      } catch (e) {
        try { formOut = { id: formUrlsOrForm.getId(), publishedUrl: '', editUrl: '' }; } catch (ignored) { formOut = null; }
      }
    }
  }
  var result = {
    ok: false,
    partial: true,
    generationId: gid,
    stage: 'partial',
    errorCode: code,
    message: message,
    errors: [],
    warnings: warnings || [],
    form: formOut,
    spreadsheet: ssInfo ? { id: ssInfo.id, url: ssInfo.url } : null,
    deduplicated: false
  };
  // Cache partial outcomes too: a retry with the same client generation ID
  // must not create a second Form or Spreadsheet after a recoverable failure.
  try {
    CacheService.getUserCache().put('ff_gen_' + gid, JSON.stringify(result), 21600);
  } catch (e) {}
  return result;
}

function ffEnforceRateLimit_() {
  var cache = null;
  try { cache = CacheService.getUserCache(); } catch (e) { return; }
  if (!cache) return;
  var key = 'ff_rate_count';
  var raw = null;
  try { raw = cache.get(key); } catch (e) { return; }
  var count = raw ? parseInt(raw, 10) : 0;
  if (isNaN(count)) count = 0;
  if (count >= FF_RATE_LIMIT.MAX_GENERATIONS) {
    throw new Error('Rate limit: maximum ' + FF_RATE_LIMIT.MAX_GENERATIONS + ' generations per ' +
      Math.round(FF_RATE_LIMIT.WINDOW_SECONDS / 60) + ' minutes. Please wait and try again.');
  }
  try { cache.put(key, String(count + 1), FF_RATE_LIMIT.WINDOW_SECONDS); } catch (e) {}
}
