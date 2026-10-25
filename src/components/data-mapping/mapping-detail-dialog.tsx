'use client'

/**
 * Mapping Detail Dialog (v0.22.0) — รายละเอียดสเปกการแมปฉบับเต็มแบบเอกสาร
 * คลิกจากตารางหน้า "การแมปข้อมูล" หรือแถวในแท็บ 5 ของ Dialog Data Element
 *
 * โครง 7 ส่วนตามสเปกผู้ใช้ (จัดกลุ่มให้อ่านไล่ตามเอกสาร integration spec):
 *   หัว Dialog  : รหัส + ป้ายประเภท/สถานะ/เวอร์ชัน/CDE + เส้นทาง
 *   A เส้นทางข้อมูล : กล่องต้นทาง → ปลายทาง (Business Term + ระบบ/Schema/ตาราง/คอลัมน์/ประเภทข้อมูลกายภาพ — ดึงอัตโนมัติจากการแมปคอลัมน์)
 *   B ประเภท + กฎการแปลง
 *   C กฎคุณภาพข้อมูล (DQ Rules แยกฝั่ง — จากกฎที่ผูกกับ element ทั้งสองฝั่ง)
 *   D การดำเนินการเมื่อข้อมูลไม่ผ่าน (Exception Action — สรุปจากกฎที่ผูก)
 *   E ธรรมาภิบาล (Owner/Steward/Custodian + การจำแนก + PII รายฝั่ง)
 *   F สถานะ/เวอร์ชัน + workflow (ปุ่มเดิม + ปรับเวอร์ชันด้วยมือสำหรับผู้อนุมัติ)
 *   G Audit Trail
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileText,
  History,
  Info,
  Loader2,
  Lock,
  PencilLine,
  ShieldCheck,
  Star,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import {
  EXCEPTION_ACTIONS,
  MAPPING_TYPES,
  isMappingType,
  isValidMappingVersion,
  type ExceptionActionKey,
} from '@/lib/mappings'
import { classificationLabel } from '@/lib/regulation'
import { MappingActions, MappingStatusBadge, MappingTypeBadge } from './mapping-row'
import type {
  MappingDetailResponse,
  MappingEndpointDetail,
  MappingPhysicalEndpoint,
  MappingRuleItem,
} from './types'

/* ----------------------------- helpers ----------------------------- */

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function classificationText(id: string): string {
  try {
    const cls = classificationLabel(id)
    return `${cls.th} (${cls.en})`
  } catch {
    return id === 'UNCLASSIFIED' ? 'ยังไม่จำแนก' : id
  }
}

/** รายการ label:value แบบสเปกเอกสาร — ป้ายซ้าย ค่าขวา อ่านไล่ลงบนง่าย */
function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] items-start gap-2 py-1 sm:grid-cols-[9rem_1fr]">
      <dt className="text-[11px] leading-5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-[13px] leading-5">{children}</dd>
    </div>
  )
}

function SideBadges({ side }: { side: MappingEndpointDetail }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {side.isCde && (
        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[9px] text-emerald-800">
          <Star className="mr-0.5 size-2.5" aria-hidden="true" /> CDE
        </Badge>
      )}
      {side.pii && (
        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[9px] text-amber-800">
          PII
        </Badge>
      )}
      {side.isFinancial && (
        <Badge variant="outline" className="border-teal-300 bg-teal-50 text-[9px] text-teal-800">
          การเงิน
        </Badge>
      )}
      <Badge variant="outline" className="text-[9px]">
        element: {side.status === 'ACTIVE' ? 'ใช้งาน' : side.status === 'DRAFT' ? 'ร่าง' : 'เลิกใช้'}
      </Badge>
    </span>
  )
}

/** ข้อมูลกายภาพของ element 1 ฝั่ง — ดึงอัตโนมัติจากการแมปคอลัมน์ (คำตอบข้อ 1: ทางเลือก ก) */
function PhysicalCard({ physical }: { physical: MappingPhysicalEndpoint[] }) {
  if (physical.length === 0) {
    return (
      <p className="rounded-md border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground">
        ยังไม่ผูกคอลัมน์กายภาพในระบบ — ผูกผ่านแท็บ "เชิงเทคนิค" ของ Data Element
      </p>
    )
  }
  return (
    <ul className="space-y-1.5">
      {physical.map((p) => (
        <li key={`${p.assetId}|${p.columnName}`} className="rounded-md border bg-muted/30 px-2.5 py-2">
          <SpecRow label="ระบบ (System)">
            <span className="font-medium">{p.assetName}</span>
          </SpecRow>
          <SpecRow label="Schema">
            <span className="font-mono text-[12px]">{p.schemaName || '—'}</span>
          </SpecRow>
          <SpecRow label="ตาราง (Table)">
            <span className="font-mono text-[12px]">{p.tableName || '—'}</span>
          </SpecRow>
          <SpecRow label="คอลัมน์ (Column)">
            <span className="font-mono text-[12px]">{p.columnName}</span>
          </SpecRow>
          <SpecRow label="ประเภทข้อมูล">
            <span className="font-mono text-[12px]">{p.physicalType || p.dataType || '—'}</span>
          </SpecRow>
        </li>
      ))}
    </ul>
  )
}

/** การ์ด endpoint 1 ฝั่ง (ต้นทาง/ปลายทาง) ในส่วน A */
function SideFlowCard({ side, role }: { side: MappingEndpointDetail; role: string }) {
  return (
    <div className="min-w-0 rounded-lg border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{role}</p>
      <p className="mt-0.5 text-sm font-semibold leading-5">
        {side.nameTh || side.nameEn}
        {side.nameEn && side.nameTh ? <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{side.nameEn}</span> : null}
      </p>
      <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{side.path}</p>
      <div className="mt-1.5">
        <SideBadges side={side} />
      </div>
      <Separator className="my-2" />
      <PhysicalCard physical={side.physical} />
    </div>
  )
}

const SEVERITY_CHIP: Record<string, string> = {
  CRITICAL: 'border-rose-300 bg-rose-50 text-rose-800',
  HIGH: 'border-amber-300 bg-amber-50 text-amber-800',
  MEDIUM: 'border-yellow-300 bg-yellow-50 text-yellow-800',
  LOW: 'border-slate-300 bg-slate-100 text-slate-600',
}

/** แถวกฎ DQ 1 ข้อ — ชื่อเงื่อนไข + คอลัมน์ + ความรุนแรง + action + ผลรันล่าสุด */
function RuleRow({ rule }: { rule: MappingRuleItem }) {
  const actionLabel = rule.exceptionAction
    ? (EXCEPTION_ACTIONS[rule.exceptionAction as ExceptionActionKey]?.th ?? rule.exceptionAction)
    : null
  return (
    <li className="rounded-md border px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[13px] font-medium">{rule.conditionName}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{rule.column}</span>
        <Badge variant="outline" className={`text-[9px] ${SEVERITY_CHIP[rule.severity] ?? ''}`}>
          {rule.severity}
        </Badge>
        {actionLabel && (
          <Badge variant="outline" className="border-teal-300 bg-teal-50 text-[9px] text-teal-800">
            {actionLabel}
          </Badge>
        )}
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        มิติ: {rule.dimension}
        {rule.lastRun
          ? ` · ผลรันล่าสุด: ${
              rule.lastRun.status === 'NO_DATA'
                ? 'ไม่มีข้อมูล (0 แถว)'
                : `${rule.lastRun.status === 'PASSED' ? 'ผ่าน' : 'ไม่ผ่าน'} ${Math.round(rule.lastRun.passRate * 100)}%`
            } (${formatWhen(rule.lastRun.createdAt)})`
          : ' · ยังไม่เคยรัน'}
      </p>
      {rule.exceptionActionNote && <p className="mt-0.5 text-[11px] text-foreground/80">{rule.exceptionActionNote}</p>}
    </li>
  )
}

/** กลุ่มกฎฝั่งใดฝั่งหนึ่ง */
function RuleGroup({ title, rules }: { title: string; rules: MappingRuleItem[] }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
        {title} ({rules.length})
      </p>
      {rules.length === 0 ? (
        <p className="rounded-md border border-dashed px-2.5 py-2 text-[11px] text-muted-foreground">
          ยังไม่มีกฎที่ผูกกับ element ฝั่งนี้
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rules.map((r) => (
            <RuleRow key={r.id} rule={r} />
          ))}
        </ul>
      )}
    </div>
  )
}

/* ----------------------------- dialog ----------------------------- */

export interface MappingDetailDialogProps {
  /** id ของ mapping — มีค่าเมื่อเปิดจากแถว/ปุ่ม */
  mappingId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** ผู้ดำเนินการฝั่งจัดการ (MANAGE_DATASETS) — ส่งต่อให้ MappingActions */
  operatorEmail: string
  /** ผู้ดำเนินการฝั่งอนุมัติ (APPROVE_EXCEPTIONS) — ปุ่ม workflow + ปรับเวอร์ชัน */
  approverEmail: string
  /** เรียกหลังเนื้อหาเปลี่ยน (parent ใช้รีเฟรชรายการ) */
  onChanged?: () => void | Promise<void>
}

export function MappingDetailDialog({
  mappingId,
  open,
  onOpenChange,
  operatorEmail,
  approverEmail,
  onChanged,
}: MappingDetailDialogProps) {
  const { toast } = useToast()
  const [detail, setDetail] = useState<MappingDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [versionEditing, setVersionEditing] = useState(false)
  const [versionInput, setVersionInput] = useState('')
  const [savingVersion, setSavingVersion] = useState(false)

  const load = useCallback(async () => {
    if (!mappingId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/mappings/${mappingId}`)
      const data = (await res.json()) as MappingDetailResponse & { error?: string }
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      setDetail(data)
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้')
    } finally {
      setLoading(false)
    }
  }, [mappingId])

  useEffect(() => {
    if (open) {
      setVersionEditing(false)
      void load()
    } else {
      setDetail(null)
      setError(null)
    }
  }, [open, load])

  async function saveVersion() {
    if (!mappingId) return
    const version = versionInput.trim()
    if (!isValidMappingVersion(version)) {
      toast({ title: 'รูปแบบเวอร์ชันไม่ถูกต้อง — ใช้ X.Y เช่น 2.0', variant: 'destructive' })
      return
    }
    setSavingVersion(true)
    try {
      const res = await fetch(`/api/mappings/${mappingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail: approverEmail, action: 'SET_VERSION', version }),
      })
      const data = (await res.json()) as { message?: string; error?: string }
      if (!res.ok) {
        toast({ title: 'ปรับเวอร์ชันไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'ปรับเวอร์ชันแล้ว' })
      setVersionEditing(false)
      await load()
      await onChanged?.()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setSavingVersion(false)
    }
  }

  const m = detail?.mapping ?? null
  const canApprove = approverEmail.length > 0
  const typeMeta = m && isMappingType(m.mappingType) ? MAPPING_TYPES[m.mappingType] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-1.5 pr-6 text-base">
            <span className="font-mono">{m?.code ?? 'กำลังโหลด…'}</span>
            {m && <MappingTypeBadge type={m.mappingType} />}
            {m && <MappingStatusBadge mapping={m} />}
            {m && (
              <Badge variant="outline" className="font-mono text-[10px]" title="เวอร์ชันสเปกการแมป">
                v{m.version}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            รายละเอียดสเปกการแมปข้อมูลฉบับเต็ม: เส้นทาง ข้อมูลกายภาพ กฎคุณภาพ ธรรมาภิบาล และประวัติ
          </DialogDescription>
          {m && (
            <p className="break-all font-mono text-[11px] text-muted-foreground">
              {m.source.path} <ArrowRight className="inline size-3" aria-hidden="true" /> {m.target.path}
            </p>
          )}
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> กำลังโหลดรายละเอียด…
          </div>
        )}

        {!loading && error && (
          <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
            <Button size="sm" variant="outline" className="ml-2 h-7 text-[11px]" onClick={() => void load()}>
              ลองอีกครั้ง
            </Button>
          </div>
        )}

        {!loading && !error && m && detail && (
          <div className="space-y-5">
            {/* A — เส้นทางข้อมูล: ต้นทาง → ปลายทาง (พร้อมข้อมูลกายภาพอัตโนมัติ) */}
            <section aria-labelledby="md-flow">
              <h3 id="md-flow" className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <Database className="size-3.5 text-emerald-700" aria-hidden="true" /> เส้นทางข้อมูล (Data Flow)
              </h3>
              <div className="grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr]">
                {detail.source ? (
                  <SideFlowCard side={detail.source} role="ต้นทาง (Source)" />
                ) : (
                  <p className="text-sm text-muted-foreground">ไม่พบข้อมูลต้นทาง</p>
                )}
                <div className="flex items-center justify-center md:px-1">
                  <ArrowRight className="size-5 rotate-90 text-emerald-700 md:rotate-0" aria-hidden="true" />
                </div>
                {detail.target ? (
                  <SideFlowCard side={detail.target} role="ปลายทาง (Target)" />
                ) : (
                  <p className="text-sm text-muted-foreground">ไม่พบข้อมูลปลายทาง</p>
                )}
              </div>
            </section>

            {/* B — ประเภทการแมป + กฎการแปลง */}
            <section aria-labelledby="md-transform">
              <h3 id="md-transform" className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <FileText className="size-3.5 text-emerald-700" aria-hidden="true" /> ประเภทการแมปและกฎการแปลง
              </h3>
              <dl className="rounded-lg border bg-card px-3 py-2">
                <SpecRow label="ประเภท">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <MappingTypeBadge type={m.mappingType} />
                    {typeMeta && <span className="text-[11px] text-muted-foreground">{typeMeta.desc}</span>}
                  </span>
                </SpecRow>
                {m.transformNote && (
                  <SpecRow label="กฎการแปลง">
                    <code className="block rounded-md bg-muted px-2.5 py-1.5 font-mono text-[12px]">{m.transformNote}</code>
                  </SpecRow>
                )}
                {m.mappingType === 'LOOKUP' && (
                  <SpecRow label="ทะเบียนข้อมูลอ้างอิง">
                    {m.lookupSet ? (
                      <span className="text-[12px]">
                        {m.lookupSet.name} <span className="font-mono text-[11px] text-muted-foreground">({m.lookupSet.code})</span>
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">ไม่ระบุทะเบียน — ดูกฎการแปลงเป็นข้อความ</span>
                    )}
                  </SpecRow>
                )}
                {m.note && (
                  <SpecRow label="หมายเหตุ">
                    <span className="text-[12px] text-foreground/80">{m.note}</span>
                  </SpecRow>
                )}
              </dl>
            </section>

            {/* C — กฎคุณภาพข้อมูล (แยกฝั่ง) */}
            <section aria-labelledby="md-rules">
              <h3 id="md-rules" className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <ShieldCheck className="size-3.5 text-emerald-700" aria-hidden="true" /> กฎคุณภาพข้อมูล (DQ Rules)
              </h3>
              <div className="grid gap-3 rounded-lg border bg-card p-3 md:grid-cols-2">
                <RuleGroup title="กฎฝั่งต้นทาง" rules={detail.source?.rules ?? []} />
                <RuleGroup title="กฎฝั่งปลายทาง" rules={detail.target?.rules ?? []} />
              </div>
            </section>

            {/* D — การดำเนินการเมื่อข้อมูลไม่ผ่าน (สรุปจากกฎที่ผูก) */}
            <section aria-labelledby="md-exception">
              <h3 id="md-exception" className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <XCircle className="size-3.5 text-emerald-700" aria-hidden="true" /> การดำเนินการเมื่อข้อมูลไม่ผ่าน (Exception Action)
              </h3>
              <div className="rounded-lg border bg-card px-3 py-2.5">
                {detail.exceptionActions.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">ยังไม่ได้ระบุ — กำหนดได้ที่กฎแต่ละข้อในคลังกฎ (DQ Rule Library)</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {detail.exceptionActions.map(({ key, count }) => (
                      <Badge
                        key={key}
                        variant="outline"
                        className="border-teal-300 bg-teal-50 px-2.5 py-1 text-[11px] text-teal-900"
                        title={EXCEPTION_ACTIONS[key as ExceptionActionKey]?.desc ?? key}
                      >
                        {EXCEPTION_ACTIONS[key as ExceptionActionKey]?.th ?? key} × {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* E — ธรรมาภิบาล รายฝั่ง */}
            <section aria-labelledby="md-gov">
              <h3 id="md-gov" className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <Lock className="size-3.5 text-emerald-700" aria-hidden="true" /> ธรรมาภิบาล (Governance)
              </h3>
              <div className="grid gap-2 md:grid-cols-2">
                {[detail.source, detail.target].map((side, i) =>
                  side ? (
                    <dl key={side.id} className="rounded-lg border bg-card px-3 py-2">
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        {i === 0 ? 'ต้นทาง' : 'ปลายทาง'} · {side.nameTh || side.nameEn}
                      </p>
                      <SpecRow label="เจ้าของข้อมูล">
                        {side.owner ? `${side.owner.name} (${side.owner.roleTh ?? '—'})` : '—'}
                      </SpecRow>
                      <SpecRow label="ผู้ดูแลข้อมูล">
                        {side.steward ? `${side.steward.name} (${side.steward.roleTh ?? '—'})` : '—'}
                      </SpecRow>
                      <SpecRow label="ผู้เก็บรักษา">
                        {side.custodian ? `${side.custodian.name} (${side.custodian.roleTh ?? '—'})` : '—'}
                      </SpecRow>
                      <SpecRow label="การจำแนกข้อมูล">{classificationText(side.classification)}</SpecRow>
                      <SpecRow label="PII">{side.pii ? 'ใช่ — ข้อมูลส่วนบุคคล (PDPA)' : 'ไม่ใช่'}</SpecRow>
                    </dl>
                  ) : null,
                )}
              </div>
            </section>

            {/* F — สถานะ/เวอร์ชัน + workflow */}
            <section aria-labelledby="md-status">
              <h3 id="md-status" className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <Info className="size-3.5 text-emerald-700" aria-hidden="true" /> สถานะ เวอร์ชัน และการดำเนินการ
              </h3>
              <div className="rounded-lg border bg-card px-3 py-2">
                <dl>
                  <SpecRow label="สถานะ">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <MappingStatusBadge mapping={m} />
                      <span className="text-[11px] text-muted-foreground">
                        {m.status === 'ACTIVE' ? 'อนุมัติแล้ว ใช้งานได้ (Approved)' : m.status === 'DRAFT' ? 'ร่าง — ต้องส่งขออนุมัติ' : 'เลิกใช้งาน'}
                      </span>
                    </span>
                  </SpecRow>
                  <SpecRow label="เวอร์ชัน">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] font-medium">v{m.version}</span>
                      <span className="text-[10px] text-muted-foreground">อัตโนมัติ +0.1 เมื่ออนุมัติเนื้อหาที่แก้ไข</span>
                      {canApprove && !versionEditing && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => {
                            setVersionInput(m.version)
                            setVersionEditing(true)
                          }}
                          title="ปรับเวอร์ชันด้วยมือ (ต้องมีสิทธิ์อนุมัติข้อยกเว้น) — บันทึกใน Audit Trail"
                        >
                          <PencilLine className="size-3" aria-hidden="true" /> ปรับเวอร์ชัน
                        </Button>
                      )}
                    </span>
                  </SpecRow>
                  {versionEditing && (
                    <SpecRow label="เวอร์ชันใหม่">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Input
                          value={versionInput}
                          onChange={(e) => setVersionInput(e.target.value)}
                          className="h-8 w-24 font-mono text-[12px]"
                          placeholder="เช่น 2.0"
                          aria-label="เวอร์ชันใหม่ (รูปแบบ X.Y)"
                          maxLength={8}
                        />
                        <Button
                          size="sm"
                          className="h-8 bg-emerald-600 px-2.5 text-[11px] text-white hover:bg-emerald-700"
                          disabled={savingVersion || !isValidMappingVersion(versionInput.trim()) || versionInput.trim() === m.version}
                          onClick={() => void saveVersion()}
                        >
                          {savingVersion ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-3" aria-hidden="true" />}
                          บันทึก
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 px-2 text-[11px]" onClick={() => setVersionEditing(false)}>
                          ยกเลิก
                        </Button>
                      </span>
                    </SpecRow>
                  )}
                  <SpecRow label="ผู้อนุมัติล่าสุด">
                    {m.approvedBy ? `${m.approvedBy} · ${formatWhen(m.approvedAt)}` : 'ยังไม่มีการอนุมัติ'}
                  </SpecRow>
                  <SpecRow label="ผู้สร้าง">
                    {m.createdBy} · {formatWhen(m.createdAt)}
                  </SpecRow>
                </dl>
                <Separator className="my-2" />
                <MappingActions
                  mapping={m}
                  operatorEmail={operatorEmail}
                  approverEmail={approverEmail}
                  onChanged={async () => {
                    await load()
                    await onChanged?.()
                  }}
                />
                {!operatorEmail && !approverEmail && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    เลือก "ผู้ดำเนินการ" และ "ผู้อนุมัติ" ด้านบนหน้าเพื่อแสดงปุ่มดำเนินการ (deny-by-default)
                  </p>
                )}
              </div>
            </section>

            {/* G — Audit Trail */}
            <section aria-labelledby="md-audit">
              <h3 id="md-audit" className="mb-2 flex items-center gap-1.5 text-xs font-semibold">
                <History className="size-3.5 text-emerald-700" aria-hidden="true" /> Audit Trail
              </h3>
              <div className="max-h-48 overflow-y-auto rounded-lg border bg-card px-3 py-2 [scrollbar-width:thin]">
                {detail.audit.length === 0 ? (
                  <p className="text-[12px] text-muted-foreground">ยังไม่มีประวัติการทำรายการของ mapping นี้</p>
                ) : (
                  <ol className="space-y-1.5">
                    {detail.audit.map((a) => (
                      <li key={a.id} className="border-l-2 border-emerald-200 pl-2.5">
                        <p className="text-[12px] leading-5">{a.detail}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatWhen(a.createdAt)} · {a.actor}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
