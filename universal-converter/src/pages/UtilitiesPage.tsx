import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Binary,
  ClipboardCheck,
  CopyCheck,
  FileSearch,
  FolderSearch,
  GitCompareArrows,
  Image as ImageIcon,
  Wrench,
} from 'lucide-react'
import { ChecksumTool } from '@/features/utilities/ChecksumTool'
import { DuplicatesTool } from '@/features/utilities/DuplicatesTool'
import { FileCompareTool } from '@/features/utilities/FileCompareTool'
import { FileInfoTool } from '@/features/utilities/FileInfoTool'
import { HashesTool } from '@/features/utilities/HashesTool'
import { ImageToolsPanel } from '@/features/utilities/ImageToolsPanel'
import { SizeTool } from '@/features/utilities/SizeTool'

const TABS = [
  { value: 'info', label: 'File info', icon: FileSearch },
  { value: 'hashes', label: 'Hashes', icon: Binary },
  { value: 'checksums', label: 'Checksums', icon: ClipboardCheck },
  { value: 'compare', label: 'Compare files', icon: GitCompareArrows },
  { value: 'duplicates', label: 'Duplicates', icon: CopyCheck },
  { value: 'sizes', label: 'Folder sizes', icon: FolderSearch },
  { value: 'images', label: 'Images', icon: ImageIcon },
] as const

export function UtilitiesPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Wrench className="size-5" />
          File Utilities
        </h1>
        <p className="text-sm text-muted-foreground">
          Inspect, fingerprint and compare files. Everything is read locally and streamed, so large
          files never have to fit in memory.
        </p>
      </header>

      <Tabs defaultValue="info" className="flex flex-col gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="info">
          <FileInfoTool />
        </TabsContent>
        <TabsContent value="hashes">
          <HashesTool />
        </TabsContent>
        <TabsContent value="checksums">
          <ChecksumTool />
        </TabsContent>
        <TabsContent value="compare">
          <FileCompareTool />
        </TabsContent>
        <TabsContent value="duplicates">
          <DuplicatesTool />
        </TabsContent>
        <TabsContent value="sizes">
          <SizeTool />
        </TabsContent>
        <TabsContent value="images">
          <ImageToolsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
