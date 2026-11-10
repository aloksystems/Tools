import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/appStore'
import type { EngineId } from '@/types/converter'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

/**
 * States plainly that a conversion needs an engine this machine cannot run yet.
 * Deliberately not a disabled-and-hoped-for button: the reason is shown and the
 * re-scan is one click away.
 */
export function EngineNotice({ engine }: { engine: EngineId }) {
  const info = useAppStore((state) => state.engines.find((entry) => entry.id === engine))
  const rescanEngines = useAppStore((state) => state.rescanEngines)
  const [scanning, setScanning] = useState(false)

  if (!info || info.available) return null

  return (
    <div className="mb-4 flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
      <div className="space-y-2">
        <p className="font-medium text-amber-600 dark:text-amber-400">
          {info.label} engine is not installed
        </p>
        <p className="text-muted-foreground">
          {info.unavailableReason ?? 'Conversions in this section will fail until the engine runs.'}
        </p>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={scanning}
            onClick={async () => {
              setScanning(true)
              await rescanEngines()
              setScanning(false)
            }}
          >
            <RefreshCw className={scanning ? 'size-3.5 animate-spin' : 'size-3.5'} />
            Re-scan engines
          </Button>
          <p className="text-xs text-muted-foreground">
            Install the tool, or drop its executable in <code className="rounded bg-muted px-1">resources/</code>{' '}
            next to the app.
          </p>
        </div>
      </div>
    </div>
  )
}
