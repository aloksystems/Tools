import { useQueueStore } from '@/stores/queueStore'
import { cn } from '@/lib/utils'
import {
  AudioLines,
  FileArchive,
  FileImage,
  FileText,
  FileType,
  Film,
  Clock,
  House,
  ListOrdered,
  ScanText,
  Settings,
  Wrench,
  Zap,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { ComponentType } from 'react'

const LINKS: { to: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { to: '/', label: 'Home', icon: House },
  { to: '/quick', label: 'Quick Convert', icon: Zap },
  { to: '/image', label: 'Image', icon: FileImage },
  { to: '/pdf', label: 'PDF', icon: FileText },
  { to: '/ocr', label: 'OCR', icon: ScanText },
  { to: '/documents', label: 'Documents', icon: FileType },
  { to: '/audio', label: 'Audio', icon: AudioLines },
  { to: '/video', label: 'Video', icon: Film },
  { to: '/archives', label: 'Archives', icon: FileArchive },
  { to: '/tools', label: 'Advanced Tools', icon: Wrench },
  { to: '/queue', label: 'Queue', icon: ListOrdered },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pending = useQueueStore((state) => state.stats.active + state.stats.queued)

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar px-3 py-4">
      <div className="mb-5 px-2">
        <p className="text-sm font-semibold tracking-tight">Universal Converter</p>
        <p className="text-xs text-muted-foreground">Offline · files never leave this PC</p>
      </div>

      <ul className="flex flex-col gap-0.5">
        {LINKS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  isActive && 'bg-accent font-medium text-foreground',
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {label === 'Queue' && pending > 0 ? (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-xs tabular-nums text-primary">
                  {pending}
                </span>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
