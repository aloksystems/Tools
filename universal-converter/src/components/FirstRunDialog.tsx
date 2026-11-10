import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { pickDirectoryDialog } from '@/hooks/useFilesDrop'
import { useAppStore } from '@/stores/appStore'
import { api } from '@/utils/api'
import { isTauriRuntime } from '@/utils/tauri'
import type { AppInfo } from '@/types/converter'
import { Check, FolderOpen, HardDrive, Loader2, Lock, MonitorCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

export function FirstRunDialog() {
  const settings = useAppStore((state) => state.settings)
  const engines = useAppStore((state) => state.engines)
  const hydrated = useAppStore((state) => state.hydrated)
  const saveSettings = useAppStore((state) => state.saveSettings)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = hydrated && isTauriRuntime() && !settings.welcomeCompleted

  useEffect(() => {
    if (!open) return
    api
      .appInfo()
      .then(setInfo)
      .catch(() => undefined)
  }, [open])

  if (!open) return null

  const optional = engines.filter((engine) => !engine.available)
  const ready = engines.filter((engine) => engine.available)

  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveSettings({ ...settings, welcomeCompleted: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/85 p-6 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
        className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <MonitorCheck className="size-6" />
          </div>
          <div>
            <h1 id="first-run-title" className="text-lg font-semibold tracking-tight">
              Welcome to Universal Converter
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Version {info?.version ?? '…'} · {info?.osVersion ?? 'Windows'} ·{' '}
              {info?.architecture ?? ''}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <section className="rounded-xl border border-border/70 p-3.5">
            <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase text-muted-foreground">
              <HardDrive className="size-3.5" />
              Engines
            </h2>
            <p className="mt-2 text-sm">
              {engines.length === 0
                ? 'Checking the engines installed on this machine…'
                : `${ready.length} of ${engines.length} engines ready on this machine.`}
            </p>
            {optional.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1.5">
                {optional.map((engine) => (
                  <li key={engine.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{engine.label}</span>
                    <Badge variant="warning" className="shrink-0">
                      optional, missing
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Every engine is available.</p>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Missing tools can be configured later in Settings → Engines. The app keeps working
              without them.
            </p>
          </section>

          <section className="rounded-xl border border-border/70 p-3.5">
            <h2 className="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase text-muted-foreground">
              <Lock className="size-3.5" />
              Privacy
            </h2>
            <ul className="mt-2 flex flex-col gap-1.5 text-xs text-muted-foreground">
              <li className="flex gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                Files are converted on this PC. Nothing is uploaded.
              </li>
              <li className="flex gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                No account, cloud service or telemetry.
              </li>
              <li className="flex gap-1.5">
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                Originals are never overwritten.
              </li>
            </ul>
            {info ? (
              <p className="mt-2 truncate text-[11px] text-muted-foreground" title={info.dataRoot}>
                Settings live in {info.dataRoot}
              </p>
            ) : null}
          </section>
        </div>

        <section className="mt-3 rounded-xl border border-border/70 p-3.5">
          <h2 className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
            Where should converted files go?
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(
              [
                ['subfolder', 'Converted folder', 'Beside each original'],
                ['source', 'Same folder', 'Beside each original'],
                ['custom', 'One fixed folder', 'You choose where'],
              ] as const
            ).map(([mode, title, hint]) => (
              <button
                key={mode}
                type="button"
                onClick={() => void saveSettings({ ...settings, outputDirectoryMode: mode })}
                className={`rounded-lg border p-2.5 text-left transition-colors ${
                  settings.outputDirectoryMode === mode
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-accent'
                }`}
                aria-pressed={settings.outputDirectoryMode === mode}
              >
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-[11px] text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
          {settings.outputDirectoryMode === 'custom' ? (
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                {settings.customOutputDirectory || 'No folder chosen yet'}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const picked = await pickDirectoryDialog()
                  if (picked) void saveSettings({ ...settings, customOutputDirectory: picked })
                }}
              >
                <FolderOpen className="size-3.5" />
                Choose folder
              </Button>
            </div>
          ) : null}
        </section>

        {error ? (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            You can change all of this in Settings at any time.
          </p>
          <Button onClick={() => void finish()} disabled={busy} autoFocus>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Start using Universal Converter
          </Button>
        </div>
      </div>
    </div>
  )
}
