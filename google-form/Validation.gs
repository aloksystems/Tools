/**
 * FormForge — Validation.gs
 * Server-side authoritative validation + normalization.
 * All client input is treated as untrusted. Never skip server validation.
 */

function ffValidateSpec(input) {
  var errors = [];
  var spec = input;

  // Accept raw JSON string or object (client sends object; be tolerant).
  if (typeof spec === 'string') {
    if (spec.length > FF_LIMITS.MAX_PAYLOAD_CHARS) {
      return { ok: false, errors: [{ path: '$', message: 'Specification exceeds maximum size of 256 KB.' }] };
    }
    try {
      spec = JSON.parse(spec);
    } catch (e) {
      return { ok: false, errors: [{ path: '$', message: 'Invalid JSON syntax: ' + String(e.message || e).slice(0, 300) }] };
    }
  }

  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    return { ok: false, errors: [{ path: '$', message: 'Specification must be a JSON object.' }] };
  }

  // Unknown root keys -> reject (explicit, not silently ignored).
  for (var k in spec) {
    if (spec.hasOwnProperty(k) && FF_ALLOWED_ROOT_KEYS.indexOf(k) === -1) {
      errors.push({ path: '$.' + k, message: 'Unsupported field "' + k + '". Allowed fields: ' + FF_ALLOWED_ROOT_KEYS.join(', ') + '.' });
    }
  }

  // schemaVersion
  if (spec.schemaVersion === undefined || spec.schemaVersion === null) {
    errors.push({ path: '$.schemaVersion', message: 'Missing required field "schemaVersion". Expected "1.0".' });
  } else if (FF_SUPPORTED_SCHEMA_VERSIONS.indexOf(String(spec.schemaVersion)) === -1) {
    errors.push({ path: '$.schemaVersion', message: 'Unsupported schemaVersion "' + String(spec.schemaVersion).slice(0, 50) + '". Supported: ' + FF_SUPPORTED_SCHEMA_VERSIONS.join(', ') + '.' });
  }

  // title
  if (spec.title === undefined || spec.title === null || String(spec.title).trim() === '') {
    errors.push({ path: '$.title', message: 'Form title is required and must be non-empty.' });
  } else if (String(spec.title).trim().length > FF_LIMITS.MAX_TITLE_LEN) {
    errors.push({ path: '$.title', message: 'Form title must be ' + FF_LIMITS.MAX_TITLE_LEN + ' characters or fewer.' });
  }

  // description (optional)
  if (spec.description !== undefined && spec.description !== null) {
    if (typeof spec.description !== 'string') {
      errors.push({ path: '$.description', message: 'Description must be a string.' });
    } else if (spec.description.length > FF_LIMITS.MAX_DESCRIPTION_LEN) {
      errors.push({ path: '$.description', message: 'Description must be ' + FF_LIMITS.MAX_DESCRIPTION_LEN + ' characters or fewer.' });
    }
  }

  // settings (optional)
  var settings = spec.settings;
  if (settings !== undefined && settings !== null) {
    if (typeof settings !== 'object' || Array.isArray(settings)) {
      errors.push({ path: '$.settings', message: 'Settings must be an object.' });
    } else {
      for (var sk in settings) {
        if (settings.hasOwnProperty(sk) && FF_ALLOWED_SETTINGS_KEYS.indexOf(sk) === -1) {
          errors.push({ path: '$.settings.' + sk, message: 'Unsupported setting "' + sk + '". Supported: ' + FF_ALLOWED_SETTINGS_KEYS.join(', ') + '.' });
        }
      }
      ['collectEmail', 'limitOneResponse', 'allowResponseEdits'].forEach(function (bk) {
        if (settings[bk] !== undefined && typeof settings[bk] !== 'boolean') {
          errors.push({ path: '$.settings.' + bk, message: '"' + bk + '" must be a boolean.' });
        }
      });
      if (settings.confirmationMessage !== undefined && settings.confirmationMessage !== null) {
        if (typeof settings.confirmationMessage !== 'string') {
          errors.push({ path: '$.settings.confirmationMessage', message: 'confirmationMessage must be a string.' });
        } else if (settings.confirmationMessage.length > FF_LIMITS.MAX_CONFIRMATION_LEN) {
          errors.push({ path: '$.settings.confirmationMessage', message: 'confirmationMessage must be ' + FF_LIMITS.MAX_CONFIRMATION_LEN + ' characters or fewer.' });
        }
      }
    }
  }

  // questions
  var questions = spec.questions;
  if (questions === undefined || questions === null) {
    errors.push({ path: '$.questions', message: 'Missing required field "questions" (array).' });
  } else if (!Array.isArray(questions)) {
    errors.push({ path: '$.questions', message: '"questions" must be an array.' });
  } else {
    if (questions.length < FF_LIMITS.MIN_QUESTIONS) {
      errors.push({ path: '$.questions', message: 'At least ' + FF_LIMITS.MIN_QUESTIONS + ' question is required.' });
    }
    if (questions.length > FF_LIMITS.MAX_QUESTIONS) {
      errors.push({ path: '$.questions', message: 'Too many questions (' + questions.length + '). Maximum is ' + FF_LIMITS.MAX_QUESTIONS + '.' });
    }
    var seenIds = {};
    for (var i = 0; i < questions.length; i++) {
      ffValidateQuestion_(questions[i], i, seenIds, errors);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors };
  }
  return { ok: true, errors: [], normalized: ffNormalizeSpec_(spec) };
}

function ffValidateQuestion_(q, index, seenIds, errors) {
  var base = '$.questions[' + index + ']';
  if (q === null || typeof q !== 'object' || Array.isArray(q)) {
    errors.push({ path: base, message: 'Question must be an object.' });
    return;
  }
  for (var k in q) {
    if (q.hasOwnProperty(k) && FF_ALLOWED_QUESTION_KEYS.indexOf(k) === -1) {
      errors.push({ path: base + '.' + k, message: 'Unsupported field "' + k + '" for question. Allowed: ' + FF_ALLOWED_QUESTION_KEYS.join(', ') + '.' });
    }
  }

  // id
  if (q.id !== undefined && q.id !== null && q.id !== '') {
    if (typeof q.id !== 'string') {
      errors.push({ path: base + '.id', message: 'Question id must be a string.' });
    } else {
      var idTrim = q.id.trim();
      if (idTrim === '') {
        errors.push({ path: base + '.id', message: 'Question id must be non-empty if provided.' });
      } else if (!/^[A-Za-z0-9_\-]{1,64}$/.test(idTrim)) {
        errors.push({ path: base + '.id', message: 'Question id may contain only letters, numbers, underscore, hyphen (max 64 chars).' });
      } else if (seenIds[idTrim]) {
        errors.push({ path: base + '.id', message: 'Duplicate question id "' + idTrim + '". IDs must be unique.' });
      } else {
        seenIds[idTrim] = true;
      }
      if (q.id.length > 64) {
        errors.push({ path: base + '.id', message: 'Question id must be 64 characters or fewer.' });
      }
    }
  }

  // title
  if (q.title === undefined || q.title === null || String(q.title).trim() === '') {
    errors.push({ path: base + '.title', message: 'Question title is required and must be non-empty.' });
  } else if (String(q.title).trim().length > FF_LIMITS.MAX_QUESTION_TITLE_LEN) {
    errors.push({ path: base + '.title', message: 'Question title must be ' + FF_LIMITS.MAX_QUESTION_TITLE_LEN + ' characters or fewer.' });
  }

  // description
  if (q.description !== undefined && q.description !== null) {
    if (typeof q.description !== 'string') {
      errors.push({ path: base + '.description', message: 'Question description must be a string.' });
    } else if (q.description.length > FF_LIMITS.MAX_QUESTION_DESC_LEN) {
      errors.push({ path: base + '.description', message: 'Question description must be ' + FF_LIMITS.MAX_QUESTION_DESC_LEN + ' characters or fewer.' });
    }
  }

  // type
  if (q.type === undefined || q.type === null || String(q.type).trim() === '') {
    errors.push({ path: base + '.type', message: 'Question type is required. Supported: ' + FF_SUPPORTED_TYPES.join(', ') + '.' });
    return;
  }
  var type = String(q.type).trim().toUpperCase();
  if (FF_SUPPORTED_TYPES.indexOf(type) === -1) {
    errors.push({ path: base + '.type', message: 'Unsupported question type "' + String(q.type).slice(0, 60) + '". Supported: ' + FF_SUPPORTED_TYPES.join(', ') + '.' });
    return;
  }

  // required
  if (q.required !== undefined && typeof q.required !== 'boolean') {
    errors.push({ path: base + '.required', message: '"required" must be a boolean.' });
  }

  var isChoice = FF_CHOICE_TYPES.indexOf(type) !== -1;

  // options
  if (isChoice) {
    if (!Array.isArray(q.options)) {
      errors.push({ path: base + '.options', message: 'Choice question of type ' + type + ' requires an "options" array.' });
    } else {
      if (q.options.length < FF_LIMITS.MIN_OPTIONS) {
        errors.push({ path: base + '.options', message: 'Choice question requires at least ' + FF_LIMITS.MIN_OPTIONS + ' options.' });
      }
      if (q.options.length > FF_LIMITS.MAX_OPTIONS) {
        errors.push({ path: base + '.options', message: 'Too many options (' + q.options.length + '). Maximum is ' + FF_LIMITS.MAX_OPTIONS + '.' });
      }
      var seen = {};
      for (var oi = 0; oi < q.options.length; oi++) {
        var op = q.options[oi];
        var opPath = base + '.options[' + oi + ']';
        if (typeof op !== 'string') {
          errors.push({ path: opPath, message: 'Option must be a string.' });
          continue;
        }
        var t = op.trim();
        if (t === '') {
          errors.push({ path: opPath, message: 'Option must be non-empty after trimming.' });
          continue;
        }
        if (t.length > FF_LIMITS.MAX_OPTION_LEN) {
          errors.push({ path: opPath, message: 'Option must be ' + FF_LIMITS.MAX_OPTION_LEN + ' characters or fewer.' });
        }
        if (seen[t]) {
          errors.push({ path: opPath, message: 'Duplicate option "' + t.slice(0, 60) + '". Options must be unique.' });
        } else {
          seen[t] = true;
        }
      }
    }
  } else {
    if (q.options !== undefined) {
      errors.push({ path: base + '.options', message: '"options" is only supported for ' + FF_CHOICE_TYPES.join(', ') + '. Remove it for type ' + type + '.' });
    }
  }

  // scaleConfig
  if (type === 'LINEAR_SCALE') {
    var sc = q.scaleConfig;
    if (sc !== undefined && sc !== null) {
      if (typeof sc !== 'object' || Array.isArray(sc)) {
        errors.push({ path: base + '.scaleConfig', message: '"scaleConfig" must be an object.' });
      } else {
        for (var sck in sc) {
          if (sc.hasOwnProperty(sck) && FF_ALLOWED_SCALE_KEYS.indexOf(sck) === -1) {
            errors.push({ path: base + '.scaleConfig.' + sck, message: 'Unsupported scaleConfig field "' + sck + '".' });
          }
        }
        var smin = sc.min !== undefined ? sc.min : 1;
        var smax = sc.max !== undefined ? sc.max : 5;
        if (FF_LIMITS.SCALE_MIN_ALLOWED.indexOf(smin) === -1) {
          errors.push({ path: base + '.scaleConfig.min', message: 'Scale min must be 0 or 1 (Google Forms supports 0/1 lower bound).' });
        }
        if (typeof smax !== 'number' || Math.floor(smax) !== smax || smax < FF_LIMITS.SCALE_MAX_MIN || smax > FF_LIMITS.SCALE_MAX_MAX) {
          errors.push({ path: base + '.scaleConfig.max', message: 'Scale max must be an integer from ' + FF_LIMITS.SCALE_MAX_MIN + ' to ' + FF_LIMITS.SCALE_MAX_MAX + '.' });
        }
        if (FF_LIMITS.SCALE_MIN_ALLOWED.indexOf(smin) !== -1 && typeof smax === 'number' && smax <= smin) {
          errors.push({ path: base + '.scaleConfig.max', message: 'Scale max must be greater than min.' });
        }
        ['lowerLabel', 'upperLabel'].forEach(function (lk) {
          if (sc[lk] !== undefined && sc[lk] !== null && sc[lk] !== '') {
            if (typeof sc[lk] !== 'string') {
              errors.push({ path: base + '.scaleConfig.' + lk, message: '"' + lk + '" must be a string.' });
            } else if (sc[lk].length > 100) {
              errors.push({ path: base + '.scaleConfig.' + lk, message: '"' + lk + '" must be 100 characters or fewer.' });
            }
          }
        });
      }
    }
  } else {
    if (q.scaleConfig !== undefined) {
      errors.push({ path: base + '.scaleConfig', message: '"scaleConfig" is only supported for LINEAR_SCALE.' });
    }
  }
}

/**
 * Normalize a validated spec: trim strings, apply defaults, upper-case types,
 * auto-generate missing ids, fill default settings. Pure function, no services.
 */
function ffNormalizeSpec_(spec) {
  var out = {};
  out.schemaVersion = String(spec.schemaVersion);
  out.title = String(spec.title).trim();
  out.description = spec.description === undefined || spec.description === null ? '' : String(spec.description).trim();

  var s = spec.settings || {};
  out.settings = {
    collectEmail: s.collectEmail === true,
    limitOneResponse: s.limitOneResponse === true,
    allowResponseEdits: s.allowResponseEdits === true,
    confirmationMessage: (s.confirmationMessage === undefined || s.confirmationMessage === null)
      ? FF_DEFAULT_SETTINGS.confirmationMessage
      : String(s.confirmationMessage)
  };

  out.questions = [];
  var usedIds = {};
  for (var i = 0; i < spec.questions.length; i++) {
    var q = spec.questions[i];
    var nq = {};
    var rawId = (q.id !== undefined && q.id !== null) ? String(q.id).trim() : '';
    if (rawId === '') {
      rawId = 'q_' + (i + 1);
    }
    // Ensure uniqueness after normalization (append suffix if needed — validation
    // already rejects duplicates, this is belt-and-braces).
    var baseId = rawId;
    var suffix = 2;
    while (usedIds[rawId]) {
      rawId = baseId + '_' + suffix;
      suffix++;
    }
    usedIds[rawId] = true;
    nq.id = rawId;
    nq.title = String(q.title).trim();
    nq.description = (q.description === undefined || q.description === null) ? '' : String(q.description);
    nq.type = String(q.type).trim().toUpperCase();
    nq.required = q.required === true;
    if (FF_CHOICE_TYPES.indexOf(nq.type) !== -1) {
      nq.options = q.options.map(function (o) { return String(o).trim(); });
    }
    if (nq.type === 'LINEAR_SCALE') {
      var sc = q.scaleConfig || {};
      nq.scaleConfig = {
        min: sc.min !== undefined ? sc.min : 1,
        max: sc.max !== undefined ? sc.max : 5,
        lowerLabel: sc.lowerLabel ? String(sc.lowerLabel) : '',
        upperLabel: sc.upperLabel ? String(sc.upperLabel) : ''
      };
    }
    out.questions.push(nq);
  }
  return out;
}

/**
 * Server-side payload guard for google.script.run entries.
 * Accepts object or JSON string; enforces size limit before validation.
 */
function ffGuardPayload_(input) {
  var text = (typeof input === 'string') ? input : JSON.stringify(input || {});
  if (text === undefined || text === null) text = '';
  if (text.length > FF_LIMITS.MAX_PAYLOAD_CHARS) {
    throw new Error('Specification too large (' + text.length + ' chars). Maximum is ' + FF_LIMITS.MAX_PAYLOAD_CHARS + ' chars (256 KB).');
  }
  return input;
}
