import { useAppStore } from '@/stores/appStore'
import { useEffect } from 'react'

/** Applies the persisted theme choice, following the OS while set to "system". */
export function useThemeEffect(): void {
  const theme = useAppStore((state) => state.settings.theme)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      root.classList.toggle('dark', dark)
    }

    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}
