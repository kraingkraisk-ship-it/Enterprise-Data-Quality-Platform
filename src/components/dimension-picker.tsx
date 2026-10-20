'use client'

/**
 * Dimension Picker — ตัวเลือกมิติคุณภาพข้อมูล 9 มิติตาม DAMA-DMBOK
 * ออกแบบให้ผู้ใช้เลือกได้ง่าย: การ์ดมีไอคอน + ชื่อไทย/อังกฤษ และมีคำอธิบาย + ตัวอย่าง
 * แสดงทันทีเมื่อเลือก (DimensionHint) ลดการเดาความหมายของมิติ
 * ใช้กับฟอร์มสร้างเงื่อนไขส่วนกลาง (คลังเงื่อนไข must) และจุดแสดงผลอื่น ๆ
 */

import {
  CalendarClock,
  Check,
  ClipboardCheck,
  Clock,
  Fingerprint,
  Gauge,
  Layers,
  Link2,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DIMENSION_KEYS, DIMENSION_META, type DimensionKey } from '@/lib/dq'

/** ไอคอนของแต่ละมิติ — map จาก key ใน lib/dq.ts (lib คงเป็น framework-free) */
export const DIMENSION_ICONS: Record<DimensionKey, LucideIcon> = {
  ACCURACY: Target,
  COMPLETENESS: ClipboardCheck,
  CONSISTENCY: Layers,
  VALIDITY: ShieldCheck,
  UNIQUENESS: Fingerprint,
  INTEGRITY: Link2,
  TIMELINESS: Clock,
  CURRENTNESS: CalendarClock,
  REASONABLENESS: Gauge,
}

function asDimensionKey(v: string): DimensionKey | null {
  return (DIMENSION_KEYS as string[]).includes(v) ? (v as DimensionKey) : null
}

/** ป้ายมิติแบบมีสี + ไอคอน (มี tooltip คำอธิบาย) — ใช้ในรายการเงื่อนไข/ผลรัน/สัญญาณ AI */
export function DimensionBadge({ dimension, className }: { dimension: string; className?: string }) {
  const key = asDimensionKey(dimension)
  if (!key) {
    return (
      <Badge variant="outline" className={`text-[10.5px] ${className ?? ''}`}>
        {dimension}
      </Badge>
    )
  }
  const Icon = DIMENSION_ICONS[key]
  const meta = DIMENSION_META[key]
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[10.5px] ${meta.badgeClass} ${className ?? ''}`}
      title={`${meta.en} — ${meta.description}`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {meta.th}
    </Badge>
  )
}

/** ตัวเลือกมิติแบบการ์ด 9 ใบ — เห็นชื่อไทย/อังกฤษพร้อมไอคอน เลือกแล้วขอบเขียว + เครื่องหมายถูก */
export function DimensionPicker({ value, onChange }: { value: string; onChange: (v: DimensionKey) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="มิติคุณภาพข้อมูล 9 มิติตามมาตรฐาน DAMA-DMBOK"
      className="grid grid-cols-1 gap-2 sm:grid-cols-3"
    >
      {DIMENSION_KEYS.map((k) => {
        const meta = DIMENSION_META[k]
        const Icon = DIMENSION_ICONS[k]
        const selected = value === k
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${meta.th} (${meta.en})`}
            onClick={() => onChange(k)}
            className={`flex items-start gap-2 rounded-lg border p-2.5 text-left transition-all hover:border-emerald-400 hover:bg-emerald-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              selected ? 'border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500' : 'bg-white'
            }`}
          >
            <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border ${meta.badgeClass}`}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-slate-800">{meta.th}</span>
              <span className="block truncate text-[10.5px] text-muted-foreground">{meta.en}</span>
            </span>
            {selected && <Check className="ml-auto size-4 shrink-0 text-emerald-600" aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

/** กล่องคำอธิบายมิติที่เลือก — คำถามช่วยตัดสินใจ + ตัวอย่าง + เอนจินที่แนะนำ */
export function DimensionHint({ value }: { value: string }) {
  const key = asDimensionKey(value)
  if (!key) return null
  const meta = DIMENSION_META[key]
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-slate-700" role="note">
      <p className="font-medium text-emerald-900">{meta.question}</p>
      <p className="mt-1 leading-relaxed">{meta.description}</p>
      <ul className="mt-1.5 space-y-0.5">
        {meta.examples.map((ex) => (
          <li key={ex} className="flex items-start gap-1">
            <span className="mt-[3px] size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
            <span>{ex}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        <Sparkles className="size-3" aria-hidden="true" />
        เอนจินที่แนะนำสำหรับมิตินี้:
        {meta.recommendedEngines.map((e) => (
          <Badge key={e} variant="outline" className="text-[10px]">
            {e}
          </Badge>
        ))}
      </p>
    </div>
  )
}
