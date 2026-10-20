'use client'

/**
 * Engine Picker — ตัวเลือกเอนจินประเมินผล จัดกลุ่มตามมิติคุณภาพข้อมูล 9 มิติ DAMA-DMBOK
 * - ทุกเอนจินถูกจัดอยู่ในมิติของตัวเอง (CONDITIONS[engine].dimension) ทำให้เห็นว่า
 *   "มิติไหนใช้เอนจินอะไรได้" — ครบทั้ง 9 มิติไม่มีมิติใดขาดเอนจิน
 * - เอนจินที่อยู่ในมิติที่ผู้ใช้เลือกไว้ (recommendedFor) จะได้ป้าย "แนะนำ"
 * - EngineHint อธิบายเอนจินที่เลือกเป็นภาษาไทยง่าย ๆ พร้อมพารามิเตอร์ที่ต้องกรอก
 * ใช้กับฟอร์มสร้างเงื่อนไขส่วนกลาง (คลังเงื่อนไข must)
 */

import {
  Braces,
  CalendarClock,
  Check,
  CircleDot,
  Database,
  Fingerprint,
  ListChecks,
  Mail,
  SlidersHorizontal,
  Sparkles,
  Table,
  Timer,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DIMENSION_ICONS } from '@/components/dimension-picker'
import {
  CONDITIONS,
  CONDITION_KEYS,
  DIMENSION_ENGINES,
  DIMENSION_KEYS,
  DIMENSION_LABELS,
  DIMENSION_META,
  ENGINE_DESCRIPTIONS,
  isConditionKey,
  type ConditionKey,
} from '@/lib/dq'

/** ไอคอนของแต่ละเอนจิน — map จาก key ใน lib/dq.ts (lib คงเป็น framework-free) */
export const ENGINE_ICONS: Record<ConditionKey, LucideIcon> = {
  NOT_NULL: CircleDot,
  EMAIL: Mail,
  REGEX: Braces,
  RANGE: SlidersHorizontal,
  IN_LIST: ListChecks,
  UNIQUE: Fingerprint,
  MAX_AGE_DAYS: CalendarClock,
  REFERENCE_MATCH: Database,
  MAX_AGE_HOURS: Timer,
  EXISTS_IN_DATASET: Table,
}

/** ป้ายเอนจินแบบมีไอคอน + tooltip คำอธิบาย — ใช้ในรายการเงื่อนไข/กฎ */
export function EngineBadge({ engine, className }: { engine: string; className?: string }) {
  if (!isConditionKey(engine)) {
    return (
      <Badge variant="outline" className={`text-[10.5px] ${className ?? ''}`}>
        เอนจิน: {engine}
      </Badge>
    )
  }
  const Icon = ENGINE_ICONS[engine]
  return (
    <Badge variant="outline" className={`gap-1 text-[10.5px] ${className ?? ''}`} title={`เอนจิน ${engine} — ${ENGINE_DESCRIPTIONS[engine]}`}>
      <Icon className="size-3" aria-hidden="true" />
      {CONDITIONS[engine].th}
    </Badge>
  )
}

/**
 * ตัวเลือกเอนจินแบบจัดกลุ่มตามมิติ — เห็นครบว่ามิติไหนมีเอนจินอะไร
 * เอนจินของมิติที่เลือกไว้ (recommendedFor) ได้ป้าย "แนะนำ" ช่วยตัดสินใจ
 */
export function EnginePicker({
  value,
  onChange,
  recommendedFor,
}: {
  value: string
  onChange: (v: ConditionKey) => void
  /** มิติที่กำลังเลือกอยู่ — เอนจินในมิตินี้จะถูกทำเครื่องหมาย "แนะนำ" */
  recommendedFor?: string
}) {
  return (
    <div className="space-y-2" role="radiogroup" aria-label="เอนจินประเมินผล จัดกลุ่มตามมิติคุณภาพข้อมูล 9 มิติ DAMA-DMBOK">
      {DIMENSION_KEYS.map((dim) => {
        const engines = DIMENSION_ENGINES[dim]
        if (engines.length === 0) return null
        const dMeta = DIMENSION_META[dim]
        const DimensionIcon = DIMENSION_ICONS[dim]
        const isRecommendedGroup = recommendedFor === dim
        return (
          <div
            key={dim}
            className={`rounded-lg border p-2 ${isRecommendedGroup ? 'border-emerald-300 bg-emerald-50/40' : 'bg-white'}`}
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-0.5">
              <span className={`flex size-5 items-center justify-center rounded border ${dMeta.badgeClass}`}>
                <DimensionIcon className="size-3" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-semibold text-slate-700">{dMeta.th}</span>
              <span className="text-[10px] text-muted-foreground">({dMeta.en})</span>
              {isRecommendedGroup && (
                <Badge variant="outline" className="border-emerald-300 bg-white text-[9.5px] text-emerald-800">
                  <Sparkles className="size-2.5" aria-hidden="true" />
                  มิติที่เลือก
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {engines.map((e) => {
                const selected = value === e
                const Icon = ENGINE_ICONS[e]
                return (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${CONDITIONS[e].th} (เอนจิน ${e})`}
                    onClick={() => onChange(e)}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-all hover:border-emerald-400 hover:bg-emerald-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                      selected ? 'border-emerald-500 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-500' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>{CONDITIONS[e].th}</span>
                    {selected && <Check className="size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** กล่องคำอธิบายเอนจินที่เลือก — วิธีตรวจ + พารามิเตอร์ที่ต้องกรอก + มิติที่ผูกอยู่ */
export function EngineHint({ value }: { value: string }) {
  if (!isConditionKey(value)) return null
  const def = CONDITIONS[value]
  const Icon = ENGINE_ICONS[value]
  const paramText =
    def.params.length > 0
      ? def.params
          .map((p) => {
            if (p.type === 'dataset') return `${p.label} (เลือกจากรายการชุดข้อมูล)`
            if (p.type === 'dataset-column') return `${p.label} (เลือกจากคอลัมน์ข้อมูลจริง)`
            return p.label
          })
          .join(' · ')
      : 'ไม่ต้องใช้พารามิเตอร์ — เลือกใช้ได้ทันที'
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-xs text-slate-700" role="note">
      <p className="flex items-center gap-1.5 font-medium text-emerald-900">
        <Icon className="size-3.5" aria-hidden="true" />
        {ENGINE_DESCRIPTIONS[value]}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-slate-600">พารามิเตอร์ที่ผู้ใช้กรอกตอนสร้างกฎ:</span> {paramText}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        <Sparkles className="size-3" aria-hidden="true" />
        ประโยคในกฎ: <code className="rounded bg-white px-1 py-0.5 font-mono text-[10.5px] text-emerald-800">…must {def.sentence}…</code>
        ผูกกับมิติ <span className="font-medium text-slate-700">{DIMENSION_LABELS[def.dimension].th}</span> ({def.dimension})
      </p>
    </div>
  )
}

/** จำนวนเอนจินทั้งหมดในระบบ (สำหรับแสดงในหัวข้อ) */
export const ENGINE_COUNT = CONDITION_KEYS.length
