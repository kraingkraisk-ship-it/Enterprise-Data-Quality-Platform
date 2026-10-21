/**
 * DQ Issues helper (v0.13.0)
 * ป้ายกำกับ + ตัวช่วยสร้างรหัสปัญหา (ISS-xxxx) และนิยาม lifecycle
 */

import type { PrismaClient } from '@prisma/client'

export const ISSUE_SOURCE_LABELS: Record<string, { th: string; en: string; cls: string }> = {
  MANUAL: { th: 'รายงานเอง', en: 'Manual', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  SIGNAL: { th: 'จากสัญญาณ AI', en: 'From ML Signal', cls: 'bg-violet-50 text-violet-800 border-violet-200' },
  FAILURE: { th: 'จากข้อมูลที่ไม่ผ่าน', en: 'From Failed Record', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  EXCEPTION: { th: 'จากคำขอยกเว้น', en: 'From Exception', cls: 'bg-amber-50 text-amber-900 border-amber-200' },
}

export const ISSUE_STATUS_META: Record<string, { th: string; en: string; cls: string }> = {
  OPEN: { th: 'เปิดใหม่', en: 'Open', cls: 'bg-rose-50 text-rose-800 border-rose-200' },
  IN_PROGRESS: { th: 'กำลังดำเนินการ', en: 'In Progress', cls: 'bg-amber-50 text-amber-900 border-amber-200' },
  RESOLVED: { th: 'แก้ไขแล้ว (รอปิด)', en: 'Resolved', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  CLOSED: { th: 'ปิดแล้ว', en: 'Closed', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
}

/** การเปลี่ยนสถานะที่อนุญาต — deny-by-default (นอกเส้นทางนี้ = ปฏิเสธ) */
export const ISSUE_TRANSITIONS: Record<string, { from: string[]; to: string; permission: 'MANAGE_ISSUES' | 'APPROVE_EXCEPTIONS'; audit: string }> = {
  START: { from: ['OPEN'], to: 'IN_PROGRESS', permission: 'MANAGE_ISSUES', audit: 'START_ISSUE' },
  RESOLVE: { from: ['IN_PROGRESS'], to: 'RESOLVED', permission: 'MANAGE_ISSUES', audit: 'RESOLVE_ISSUE' },
  CLOSE: { from: ['RESOLVED'], to: 'CLOSED', permission: 'APPROVE_EXCEPTIONS', audit: 'CLOSE_ISSUE' },
  REOPEN: { from: ['RESOLVED', 'CLOSED'], to: 'OPEN', permission: 'MANAGE_ISSUES', audit: 'REOPEN_ISSUE' },
}

/**
 * สร้างรหัสปัญหาถัดไป ISS-0001, ISS-0002 …
 * ใช้ "เลขสูงสุดที่มีอยู่ + 1" (ไม่ใช่ count+1) เพื่อกันชนเมื่อมีช่องว่างรหัส
 * เช่น มี ISS-0001 และ ISS-0003 → รหัสถัดไปต้องเป็น ISS-0004
 */
export async function nextIssueCode(db: PrismaClient): Promise<string> {
  const issues = await db.dqIssue.findMany({ select: { code: true }, orderBy: { code: 'desc' }, take: 100 })
  let max = 0
  for (const it of issues) {
    const n = Number.parseInt(it.code.replace(/^ISS-/, ''), 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  return `ISS-${String(max + 1).padStart(4, '0')}`
}
