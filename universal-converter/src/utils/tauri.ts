import { invoke } from '@tauri-apps/api/core'

/** True when running inside a Tauri webview rather than a plain browser tab. */
export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export class NotReadyError extends Error {
  constructor(command: string) {
    super(
      `\`npm run tauri dev\` is required to run "${command}". A browser tab has no Rust backend, ` +
        `so file conversion cannot happen here.`,
    )
    this.name = 'NotReadyError'
  }
}

/** Typed IPC call. Throws rather than silently faking a result in the browser. */
export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) throw new NotReadyError(command)
  return invoke<T>(command, args)
}
