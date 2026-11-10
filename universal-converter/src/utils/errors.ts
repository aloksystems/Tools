/** Tauri rejects an IPC call with its serialized AppError, not always an Error. */
export function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (typeof reason === 'object' && reason !== null && 'message' in reason) {
    const message = (reason as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(reason)
}
