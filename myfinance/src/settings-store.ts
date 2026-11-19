export interface AppSettings {
  theme: 'light' | 'dark'
  pin: string | null
}

const KEY = 'myfinance-settings'

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>
      return { theme: parsed.theme === 'dark' ? 'dark' : 'light', pin: typeof parsed.pin === 'string' && parsed.pin ? parsed.pin : null }
    }
  } catch {
    // fall through to defaults
  }
  return { theme: 'light', pin: null }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings))
}

export function applyTheme(theme: AppSettings['theme']) {
  document.documentElement.setAttribute('data-theme', theme)
}
