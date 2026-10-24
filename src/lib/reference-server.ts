/**
 * Reference Data — Server helpers (v0.31.0)
 * ฟังก์ชันฝั่ง API เท่านั้น (import db ตรง ๆ) — UI ห้าม import ไฟล์นี้ (ใช้ lib/reference.ts)
 */

import { db } from '@/lib/db'

/** เอนจินกฎที่รองรับ "โหมดทะเบียน" (params.referenceSetId) */
export const REFERENCE_RULE_ENGINES = ['IN_LIST', 'REFERENCE_MATCH'] as const

export interface ReferenceRuleUsage {
  id: string
  column: string
  condition: string
  datasetNames: string[]
  enabled: boolean
}

export interface ReferenceUsage {
  rules: ReferenceRuleUsage[]
  elements: Array<{ id: string; code: string; nameTh: string }>
  mappings: Array<{ id: string; code: string }>
}

/**
 * หากฎที่ชี้ทะเบียนอ้างอิงด้วย params.referenceSetId — สแกนกฎที่ใช้เอนจินโหมดทะเบียน
 * (DqRule.parameters เป็น JSON string — นับได้ด้วยการกรอง engine ก่อนแล้ว parse ใน JS)
 */
export async function rulesUsingReferenceSet(setId: string): Promise<ReferenceRuleUsage[]> {
  const rules = await db.dqRule.findMany({
    where: { condition: { in: [...REFERENCE_RULE_ENGINES] } },
    select: {
      id: true,
      column: true,
      condition: true,
      parameters: true,
      enabled: true,
      datasets: { include: { dataset: { select: { name: true } } } },
    },
  })
  const out: ReferenceRuleUsage[] = []
  for (const r of rules) {
    try {
      const p = JSON.parse(r.parameters || '{}') as Record<string, unknown>
      if (String(p.referenceSetId ?? '').trim() === setId) {
        out.push({
          id: r.id,
          column: r.column,
          condition: r.condition,
          datasetNames: r.datasets.map((d) => d.dataset.name),
          enabled: r.enabled,
        })
      }
    } catch {
      // parameters พัง — ข้าม
    }
  }
  return out
}

/** usage รวมของทะเบียน 1 รายการ: กฎ (โหมดทะเบียน) + Element (valueDomain ผูก) + Mapping (LOOKUP อ้าง) */
export async function referenceUsage(setId: string): Promise<ReferenceUsage> {
  const [rules, elements, mappings] = await Promise.all([
    rulesUsingReferenceSet(setId),
    db.dataElement.findMany({
      where: { referenceSetId: setId },
      select: { id: true, code: true, nameTh: true },
      orderBy: { code: 'asc' },
    }),
    db.dataMapping.findMany({
      where: { lookupSetId: setId },
      select: { id: true, code: true },
      orderBy: { code: 'asc' },
    }),
  ])
  return { rules, elements, mappings }
}

/** ตรวจว่า email ผู้รับผิดชอบ (owner/steward) มีจริงในระบบและ ACTIVE — deny-by-default (แบบเดียวกับ Element) */
export async function validateStewardshipEmails(emails: unknown[]): Promise<string | null> {
  const list = emails.map((v) => String(v ?? '').trim().toLowerCase()).filter(Boolean)
  if (list.length === 0) return null
  const unique = [...new Set(list)]
  const users = await db.user.findMany({ where: { email: { in: unique } }, select: { email: true, status: true, name: true } })
  const found = new Map(users.map((u) => [u.email, u]))
  for (const e of unique) {
    const u = found.get(e)
    if (!u) return `ไม่พบบัญชีผู้รับผิดชอบ "${e}" ในระบบ — ต้องเลือกจากผู้ใช้ที่มีอยู่เท่านั้น`
    if (u.status !== 'ACTIVE') return `บัญชี "${u.name}" ถูกระงับการใช้งาน — เลือกผู้ใช้ที่ ACTIVE เท่านั้น`
  }
  return null
}
