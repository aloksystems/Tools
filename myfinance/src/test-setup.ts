// Vitest runs in a Node-like environment that lacks browser globals. Some
// imported modules (dexie and its observable add-on) reference `self`, so
// alias it to globalThis before any test module is evaluated.
;(globalThis as Record<string, unknown>).self = globalThis
