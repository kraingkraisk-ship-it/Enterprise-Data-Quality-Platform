'use client'

/**
 * Data Mapping — badge / แถว / ปุ่ม workflow (v0.21.0)
 * ใช้ร่วมกันทั้งแท็บ "การแมปข้อมูล" ใน Dialog Data Element และหน้า Data Mapping
 * สิทธิ์ deny-by-default: ปุ่มแสดงเฉพาะเมื่อผู้ดำเนินการที่เลือกมีสิทธิ์ตามบทบาท
 * (ส่ง/ลบ = MANAGE_DATASETS · อนุมัติ/ส่งกลับ/เลิกใช้ = APPROVE_EXCEPTIONS — สิทธิ์เดิมของระบบ)
 */

import { useState } from 'react'
import { Archive, CheckCircle2, Clock3, Loader2, Send, Trash2, XCircle } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { MAPPING_TYPES, MAPPING_TYPE_KEYS, isMappingType, type MappingStatus } from '@/lib/mappings'
import type { ExpandedMapping } from './types'

/* ----------------------------- badges ----------------------------- */

/** ป้ายสถานะ mapping — DRAFT ร่าง / ACTIVE ใช้งาน / DEPRECATED เลิกใช้ (+ "รออนุมัติ" เมื่อ pendingApproval) */
export const MAPPING_STATUS_META: Record<MappingStatus, { th: string; en: string; chip: string }> = {
  DRAFT: { th: 'ร่าง', en: 'Draft', chip: 'border-amber-300 bg-amber-50 text-amber-800' },
  ACTIVE: { th: 'ใช้งาน', en: 'Active', chip: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  DEPRECATED: { th: 'เลิกใช้', en: 'Deprecated', chip: 'border-slate-300 bg-slate-100 text-slate-600' },
}

export function MappingStatusBadge({ mapping }: { mapping: Pick<ExpandedMapping, 'status' | 'pendingApproval'> }) {
  const meta = MAPPING_STATUS_META[mapping.status] ?? MAPPING_STATUS_META.DRAFT
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className={`text-[10px] ${meta.chip}`}>
        {meta.th}
      </Badge>
      {mapping.pendingApproval && (
        <Badge variant="outline" className="border-sky-300 bg-sky-50 text-[10px] text-sky-800">
          <Clock3 className="mr-0.5 size-2.5" aria-hidden="true" /> รออนุมัติ
        </Badge>
      )}
    </span>
  )
}

export function MappingTypeBadge({ type }: { type: string }) {
  const key = isMappingType(type) ? type : 'DIRECT'
  const meta = MAPPING_TYPES[key]
  return (
    <Badge
      variant="outline"
      className="text-[10px]"
      title={`${meta.desc} · ตัวอย่าง: ${meta.example}`}
    >
      {meta.th} ({meta.en})
    </Badge>
  )
}

/* ----------------------------- workflow actions ----------------------------- */

interface MappingActionsProps {
  mapping: ExpandedMapping
  /** ผู้ดำเนินการฝั่งจัดการ (MANAGE_DATASETS) — เลือกที่หน้า/แท็บ หากว่าง = ไม่แสดงปุ่ม (deny-by-default) */
  operatorEmail: string
  /** ผู้ดำเนินการฝั่งอนุมัติ (APPROVE_EXCEPTIONS) — เลือกที่หน้า/แท็บ หากว่าง = ไม่แสดงปุ่ม */
  approverEmail: string
  /** เรียกหลังดำเนินการสำเร็จ (parent ใช้รีเฟรชรายการ) */
  onChanged: () => void | Promise<void>
}

/** ปุ่ม workflow ราย mapping: ส่งขออนุมัติ / อนุมัติ / ส่งกลับ / เลิกใช้ / ลบ — PATCH /api/mappings/[id] */
export function MappingActions({ mapping, operatorEmail, approverEmail, onChanged }: MappingActionsProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [noteOpen, setNoteOpen] = useState<'REJECT_APPROVAL' | 'DEPRECATE' | null>(null)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const canManage = operatorEmail.length > 0
  const canApprove = approverEmail.length > 0
  const showSubmit = canManage && !mapping.pendingApproval && (mapping.status === 'DRAFT' || mapping.status === 'DEPRECATED')
  const showApprove = canApprove && mapping.pendingApproval
  const showDeprecate = canApprove && !mapping.pendingApproval && mapping.status === 'ACTIVE'
  const showDelete = canManage && !mapping.pendingApproval

  async function run(action: string, extra?: Record<string, unknown>) {
    const operator = action === 'APPROVE' || action === 'REJECT_APPROVAL' || action === 'DEPRECATE' ? approverEmail : operatorEmail
    if (!operator) {
      toast({ title: 'กรุณาเลือกผู้ดำเนินการก่อน', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/mappings/${mapping.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operatorEmail: operator, action, ...(extra ?? {}) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'ดำเนินการไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      toast({ title: data.message ?? 'ดำเนินการแล้ว' })
      await onChanged()
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (!showSubmit && !showApprove && !showDeprecate && !showDelete) return null

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`การดำเนินการ mapping ${mapping.code}`}>
        {showSubmit && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-emerald-300 px-2 text-[11px] text-emerald-800 hover:bg-emerald-50"
            disabled={busy}
            onClick={() => void run('SUBMIT_APPROVAL')}
            title="ส่งขออนุมัติ (ต้องมีสิทธิ์จัดการชุดข้อมูล)"
          >
            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <Send className="size-3" aria-hidden="true" />}
            ส่งขออนุมัติ
          </Button>
        )}
        {showApprove && (
          <>
            <Button
              size="sm"
              className="h-7 bg-emerald-600 px-2 text-[11px] text-white hover:bg-emerald-700"
              disabled={busy}
              onClick={() => void run('APPROVE')}
              title="อนุมัติ (ต้องมีสิทธิ์อนุมัติข้อยกเว้น)"
            >
              {busy ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-3" aria-hidden="true" />}
              อนุมัติ
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-rose-300 px-2 text-[11px] text-rose-700 hover:bg-rose-50"
              disabled={busy}
              onClick={() => {
                setNote('')
                setNoteOpen('REJECT_APPROVAL')
              }}
              title="ส่งกลับให้ผู้ดูแลแก้ไข (ระบุเหตุผลได้)"
            >
              <XCircle className="size-3" aria-hidden="true" /> ส่งกลับ
            </Button>
          </>
        )}
        {showDeprecate && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 border-amber-300 px-2 text-[11px] text-amber-800 hover:bg-amber-50"
            disabled={busy}
            onClick={() => {
              setNote('')
              setNoteOpen('DEPRECATE')
            }}
            title="เลิกใช้ mapping (ต้องมีสิทธิ์อนุมัติข้อยกเว้น)"
          >
            <Archive className="size-3" aria-hidden="true" /> เลิกใช้
          </Button>
        )}
        {showDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
            title="ลบ mapping ถาวร (ต้องมีสิทธิ์จัดการชุดข้อมูล)"
          >
            <Trash2 className="size-3" aria-hidden="true" /> ลบ
          </Button>
        )}
      </div>

      {/* Dialog เหตุผล (ส่งกลับ / เลิกใช้ — ไม่บังคับกรอก) */}
      <Dialog open={noteOpen !== null} onOpenChange={(o) => { if (!o) setNoteOpen(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{noteOpen === 'REJECT_APPROVAL' ? 'ส่งกลับ mapping' : 'เลิกใช้ mapping'}</DialogTitle>
            <DialogDescription>
              {noteOpen === 'REJECT_APPROVAL'
                ? `ส่งกลับ ${mapping.code} ให้ผู้ดูแลแก้ไขแล้วส่งขออนุมัติใหม่ — คงสถานะเดิมไว้`
                : `เลิกใช้ ${mapping.code} — สถานะเปลี่ยนเป็น DEPRECATED (กลับมาใช้ใหม่ได้ผ่านการส่งขออนุมัติ)`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`mp-note-${mapping.id}`}>เหตุผล (ไม่บังคับ — บันทึกใน Audit Trail)</Label>
            <Textarea
              id={`mp-note-${mapping.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="เช่น รูปแบบวันที่ต้นทางไม่ตรงตามที่ระบุ"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(null)}>
              ยกเลิก
            </Button>
            <Button
              className={noteOpen === 'REJECT_APPROVAL' ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-amber-600 text-white hover:bg-amber-700'}
              disabled={busy}
              onClick={() => {
                const action = noteOpen
                setNoteOpen(null)
                if (action) void run(action, note.trim() ? { note: note.trim() } : undefined)
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              {noteOpen === 'REJECT_APPROVAL' ? 'ยืนยันส่งกลับ' : 'ยืนยันเลิกใช้'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ยืนยันลบ */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันการลบ Data Mapping</AlertDialogTitle>
            <AlertDialogDescription>
              ลบ {mapping.code} ({mapping.source.path} → {mapping.target.path}) ถาวร? การลบถูกบันทึกใน Audit Trail
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={(e) => {
                e.preventDefault()
                setConfirmDelete(false)
                void run('DELETE')
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null} ลบ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/* ----------------------------- แถวในแท็บของ Dialog element ----------------------------- */

interface MappingSideRowProps {
  mapping: ExpandedMapping
  elementId: string
  operatorEmail: string
  approverEmail: string
  onChanged: () => void | Promise<void>
}

/** แถว mapping ในแท็บ "การแมปข้อมูล" — แสดง element อีกฝั่ง (ต้นทางที่ไหลเข้า / ปลายทางที่ไหลออก) */
export function MappingSideRow({ mapping, elementId, operatorEmail, approverEmail, onChanged }: MappingSideRowProps) {
  const incoming = mapping.target.id === elementId
  const other = incoming ? mapping.source : mapping.target
  const hint = mapping.transformNote || mapping.note
  return (
    <li className="rounded-lg border bg-card px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-muted/70 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          {incoming ? 'ไหลเข้า ← ต้นทาง' : 'ไหลออก → ปลายทาง'}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">{mapping.code}</span>
        <span className="text-sm font-medium">{other.nameTh || other.nameEn}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{other.code}</span>
        <MappingTypeBadge type={mapping.mappingType} />
        <MappingStatusBadge mapping={mapping} />
      </div>
      <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{other.path}</p>
      {hint && <p className="mt-1 text-[11px] text-foreground/80">{mapping.transformNote ? `การแปลง: ${mapping.transformNote}` : `หมายเหตุ: ${mapping.note}`}</p>}
      <p className="mt-1 text-[10px] text-muted-foreground">
        ผู้อนุมัติ: {mapping.approvedBy ?? 'ยังไม่มีการอนุมัติ'}
        {mapping.approvedBy ? ` · ${formatWhen(mapping.approvedAt)}` : ''}
      </p>
      <div className="mt-2">
        <MappingActions mapping={mapping} operatorEmail={operatorEmail} approverEmail={approverEmail} onChanged={onChanged} />
      </div>
    </li>
  )
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

/** ชุดประเภท mapping สำหรับ select/chips (อ้าง MAPPING_TYPES เสมอ — ห้าม hardcode ป้าย) */
export const MAPPING_TYPE_OPTIONS = MAPPING_TYPE_KEYS.map((k) => ({ key: k, ...MAPPING_TYPES[k] }))
