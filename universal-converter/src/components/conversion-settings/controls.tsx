import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function SettingRow({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5 py-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm font-medium">{label}</Label>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

export interface Option<T extends string> {
  value: T
  label: string
  /** Shown but unselectable — used when a sidecar is missing. */
  disabled?: boolean
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function SliderField({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next ?? value)}
        className="flex-1"
      />
      <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
        {value}
        {suffix}
      </span>
    </div>
  )
}

export function SwitchField({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
}

export function ProgressBar({
  value,
  indicatorClassName,
}: {
  value: number
  indicatorClassName?: string
}) {
  return (
    <Progress
      value={value}
      className="h-1.5"
      indicatorClassName={indicatorClassName}
      aria-label={`Conversion ${Math.round(value)} percent`}
    />
  )
}
