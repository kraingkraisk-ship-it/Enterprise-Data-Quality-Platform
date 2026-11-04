// Data Engine — virtual source adapters. Deterministically generates rows per
// dataset (seeded by dataset id) so profiling, rule evaluation, duplicate and
// anomaly detection run against REAL data — not fixtures. Production swaps each
// adapter for a live connector (read-only), contract unchanged.
import { createHash } from 'crypto'
import { db } from '@/lib/db'
import type { DatasetColumn } from '@prisma/client'

function seededRng(seedStr: string) {
  let h = createHash('sha256').update(seedStr).digest().readUInt32LE(0)
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5
    return ((h >>> 0) % 100000) / 100000
  }
}

const THAI_FIRST = ['สมชาย', 'นัทธญา', 'อารี', 'ประเสริฐ', 'กัญญา', 'ธนาพนธ์', 'สุภาพร', 'วิจักษณ์', 'นิรันดร์', 'มาลี', 'วิชัย', 'พิมพ์ชนก', 'ธนกฤต', 'ศิริพร', 'อนุชา']
const THAI_LAST = ['ใจดี', 'ศรีสุข', 'วงศ์ประเสริฐ', 'มั่นคง', 'รักษาดี', 'ทองคำ', 'สมบูรณ์', 'พงษ์เจริญ', 'อินทรีย์', 'แสงทอง']
const PROVINCES = ['กรุงเทพมหานคร', 'เชียงใหม่', 'ภูเก็ต', 'ขอนแก่น', 'สงขลา', 'นนทบุรี', 'ชลบุรี', 'อุดรธานี']
const SEGMENTS = ['RETAIL', 'SME', 'CORPORATE']

export interface GeneratedData { rows: Record<string, unknown>[]; columns: DatasetColumn[] }

const cache = new Map<string, GeneratedData>()

export async function getDatasetData(datasetId: string, maxRows = 4000): Promise<GeneratedData> {
  const key = `${datasetId}:${maxRows}`
  const hit = cache.get(key)
  if (hit) return hit
  const dataset = await db.dataset.findUnique({ where: { id: datasetId }, include: { columns: { orderBy: { position: 'asc' } } } })
  if (!dataset) throw new Error(`dataset not found: ${datasetId}`)
  const rows = generate(dataset.id, dataset.name, dataset.columns, Math.min(dataset.rowCount, maxRows))
  const out = { rows, columns: dataset.columns }
  cache.set(key, out)
  return out
}

function generate(id: string, name: string, cols: DatasetColumn[], n: number): Record<string, unknown>[] {
  if (name.includes('Customer Master')) return customerMaster(id, cols, n)
  if (name.includes('General Ledger')) return generalLedger(id, cols, n)
  if (name.includes('Product Master')) return productMaster(id, cols, n)
  if (name.includes('Sales Order')) return salesOrders(id, cols, n)
  if (name.includes('Marketing Consent')) return marketingConsents(id, cols, n)
  return supportTickets(id, cols, n)
}

function pad(n: number, w = 6) { return String(n).padStart(w, '0') }

function customerMaster(id: string, cols: DatasetColumn[], n: number): Record<string, unknown>[] {
  const rnd = seededRng(id)
  const rows: Record<string, unknown>[] = []
  const emailsSeen: string[] = []
  for (let i = 0; i < n; i++) {
    const dupCluster = i > n * 0.9 && emailsSeen.length > 0 && rnd() < 0.5 // deliberate fuzzy dupes near end
    const baseEmail = dupCluster ? emailsSeen[Math.floor(rnd() * emailsSeen.length)] : null
    const first = THAI_FIRST[Math.floor(rnd() * THAI_FIRST.length)]
    const last = THAI_LAST[Math.floor(rnd() * THAI_LAST.length)]
    const custId = `C${pad(i + 1)}`
    const email = baseEmail
      ? baseEmail.replace('@', `${rnd() < 0.5 ? '.' : ''}@`).toLowerCase()
      : `user${pad(i + 1, 5)}@example.co.th`
    if (!baseEmail && i % 10 === 0) emailsSeen.push(email)
    const phone = `0${Math.floor(2 + rnd() * 8)}${pad(Math.floor(rnd() * 99999999), 8)}`
    const natId = `${Math.floor(1 + rnd() * 9)}${pad(Math.floor(rnd() * 999999999999), 12)}`
    const row: Record<string, unknown> = {
      customer_id: custId,
      full_name: `${first} ${last}`,
      email: rnd() < 0.04 ? null : (rnd() < 0.02 ? `broken-email-${i}` : email),
      phone: rnd() < 0.06 ? `12${pad(Math.floor(rnd() * 9999999), 7)}` : phone,
      national_id: rnd() < 0.02 ? `${Math.floor(rnd() * 999)}` : natId,
      date_of_birth: new Date(1955 + Math.floor(rnd() * 45), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)).toISOString().slice(0, 10),
      registered_at: i > n * 0.93
        ? new Date(Date.now() - Math.floor(rnd() * 90 * 24 * 3600e3)).toISOString() // recent intake keeps freshness SLA realistic
        : new Date(2021 + Math.floor(rnd() * 5), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)).toISOString(),
      segment: rnd() < 0.6 ? 'RETAIL' : rnd() < 0.8 ? 'SME' : 'CORPORATE',
      credit_limit: (() => {
        const seg = rows.length % 10 < 6 ? 1 : 3
        const base = 50000 + Math.floor(rnd() * 900000) / seg
        if (i % 997 === 0) return base * 25 // isolation-forest outliers
        return Math.round(base)
      })(),
      province: rnd() < 0.07 ? null : PROVINCES[Math.floor(rnd() * PROVINCES.length)],
      is_active: rnd() > 0.08,
    }
    rows.push(row)
  }
  return filterCols(rows, cols)
}

function generalLedger(id: string, cols: DatasetColumn[], n: number): Record<string, unknown>[] {
  const rnd = seededRng(id)
  const accounts = ['1100-CASH', '1200-AR', '2100-AP', '4100-REV', '5100-EXP', '5900-TAX']
  const rows: Record<string, unknown>[] = []
  const now = Date.now()
  for (let i = 0; i < n; i++) {
    const debit = rnd() < 0.5
    const late = i % 53 === 0
    rows.push({
      journal_id: `JE${pad(i + 1, 7)}`,
      posting_date: new Date(now - (late ? 5 * 24 * 3600e3 : Math.floor(rnd() * 2 * 24 * 3600e3))).toISOString().slice(0, 10),
      account_code: rnd() < 0.01 ? null : accounts[Math.floor(rnd() * accounts.length)],
      description: rnd() < 0.05 ? null : (['Vendor payment', 'Customer receipt', 'Payroll accrual', 'FX revaluation', 'Tax posting'][Math.floor(rnd() * 5)]),
      amount: (() => { const v = Math.round(rnd() * 500000) / 100; return i % 613 === 0 ? -v : v })(), // negative → validity rule
      dc_indicator: debit ? 'D' : 'C',
      currency: rnd() < 0.85 ? 'THB' : rnd() < 0.5 ? 'USD' : 'EUR',
      approved_by: rnd() < 0.03 ? null : 'APPROVER-SYS',
    })
  }
  return filterCols(rows, cols)
}

function productMaster(id: string, cols: DatasetColumn[], n: number): Record<string, unknown>[] {
  const rnd = seededRng(id)
  const cats = ['DEPOSIT', 'LOAN', 'CARD', 'INSURANCE', 'WEALTH']
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < n; i++) {
    rows.push({
      product_code: `P${pad(i + 1, 5)}`,
      product_name: rnd() < 0.02 ? null : `${cats[Math.floor(rnd() * cats.length)]} Product ${i + 1}`,
      category: cats[Math.floor(rnd() * cats.length)],
      base_rate: Number((rnd() * 8).toFixed(2)),
      status: rnd() < 0.7 ? 'ACTIVE' : rnd() < 0.5 ? 'INACTIVE' : 'SUNSET',
      launch_date: new Date(2015 + Math.floor(rnd() * 10), Math.floor(rnd() * 12), 1 + Math.floor(rnd() * 28)).toISOString().slice(0, 10),
      owner_unit: ['RETAIL', 'CORP', 'WEALTH'][Math.floor(rnd() * 3)],
    })
  }
  return filterCols(rows, cols)
}

function salesOrders(id: string, cols: DatasetColumn[], n: number): Record<string, unknown>[] {
  const rnd = seededRng(id)
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < n; i++) {
    rows.push({
      order_id: `SO${pad(i + 1, 7)}`,
      customer_id: `C${pad(Math.floor(rnd() * 4000) + 1)}`,
      order_date: new Date(Date.now() - Math.floor(rnd() * 14 * 24 * 3600e3)).toISOString().slice(0, 10),
      total_amount: Math.round(rnd() * 250000) / 100,
      currency: rnd() < 0.9 ? 'THB' : 'USD',
      channel: rnd() < 0.5 ? 'WEB' : rnd() < 0.7 ? 'BRANCH' : 'PARTNER',
      status: rnd() < 0.8 ? 'COMPLETED' : rnd() < 0.6 ? 'PENDING' : 'CANCELLED',
    })
  }
  return filterCols(rows, cols)
}

function marketingConsents(id: string, cols: DatasetColumn[], n: number): Record<string, unknown>[] {
  const rnd = seededRng(id)
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < n; i++) {
    rows.push({
      consent_id: `MC${pad(i + 1, 6)}`,
      customer_ref: `C${pad(Math.floor(rnd() * 4000) + 1)}`,
      channel: ['EMAIL', 'SMS', 'CALL', 'LINE'][Math.floor(rnd() * 4)],
      consent_flag: rnd() < 0.6 ? 'GRANTED' : rnd() < 0.8 ? 'DENIED' : null,
      consent_date: new Date(Date.now() - Math.floor(rnd() * 365 * 24 * 3600e3)).toISOString().slice(0, 10),
      expiry_date: rnd() < 0.05 ? null : new Date(Date.now() + Math.floor(rnd() * 365 * 24 * 3600e3)).toISOString().slice(0, 10),
      purpose: ['PRODUCT_OFFER', 'NEWSLETTER', 'EVENT'][Math.floor(rnd() * 3)],
    })
  }
  return filterCols(rows, cols)
}

function supportTickets(id: string, cols: DatasetColumn[], n: number): Record<string, unknown>[] {
  const rnd = seededRng(id)
  const rows: Record<string, unknown>[] = []
  for (let i = 0; i < n; i++) {
    rows.push({
      ticket_id: `TK${pad(i + 1, 6)}`,
      customer_id: rnd() < 0.03 ? null : `C${pad(Math.floor(rnd() * 4000) + 1)}`,
      opened_at: new Date(Date.now() - Math.floor(rnd() * 30 * 24 * 3600e3)).toISOString(),
      category: ['BILLING', 'TECH', 'ACCOUNT', 'PRODUCT'][Math.floor(rnd() * 4)],
      priority: rnd() < 0.2 ? 'URGENT' : rnd() < 0.6 ? 'HIGH' : 'NORMAL',
      status: rnd() < 0.6 ? 'CLOSED' : 'OPEN',
      csat_score: rnd() < 0.15 ? null : Math.floor(1 + rnd() * 5),
    })
  }
  return filterCols(rows, cols)
}

function filterCols(rows: Record<string, unknown>[], cols: DatasetColumn[]): Record<string, unknown>[] {
  if (!cols.length) return rows
  const names = new Set(cols.map((c) => c.name))
  return rows.map((r) => {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(r)) if (names.has(k)) out[k] = r[k]
    return out
  })
}
