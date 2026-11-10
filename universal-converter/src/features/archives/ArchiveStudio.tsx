import { ArchiveCreateForm } from '@/features/archives/ArchiveCreateForm'
import { ArchiveExtractForm } from '@/features/archives/ArchiveExtractForm'
import { ArchiveRepackForm } from '@/features/archives/ArchiveRepackForm'
import { useArchiveCapabilities } from '@/features/archives/useArchiveCapabilities'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PackageOpen, PackagePlus, RefreshCw } from 'lucide-react'
import { useState } from 'react'

type ArchiveMode = 'create' | 'extract' | 'repack'

const MODES: Array<{
  value: ArchiveMode
  label: string
  page: string
  icon: typeof PackagePlus
}> = [
  { value: 'create', label: 'Create', page: 'archives:create', icon: PackagePlus },
  { value: 'extract', label: 'Extract', page: 'archives:extract', icon: PackageOpen },
  { value: 'repack', label: 'Repack', page: 'archives:repack', icon: RefreshCw },
]

/**
 * One Studio for the three archive workflows. Each mode keeps its own staging
 * area, chosen container and options, so switching modes never mixes inputs.
 */
export function ArchiveStudio() {
  const [mode, setMode] = useState<ArchiveMode>('create')
  const { capabilities, error } = useArchiveCapabilities()

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Archives</h1>
          <p className="text-sm text-muted-foreground">
            Create ZIP, 7Z, TAR, TAR.GZ, TAR.BZ2 and TAR.XZ archives, extract any container this
            7-Zip build reads, or repack between them. Every archive is treated as untrusted.
          </p>
        </div>
        {capabilities?.available ? (
          <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            7-Zip {capabilities.version ?? 'ready'}
          </span>
        ) : null}
      </header>

      <Tabs value={mode} onValueChange={(value) => setMode(value as ArchiveMode)}>
        <TabsList>
          {MODES.map((entry) => {
            const Icon = entry.icon
            return (
              <TabsTrigger key={entry.value} value={entry.value}>
                <Icon />
                {entry.label}
              </TabsTrigger>
            )
          })}
        </TabsList>

        <TabsContent value="create" className="pt-4">
          <ArchiveCreateForm
            page="archives:create"
            capabilities={capabilities}
            capabilitiesError={error}
          />
        </TabsContent>
        <TabsContent value="extract" className="pt-4">
          <ArchiveExtractForm
            page="archives:extract"
            capabilities={capabilities}
            capabilitiesError={error}
          />
        </TabsContent>
        <TabsContent value="repack" className="pt-4">
          <ArchiveRepackForm
            page="archives:repack"
            capabilities={capabilities}
            capabilitiesError={error}
          />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Extraction validates every declared path before writing, refuses links, absolute paths,
        traversal, case-insensitive duplicates and expansion bombs, and never merges into an
        existing folder.
      </p>
    </div>
  )
}
