/**
 * Data Profiling Engine (v0.13.0)
 * สำรวจลักษณะข้อมูลจริงรายคอลัมน์ (READ-ONLY — อ่านจาก snapshot sandbox เท่านั้น ไม่แตะข้อมูลต้นทาง)
 * ผลลัพธ์เป็นสถิติเชิงพรรณนา: ค่าว่าง ความไม่ซ้ำ ช่วงค่า และค่าที่พบบ่อย
 * — topValues อาจมีข้อมูลส่วนบุคคล → ต้องปิดบังตอน "อ่าน" ตามบทบาท (maskValueByRole) ไม่เก็บ mask ลงดิสก์
 */

import type { Row } from './dq'
import { inferColumnType } from './asset'

export interface ProfileTopValue {
  value: string
  count: number
}

export interface ProfileColumnStat {
  columnName: string
  dataType: string
  totalRows: number
  nullCount: number
  nullPct: number
  distinctCount: number
  distinctPct: number
  minValue: string | null
  maxValue: string | null
  meanValue: string | null
  minLength: number | null
  maxLength: number | null
  topValues: ProfileTopValue[]
  piiSuspected: boolean
}

export interface ProfileResult {
  totalRows: number
  totalColumns: number
  columns: ProfileColumnStat[]
  avgCompleteness: number | null
  avgUniqueness: number | null
  piiColumnCount: number
}

/** จำนวนแถวสูงสุดที่โปรไฟล์ต่อรอบ (sandbox เท่านั้น — คุมประสิทธิภาพ) */
export const PROFILE_MAX_ROWS = 2000

/** รูปแบบข้อความที่บ่งชี้ข้อมูลส่วนบุคคล (ใช้เมื่อชื่อคอลัมน์ไม่ชัด) */
const PII_VALUE_PATTERNS: RegExp[] = [
  /^[\w.+-]+@[\w-]+\.[\w.]+$/, // email
  /^0\d{1,2}[-\s]?\d{3}[-\s]?\d{3,4}$/, // เบอร์โทรไทย
  /^\d{1}\s?\d{4}\s?\d{5}\s?\d{2}\s?\d{1}$/, // เลขบัตรประชาชน
]

/**
 * ตรวจว่าคอลัมน์นี้ "สงสัยว่าเป็น PII" หรือไม่
 * 1) ชื่อคอลัมน์อยู่ในคลัง PII ของระบบ (PII_FIELD_HINTS ผ่าน maskValueByRole)
 * 2) ชื่อคอลัมน์มีคำบ่งชี้ (email/phone/name/id/address ฯลฯ)
 * 3) ค่าตัวอย่างตรงรูปแบบข้อมูลส่วนบุคคล
 */
export function isPiiSuspected(columnName: string, values: string[]): boolean {
  const n = columnName.toLowerCase()
  const NAME_HINTS = ['email', 'mail', 'phone', 'tel', 'mobile', 'name', 'ชื่อ', 'นาม', 'citizen', 'national', 'nid', 'บัตร', 'address', 'addr', 'ที่อยู่', 'birth', 'เกิด', 'salary', 'เงินเดือน', 'customer_id', 'citizen_id']
  if (NAME_HINTS.some((h) => n.includes(h))) return true
  const samples = values.filter((v) => v.trim() !== '').slice(0, 20)
  return samples.some((v) => PII_VALUE_PATTERNS.some((p) => p.test(v)))
}

/**
 * โปรไฟล์แถวข้อมูลทั้งชุด — คืนสถิติรายคอลัมน์ + สรุปรวม
 * @param rows แถวข้อมูล (object คอลัมน์ → ค่า)
 * @param columnOrder ลำดับคอลัมน์ (ไม่ระบุ = เรียงตามที่พบครั้งแรก)
 */
export function profileRows(rows: Row[], columnOrder?: string[]): ProfileResult {
  // รวมชื่อคอลัมน์ทุกแถว (เรียงตามที่พบครั้งแรก)
  const seen = new Set<string>()
  const columns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
    }
  }
  const ordered = columnOrder && columnOrder.length > 0 ? columnOrder.filter((c) => seen.has(c)).concat(columns.filter((c) => !columnOrder.includes(c))) : columns

  const stats: ProfileColumnStat[] = ordered.map((col) => {
    const raw = rows.map((r) => r[col])
    const values = raw.map((v) => (v === null || v === undefined ? '' : String(v)))
    const total = values.length
    const nullCount = values.filter((v) => v.trim() === '').length
    const nonNull = values.filter((v) => v.trim() !== '')

    // ความไม่ซ้ำ (นับเฉพาะค่าที่ไม่ว่าง)
    const distinct = new Set(nonNull).size

    // ชนิดข้อมูล (อนุมานจากค่าจริง)
    const dataType = inferColumnType(rows, col)

    // สถิติตัวเลข / ความยาวข้อความ
    let minValue: string | null = null
    let maxValue: string | null = null
    let meanValue: string | null = null
    let minLength: number | null = null
    let maxLength: number | null = null

    if (dataType === 'INTEGER' || dataType === 'NUMBER') {
      const nums = nonNull.map((v) => Number(v)).filter((x) => Number.isFinite(x))
      if (nums.length > 0) {
        minValue = String(Math.min(...nums))
        maxValue = String(Math.max(...nums))
        meanValue = (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)
      }
    } else if (nonNull.length > 0) {
      const sorted = [...nonNull].sort((a, b) => a.localeCompare(b, 'th'))
      minValue = sorted[0]
      maxValue = sorted[sorted.length - 1]
      const lens = nonNull.map((v) => v.length)
      minLength = Math.min(...lens)
      maxLength = Math.max(...lens)
    }

    // ค่าที่พบบ่อย (top 5 — เฉพาะค่าที่ไม่ว่าง)
    const freq = new Map<string, number>()
    for (const v of nonNull) freq.set(v, (freq.get(v) ?? 0) + 1)
    const topValues: ProfileTopValue[] = [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }))

    const nullPct = total > 0 ? (nullCount / total) * 100 : 0
    const distinctPct = nonNull.length > 0 ? (distinct / nonNull.length) * 100 : 0

    return {
      columnName: col,
      dataType,
      totalRows: total,
      nullCount,
      nullPct: Math.round(nullPct * 10) / 10,
      distinctCount: distinct,
      distinctPct: Math.round(distinctPct * 10) / 10,
      minValue,
      maxValue,
      meanValue,
      minLength,
      maxLength,
      topValues,
      piiSuspected: isPiiSuspected(col, values),
    }
  })

  const withRows = stats.filter((c) => c.totalRows > 0)
  const avgCompleteness =
    withRows.length > 0
      ? Math.round((withRows.reduce((a, c) => a + (100 - c.nullPct), 0) / withRows.length) * 10) / 10
      : null
  const avgUniqueness =
    withRows.length > 0
      ? Math.round((withRows.reduce((a, c) => a + c.distinctPct, 0) / withRows.length) * 10) / 10
      : null

  return {
    totalRows: rows.length,
    totalColumns: stats.length,
    columns: stats,
    avgCompleteness,
    avgUniqueness,
    piiColumnCount: stats.filter((c) => c.piiSuspected).length,
  }
}

/** ป้ายชื่อชนิดข้อมูลแบบย่อ (แสดงใน UI) */
export const DATA_TYPE_LABELS: Record<string, { th: string; cls: string }> = {
  TEXT: { th: 'ข้อความ', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  INTEGER: { th: 'จำนวนเต็ม', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  NUMBER: { th: 'ตัวเลข', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  BOOLEAN: { th: 'ตรรกะ', cls: 'bg-teal-50 text-teal-800 border-teal-200' },
  DATE: { th: 'วันที่', cls: 'bg-amber-50 text-amber-900 border-amber-200' },
  DATETIME: { th: 'วันเวลา', cls: 'bg-amber-50 text-amber-900 border-amber-200' },
  EMPTY: { th: 'ว่างทั้งหมด', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  MIXED: { th: 'ผสม', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
}
