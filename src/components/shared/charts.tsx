'use client'
// Accessible SVG charts — every chart ships a text summary alternative
// (WCAG 2.2 AA: "text summaries and table alternatives for charts").
import React, { useId } from 'react'
import { cn } from '@/lib/utils'
import { T } from '@/lib/i18n'

export interface Point { label: string; value: number }

export function TrendLine({ points, height = 140, labelEn = 'Trend', labelTh = 'แนวโน้ม', unitEn = 'score', unitTh = 'คะแนน', className }: {
  points: Point[]; height?: number; labelEn?: string; labelTh?: string; unitEn?: string; unitTh?: string; className?: string
}) {
  const gid = useId()
  const w = 560
  const pad = { l: 34, r: 8, t: 10, b: 20 }
  if (points.length < 2) return null
  const values = points.map((p) => p.value)
  const min = Math.min(...values), max = Math.max(...values)
  const lo = Math.max(0, min - 5), hi = Math.min(100, max + 5)
  const x = (i: number) => pad.l + (i / (points.length - 1)) * (w - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (height - pad.t - pad.b)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const area = `${path} L${x(points.length - 1).toFixed(1)},${height - pad.b} L${x(0).toFixed(1)},${height - pad.b} Z`
  const first = values[0], last = values[values.length - 1]
  const delta = last - first
  return (
    <figure className={cn('rounded-lg border bg-card p-3', className)}>
      <figcaption className="mb-1 text-xs font-medium text-muted-foreground">
        <T en={labelEn} th={labelTh} />
      </figcaption>
      <svg viewBox={`0 0 ${w} ${height}`} className="w-full" role="img" aria-label={`${labelEn}: from ${first.toFixed(1)} to ${last.toFixed(1)} ${unitEn}, change ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`}>
        <defs>
          <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.6 0.11 190)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="oklch(0.6 0.11 190)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[lo, (lo + hi) / 2, hi].map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="3 3" />
            <text x={pad.l - 4} y={y(v) + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">{v.toFixed(0)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#g-${gid})`} />
        <path d={path} fill="none" stroke="oklch(0.55 0.11 190)" strokeWidth="2" strokeLinecap="round" />
        {points.map((p, i) => (i % Math.ceil(points.length / 8) === 0 || i === points.length - 1) && (
          <text key={i} x={x(i)} y={height - 4} textAnchor="middle" className="fill-muted-foreground text-[9px]">{p.label}</text>
        ))}
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">
        <T
          en={`Summary: ${labelEn.toLowerCase()} moved from ${first.toFixed(1)} to ${last.toFixed(1)} (${delta >= 0 ? 'up' : 'down'} ${Math.abs(delta).toFixed(1)}). Full values: ${points.map((p) => `${p.label}=${p.value.toFixed(1)}`).join(', ')}.`}
          th={`สรุป: ${labelTh} เปลี่ยนจาก ${first.toFixed(1)} เป็น ${last.toFixed(1)} (${delta >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} ${Math.abs(delta).toFixed(1)}) ค่าทั้งหมด: ${points.map((p) => `${p.label}=${p.value.toFixed(1)}`).join(', ')}`}
        />
      </p>
    </figure>
  )
}

export function HBar({ points, labelEn = 'Comparison', labelTh = 'การเปรียบเทียบ', className, tone }: {
  points: Point[]; labelEn?: string; labelTh?: string; className?: string; tone?: (v: number) => 'good' | 'warn' | 'bad'
}) {
  const max = Math.max(...points.map((p) => Math.abs(p.value)), 1)
  return (
    <figure className={cn('rounded-lg border bg-card p-3', className)}>
      <figcaption className="mb-2 text-xs font-medium text-muted-foreground"><T en={labelEn} th={labelTh} /></figcaption>
      <ul className="space-y-2" role="list">
        {points.map((p) => {
          const t = tone?.(p.value) ?? (p.value >= 85 ? 'good' : p.value >= 70 ? 'warn' : 'bad')
          const barCls = { good: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-500' }[t]
          return (
            <li key={p.label} className="grid grid-cols-[minmax(90px,150px)_1fr_52px] items-center gap-2 text-xs">
              <span className="truncate text-foreground/80" title={p.label}>{p.label}</span>
              <span className="h-3.5 rounded bg-muted"><span className={cn('block h-3.5 rounded', barCls)} style={{ width: `${(Math.abs(p.value) / max) * 100}%` }} /></span>
              <span className="text-right font-medium tabular-nums">{p.value.toFixed(1)}</span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        <T en={`Values: ${points.map((p) => `${p.label} ${p.value.toFixed(1)}`).join(', ')}.`} th={`ค่า: ${points.map((p) => `${p.label} ${p.value.toFixed(1)}`).join(', ')}`} />
      </p>
    </figure>
  )
}

export function StackedBars({ groups, series, labelEn = 'Composition', labelTh = 'องค์ประกอบ', className }: {
  groups: { label: string; values: number[] }[]
  series: { name: string; color: string }[]
  labelEn?: string; labelTh?: string; className?: string
}) {
  return (
    <figure className={cn('rounded-lg border bg-card p-3', className)}>
      <figcaption className="mb-2 text-xs font-medium text-muted-foreground"><T en={labelEn} th={labelTh} /></figcaption>
      <div className="space-y-2">
        {groups.map((g) => {
          const total = g.values.reduce((a, b) => a + b, 0) || 1
          return (
            <div key={g.label} className="grid grid-cols-[minmax(90px,140px)_1fr] items-center gap-2 text-xs">
              <span className="truncate">{g.label}</span>
              <div className="flex h-4 overflow-hidden rounded" role="img" aria-label={`${g.label}: ${g.values.map((v, i) => `${series[i]?.name ?? i} ${v}`).join(', ')}`}>
                {g.values.map((v, i) => (
                  <span key={i} style={{ width: `${(v / total) * 100}%`, backgroundColor: series[i]?.color }} title={`${series[i]?.name}: ${v}`} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {series.map((s) => <span key={s.name} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />{s.name}</span>)}
      </div>
    </figure>
  )
}

export function Histogram({ values, bins = 10, labelEn = 'Distribution', labelTh = 'การกระจาย', className }: {
  values: number[]; bins?: number; labelEn?: string; labelTh?: string; className?: string
}) {
  if (values.length === 0) return null
  const min = Math.min(...values), max = Math.max(...values)
  const width = (max - min) / bins || 1
  const counts = new Array(bins).fill(0)
  values.forEach((v) => counts[Math.min(bins - 1, Math.floor((v - min) / width))]++)
  const maxCount = Math.max(...counts, 1)
  return (
    <figure className={cn('rounded-lg border bg-card p-3', className)}>
      <figcaption className="mb-2 text-xs font-medium text-muted-foreground"><T en={labelEn} th={labelTh} /></figcaption>
      <div className="flex h-24 items-end gap-1" role="img" aria-label={`${labelEn}: ${counts.join(', ')}`}>
        {counts.map((c, i) => (
          <div key={i} className="flex-1 rounded-t bg-teal-600/80" style={{ height: `${(c / maxCount) * 100}%` }} title={`${(min + i * width).toFixed(0)}–${(min + (i + 1) * width).toFixed(0)}: ${c}`} />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>{min.toFixed(0)}</span><span>{max.toFixed(0)}</span></div>
      <p className="mt-1 text-xs text-muted-foreground"><T en={`Bins: ${counts.join(', ')}.`} th={`ช่วงข้อมูล: ${counts.join(', ')}`} /></p>
    </figure>
  )
}
