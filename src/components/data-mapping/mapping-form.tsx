'use client'

/**
 * MappingForm (v0.21.0) — ฟอร์มสร้าง Data Mapping ใช้ร่วม 2 ที่:
 * 1) แท็บ "การแมปข้อมูล" ใน Dialog Data Element (มี fixedElement = element ปัจจุบัน + เลือกทิศ เพิ่มต้นทาง/เพิ่มปลายทาง)
 * 2) หน้า Data Mapping (ไม่มี fixedElement — เลือกต้นทาง/ปลายทางเองผ่าน cascade โดเมนหลัก → โดเมนย่อย → element)
 * กติกา: element ทั้งสองฝั่งต้องเป็น ACTIVE · ประเภทที่ต้องมี transformNote ตรวจจาก MAPPING_TYPES[type].requiresNote
 * error จาก API แสดงเป็นข้อความในฟอร์มเสมอ (ข้อความภาษาไทยจาก backend)
 */

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ROLES, type RoleKey } from '@/lib/rbac'
import { MAPPING_TYPES, MAPPING_TYPE_KEYS, type MappingTypeKey } from '@/lib/mappings'
import type { OperatorUser, PickerDomain, PickerElement } from './types'

export interface FixedElement {
  id: string
  code: string
  nameTh: string
  path: string
}

interface MappingFormProps {
  operators: OperatorUser[]
  defaultOperator?: string
  domains: PickerDomain[]
  elements: PickerElement[]
  /** element ฝั่งตายตัว (โหมดจาก Dialog element) — ไม่ระบุ = เลือกทั้งสองฝั่ง */
  fixedElement?: FixedElement | null
  onCreated: (message: string) => void
  onCancel: () => void
}

/** cascade เลือก element ฝั่งใดฝั่งหนึ่ง: โดเมนหลัก → โดเมนย่อย → element (ACTIVE เท่านั้น) */
function ElementCascade({
  idPrefix,
  label,
  domains,
  elements,
  excludeIds,
  value,
  onChange,
}: {
  idPrefix: string
  label: string
  domains: PickerDomain[]
  elements: PickerElement[]
  excludeIds: string[]
  value: { domainId: string; subDomainId: string; elementId: string }
  onChange: (next: { domainId: string; subDomainId: string; elementId: string }) => void
}) {
  const parentDomains = useMemo(() => domains.filter((d) => !d.parentId), [domains])
  const subDomains = useMemo(
    () => domains.filter((d) => d.parentId === value.domainId),
    [domains, value.domainId],
  )
  const eligible = useMemo(() => {
    const excluded = new Set(excludeIds)
    return elements.filter((e) => e.status === 'ACTIVE' && !excluded.has(e.id) && (!value.subDomainId || e.subDomainId === value.subDomainId))
  }, [elements, excludeIds, value.subDomainId])

  return (
    <div className="grid gap-1.5 rounded-lg border p-2.5">
      <p className="text-xs font-semibold">{label}</p>
      <Select
        value={value.domainId || 'none'}
        onValueChange={(v) => onChange({ domainId: v === 'none' ? '' : v, subDomainId: '', elementId: '' })}
      >
        <SelectTrigger id={`${idPrefix}-domain`} className="h-8 w-full text-xs" aria-label={`${label} — โดเมนหลัก`}>
          <SelectValue placeholder="— เลือกโดเมนหลัก —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— ทุกโดเมนหลัก —</SelectItem>
          {parentDomains.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
              {d.nameEn ? ` · ${d.nameEn}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={value.subDomainId || 'none'}
        onValueChange={(v) => onChange({ ...value, subDomainId: v === 'none' ? '' : v, elementId: '' })}
        disabled={!value.domainId}
      >
        <SelectTrigger id={`${idPrefix}-sub`} className="h-8 w-full text-xs" aria-label={`${label} — โดเมนย่อย`}>
          <SelectValue placeholder={value.domainId ? '— เลือกโดเมนย่อย —' : 'เลือกโดเมนหลักก่อน'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— ทุกโดเมนย่อย —</SelectItem>
          {subDomains.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              └ {d.name}
              {d.nameEn ? ` · ${d.nameEn}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.elementId} onValueChange={(v) => onChange({ ...value, elementId: v })} disabled={eligible.length === 0}>
        <SelectTrigger id={`${idPrefix}-element`} className="h-8 w-full text-xs" aria-label={`${label} — Data Element`}>
          <SelectValue placeholder={eligible.length === 0 ? 'ไม่มี element ให้เลือก' : '— เลือก Data Element (ACTIVE) —'} />
        </SelectTrigger>
        <SelectContent>
          {eligible.map((e) => (
            <SelectItem key={e.id} value={e.id}>
              <span className="font-mono text-[10px]">{e.code}</span> · {e.nameTh}
              {e.nameEn ? ` (${e.nameEn})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function MappingForm({ operators, defaultOperator, domains, elements, fixedElement, onCreated, onCancel }: MappingFormProps) {
  const [operatorEmail, setOperatorEmail] = useState(defaultOperator ?? '')
  const [direction, setDirection] = useState<'source' | 'target'>('target') // target = เพิ่มปลายทาง (element ปัจจุบันเป็นต้นทาง)
  const [mappingType, setMappingType] = useState<MappingTypeKey>('DIRECT')
  const [transformNote, setTransformNote] = useState('')
  const [note, setNote] = useState('')
  const [source, setSource] = useState({ domainId: '', subDomainId: '', elementId: '' })
  const [target, setTarget] = useState({ domainId: '', subDomainId: '', elementId: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // เลือกผู้ดำเนินการเริ่มต้นให้เองเมื่อรายชื่อโหลดมา (คนแรกที่มีสิทธิ์จัดการ)
  useEffect(() => {
    if (operators.length === 0) return
    if (operatorEmail && operators.some((u) => u.email === operatorEmail)) return
    const def = defaultOperator && operators.some((u) => u.email === defaultOperator) ? defaultOperator : operators[0].email
    setOperatorEmail(def)
  }, [operators, operatorEmail, defaultOperator])

  // โหมด fixed: element ตายตัวอยู่ฝั่งใดฝั่งหนึ่งตามทิศที่เลือก
  const resolvedSourceId = fixedElement ? (direction === 'source' ? source.elementId : fixedElement.id) : source.elementId
  const resolvedTargetId = fixedElement ? (direction === 'target' ? target.elementId : fixedElement.id) : target.elementId
  const requiresNote = MAPPING_TYPES[mappingType].requiresNote
  const canSubmit = Boolean(operatorEmail && resolvedSourceId && resolvedTargetId && (!requiresNote || transformNote.trim()))

  async function submit() {
    if (!operatorEmail) {
      setError('กรุณาเลือกผู้ดำเนินการ')
      return
    }
    if (!resolvedSourceId || !resolvedTargetId) {
      setError('กรุณาเลือก Data Element ต้นทางและปลายทางให้ครบ (เฉพาะ element สถานะ ACTIVE)')
      return
    }
    if (requiresNote && !transformNote.trim()) {
      setError(`ประเภท "${MAPPING_TYPES[mappingType].th}" ต้องระบุรายละเอียดการแปลง/สูตร/ตารางอ้างอิง`)
      return
    }
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorEmail,
          sourceElementId: resolvedSourceId,
          targetElementId: resolvedTargetId,
          mappingType,
          transformNote: transformNote.trim(),
          note: note.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `บันทึกไม่สำเร็จ (HTTP ${res.status})`)
        return
      }
      onCreated(data.message ?? 'สร้าง Data Mapping แล้ว')
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้ง')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      {/* ผู้ดำเนินการ — เฉพาะบทบาทที่มีสิทธิ์จัดการชุดข้อมูล (MANAGE_DATASETS) */}
      <div className="grid gap-1.5">
        <Label htmlFor="mp-operator">ผู้ดำเนินการ (ต้องมีสิทธิ์ &quot;จัดการชุดข้อมูล&quot;)</Label>
        <Select value={operatorEmail} onValueChange={setOperatorEmail}>
          <SelectTrigger id="mp-operator" className="h-8 w-full text-xs" aria-label="ผู้ดำเนินการสร้าง mapping">
            <SelectValue placeholder={operators.length === 0 ? 'ไม่พบผู้มีสิทธิ์' : '— เลือกผู้ดำเนินการ —'} />
          </SelectTrigger>
          <SelectContent>
            {operators.map((u) => (
              <SelectItem key={u.email} value={u.email}>
                {u.name} · {ROLES[u.role as RoleKey]?.th ?? u.role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* เลือกทิศ (เฉพาะโหมดจาก Dialog element) */}
      {fixedElement && (
        <div className="grid gap-1.5">
          <Label>ทิศทางการแมป</Label>
          <div className="flex gap-2" role="group" aria-label="เลือกทิศทางการแมป">
            <Button
              type="button"
              size="sm"
              variant={direction === 'source' ? 'default' : 'outline'}
              className={`h-8 text-xs ${direction === 'source' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}`}
              aria-pressed={direction === 'source'}
              onClick={() => setDirection('source')}
            >
              เพิ่มต้นทาง — ข้อมูลไหลเข้า element นี้
            </Button>
            <Button
              type="button"
              size="sm"
              variant={direction === 'target' ? 'default' : 'outline'}
              className={`h-8 text-xs ${direction === 'target' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}`}
              aria-pressed={direction === 'target'}
              onClick={() => setDirection('target')}
            >
              เพิ่มปลายทาง — ข้อมูลไหลออกจาก element นี้
            </Button>
          </div>
          <p className="rounded-lg border bg-emerald-50/60 px-2.5 py-1.5 text-[11px] text-emerald-900">
            Element ฝั่งตายตัว: <span className="font-mono">{fixedElement.code}</span> {fixedElement.nameTh} ·{' '}
            <span className="font-mono">{fixedElement.path}</span>
          </p>
        </div>
      )}

      {/* picker — fixed: ฝั่งเดียว / อิสระ: สองฝั่ง */}
      <div className={fixedElement ? 'grid' : 'grid gap-3 md:grid-cols-2'}>
        {!fixedElement && (
          <ElementCascade
            idPrefix="mp-src"
            label="ต้นทาง (Source)"
            domains={domains}
            elements={elements}
            excludeIds={target.elementId ? [target.elementId] : []}
            value={source}
            onChange={setSource}
          />
        )}
        {fixedElement ? (
          <ElementCascade
            idPrefix="mp-pick"
            label={direction === 'source' ? 'ต้นทาง (Source) — element ที่ไหลเข้า' : 'ปลายทาง (Target) — element ที่รับข้อมูล'}
            domains={domains}
            elements={elements}
            excludeIds={[fixedElement.id]}
            value={direction === 'source' ? source : target}
            onChange={direction === 'source' ? setSource : setTarget}
          />
        ) : (
          <ElementCascade
            idPrefix="mp-tgt"
            label="ปลายทาง (Target)"
            domains={domains}
            elements={elements}
            excludeIds={source.elementId ? [source.elementId] : []}
            value={target}
            onChange={setTarget}
          />
        )}
      </div>

      {/* ประเภทการแมป — ป้าย/คำอธิบายจาก MAPPING_TYPES เสมอ */}
      <div className="grid gap-1.5">
        <Label htmlFor="mp-type">ประเภทการแมป</Label>
        <Select value={mappingType} onValueChange={(v) => setMappingType(v as MappingTypeKey)}>
          <SelectTrigger id="mp-type" className="h-8 w-full text-xs" aria-label="ประเภทการแมป">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MAPPING_TYPE_KEYS.map((t) => (
              <SelectItem key={t} value={t}>
                {MAPPING_TYPES[t].th} ({MAPPING_TYPES[t].en}){MAPPING_TYPES[t].requiresNote ? ' · ต้องระบุวิธีแปลง' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          {MAPPING_TYPES[mappingType].desc} · ตัวอย่าง: {MAPPING_TYPES[mappingType].example}
        </p>
      </div>

      {requiresNote && (
        <div className="grid gap-1.5">
          <Label htmlFor="mp-transform">
            รายละเอียดการแปลง / สูตร / ตารางอ้างอิง <span className="text-rose-600">*</span>
          </Label>
          <Textarea
            id="mp-transform"
            value={transformNote}
            onChange={(e) => setTransformNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={`เช่น ${MAPPING_TYPES[mappingType].example}`}
            aria-required="true"
          />
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="mp-note">หมายเหตุ (ไม่บังคับ)</Label>
        <Textarea id="mp-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="เช่น โหลดเข้ามิติลูกค้าทุกคืน 23:00 น." />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          ยกเลิก
        </Button>
        <Button type="button" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={busy || !canSubmit} onClick={() => void submit()}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} สร้างการแมป
        </Button>
      </div>
    </div>
  )
}

export default MappingForm
