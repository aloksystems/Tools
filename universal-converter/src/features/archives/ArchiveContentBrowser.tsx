import { formatBytes } from '@/utils/format'
import { ChevronDown, ChevronRight, File, FolderClosed, FolderOpen, Link2, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ArchiveEntry } from '@/types/converter'
import { cn } from '@/lib/utils'

interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  size: number
  encrypted: boolean
  isLink: boolean
  children: TreeNode[]
}

function makeNode(name: string, path: string): TreeNode {
  return {
    name,
    path,
    isDirectory: true,
    size: 0,
    encrypted: false,
    isLink: false,
    children: [],
  }
}

/** Archives do not always store directory rows, so parents are inferred from paths. */
function buildTree(entries: ArchiveEntry[]): TreeNode[] {
  const roots: TreeNode[] = []
  const directories = new Map<string, TreeNode>()

  for (const entry of entries) {
    const parts = entry.path.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length === 0) continue
    let siblings = roots
    let prefix = ''
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]!
      prefix = prefix ? `${prefix}/${part}` : part
      const leaf = index === parts.length - 1
      if (leaf && !entry.isDirectory) {
        siblings.push({
          name: part,
          path: prefix,
          isDirectory: false,
          size: entry.size,
          encrypted: entry.encrypted,
          isLink: entry.isLink,
          children: [],
        })
        break
      }
      const key = prefix.toLowerCase()
      let directory = directories.get(key)
      if (!directory) {
        directory = makeNode(part, prefix)
        directories.set(key, directory)
        siblings.push(directory)
      }
      siblings = directory.children
    }
  }

  const sort = (nodes: TreeNode[]) => {
    nodes.sort(
      (left, right) =>
        Number(right.isDirectory) - Number(left.isDirectory) ||
        left.name.localeCompare(right.name),
    )
    for (const node of nodes) sort(node.children)
  }
  sort(roots)
  return roots
}

function filePaths(node: TreeNode): string[] {
  if (!node.isDirectory) return node.isLink ? [] : [node.path]
  return node.children.flatMap(filePaths)
}

function Checkbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  label: string
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked
  }, [indeterminate, checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={onChange}
      className="size-3.5 shrink-0 accent-primary disabled:opacity-40"
    />
  )
}

function Row({
  node,
  depth,
  selected,
  onToggle,
}: {
  node: TreeNode
  depth: number
  selected: Set<string>
  onToggle: (paths: string[], select: boolean) => void
}) {
  const [open, setOpen] = useState(true)
  const paths = filePaths(node)
  const selectedCount = paths.filter((path) => selected.has(path)).length
  const all = paths.length > 0 && selectedCount === paths.length

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded px-1.5 py-1 text-sm hover:bg-muted/60',
          node.isLink && 'opacity-60',
        )}
        style={{ paddingLeft: depth * 14 + 6 }}
      >
        {node.isDirectory ? (
          <button
            type="button"
            className="flex size-4 items-center justify-center text-muted-foreground"
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="size-4" />
        )}

        <Checkbox
          checked={all}
          indeterminate={selectedCount > 0}
          disabled={node.isLink || paths.length === 0}
          label={`Select ${node.name}`}
          onChange={() => onToggle(paths, !all)}
        />

        {node.isDirectory ? (
          open ? (
            <FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FolderClosed className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <File className="size-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="min-w-0 flex-1 truncate" title={node.path}>
          {node.name}
        </span>
        {node.encrypted ? <Lock className="size-3 text-amber-500" aria-label="Encrypted" /> : null}
        {node.isLink ? <Link2 className="size-3 text-destructive" aria-label="Link, never extracted" /> : null}
        {!node.isDirectory ? (
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatBytes(node.size)}
          </span>
        ) : null}
      </div>
      {node.isDirectory && open
        ? node.children.map((child) => (
            <Row
              key={child.path}
              node={child}
              depth={depth + 1}
              selected={selected}
              onToggle={onToggle}
            />
          ))
        : null}
    </>
  )
}

export interface ArchiveContentBrowserProps {
  entries: ArchiveEntry[]
  fileCount: number
  totalBytes: number
  hasLinks: boolean
  encrypted: boolean
  selected: Set<string>
  onSelectedChange: (next: Set<string>) => void
}

/**
 * Declared contents of one archive. Only non-link files can be ticked; an empty
 * selection means "extract everything", which is the queue's default.
 */
export function ArchiveContentBrowser({
  entries,
  fileCount,
  totalBytes,
  hasLinks,
  encrypted,
  selected,
  onSelectedChange,
}: ArchiveContentBrowserProps) {
  const tree = buildTree(entries)
  const files = entries.filter((entry) => !entry.isDirectory && !entry.isLink)

  const toggle = (paths: string[], select: boolean) => {
    const next = new Set(selected)
    for (const path of paths) {
      if (select) next.add(path)
      else next.delete(path)
    }
    onSelectedChange(next)
  }

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <p className="text-sm font-medium">Archive contents</p>
          <p className="text-xs text-muted-foreground">
            {fileCount} file{fileCount === 1 ? '' : 's'} · {formatBytes(totalBytes)} declared
            {encrypted ? ' · encrypted' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => onSelectedChange(new Set(files.map((entry) => entry.path)))}
          >
            Select all
          </button>
          <span className="text-xs text-muted-foreground">·</span>
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => onSelectedChange(new Set())}
          >
            Whole archive
          </button>
        </div>
      </header>

      {hasLinks ? (
        <p className="border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
          This archive contains symbolic or hard links. Extraction will be refused because links can
          point outside the destination.
        </p>
      ) : null}

      <div className="max-h-80 overflow-y-auto p-1.5">
        {tree.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">The archive is empty.</p>
        ) : (
          tree.map((node) => (
            <Row
              key={node.path}
              node={node}
              depth={0}
              selected={selected}
              onToggle={toggle}
            />
          ))
        )}
      </div>

      <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        {selected.size === 0
          ? 'Nothing ticked — every entry will be extracted.'
          : `${selected.size} entr${selected.size === 1 ? 'y' : 'ies'} ticked — only those will be extracted.`}
      </p>
    </section>
  )
}
