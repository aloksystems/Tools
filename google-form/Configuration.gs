/**
 * FormForge — Configuration.gs
 * Central configuration: schema version, supported types, limits, defaults.
 * Keep client-side CONFIG in Client.html in sync (see CLIENT_CONFIG_VERSION).
 */

var FF_CONFIG_VERSION = '1.0';

var FF_SCHEMA_VERSION = '1.0';
var FF_SUPPORTED_SCHEMA_VERSIONS = ['1.0'];

var FF_SUPPORTED_TYPES = [
  'SHORT_ANSWER',
  'PARAGRAPH',
  'MULTIPLE_CHOICE',
  'CHECKBOXES',
  'DROPDOWN',
  'DATE',
  'TIME',
  'LINEAR_SCALE'
];

var FF_CHOICE_TYPES = ['MULTIPLE_CHOICE', 'CHECKBOXES', 'DROPDOWN'];

/**
 * Allow-listed top-level keys.
 */
var FF_ALLOWED_ROOT_KEYS = ['schemaVersion', 'title', 'description', 'settings', 'questions'];

/**
 * Allow-listed settings keys.
 */
var FF_ALLOWED_SETTINGS_KEYS = ['collectEmail', 'limitOneResponse', 'allowResponseEdits', 'confirmationMessage'];

/**
 * Allow-listed question keys (superset; per-type checks enforced in Validation.gs).
 */
var FF_ALLOWED_QUESTION_KEYS = ['id', 'title', 'description', 'type', 'required', 'options', 'scaleConfig'];

/**
 * Allow-listed scaleConfig keys.
 */
var FF_ALLOWED_SCALE_KEYS = ['min', 'max', 'lowerLabel', 'upperLabel'];

/**
 * Resource / payload limits. Documented in README.
 */
var FF_LIMITS = {
  MAX_PAYLOAD_CHARS: 262144,      // 256 KB JSON text
  MAX_QUESTIONS: 100,
  MIN_QUESTIONS: 1,
  MAX_TITLE_LEN: 300,
  MAX_DESCRIPTION_LEN: 2000,
  MAX_QUESTION_TITLE_LEN: 300,
  MAX_QUESTION_DESC_LEN: 1000,
  MAX_OPTIONS: 50,
  MIN_OPTIONS: 2,                 // choice types require >= 2 options
  MAX_OPTION_LEN: 200,
  MAX_CONFIRMATION_LEN: 1000,
  MAX_SPREADSHEET_TITLE_LEN: 100,
  SCALE_MIN_ALLOWED: [0, 1],
  SCALE_MAX_MIN: 2,
  SCALE_MAX_MAX: 10
};

var FF_DEFAULT_SETTINGS = {
  collectEmail: false,
  limitOneResponse: false,
  allowResponseEdits: false,
  confirmationMessage: 'Your response has been submitted successfully.'
};

/**
 * Rate limiting: max generations per window per executing user.
 * Enforced with CacheService + LockService in Code.gs.
 */
var FF_RATE_LIMIT = {
  MAX_GENERATIONS: 10,
  WINDOW_SECONDS: 600  // 10 minutes
};
