// Rules Engine — no-code rule definitions evaluated against dataset rows.
// Every operator is data-type aware; evidence is masked (PII) before persisting.
import { db } from '@/lib/db'
import { getDatasetData } from '@/lib/data-engine'
import { maskByPiiType } from '@/lib/masking'
import type { ColumnProfile } from '@/lib/types'
import type { RuleDefinition } from '@/lib/types'

export interface RuleEvalResult {
  status: 'PASSED' | 'FAILED' | 'WARNING' | 'ERROR' | 'SKIPPED'
  passRate: number
  failedRows: number
  evaluatedRows: number
  evidence: { row: number; column: string; valueMasked: string; reasonEn: string; reasonTh: string }[]
  messageEn?: string
  messageTh?: string
}

function col(rows: Record<string, unknown>[], name: string): unknown[] {
  return rows.map((r) => r[name])
}

function evalCondition(rows: Record<string, unknown>[], condition?: string): Record<string, unknown>[] {
  // Supported micro-syntax: "column = value" or "column != value" (single clause)
  if (!condition || !condition.trim()) return rows
  const m = condition.trim().match(/^(\w+)\s*(!=|=)\s*'?([^']+)'?$/)
  if (!m) return rows
  const [, c, op, v] = m
  return rows.filter((r) => (op === '=' ? String(r[c]) === v.trim() : String(r[c]) !== v.trim()))
}

export async function evaluateRule(
  datasetId: string,
  definition: RuleDefinition,
  templateKey: string | null | undefined,
  piiMap: Map<string, string | null>,
): Promise<RuleEvalResult> {
  const { rows } = await getDatasetData(datasetId)
  const scoped = evalCondition(rows, definition.condition)
  const total = scoped.length
  if (total === 0) {
    return { status: 'SKIPPED', passRate: 1, failedRows: 0, evaluatedRows: 0, evidence: [], messageEn: 'No rows matched the optional condition.', messageTh: 'ไม่พบแถวที่ตรงกับเงื่อนไข' }
  }
  const colName = definition.column ?? ''
  const piiOf = (c: string) => piiMap.get(c) ?? null
  const maskV = (c: string, v: unknown) => maskByPiiType(piiOf(c), v == null ? '' : String(v))
  const evPush = (arr: unknown[], i: number, c: string, reasonEn: string, reasonTh: string) => {
    arr.push({ row: i + 1, column: c, valueMasked: maskV(c, scoped[i][c]), reasonEn, reasonTh })
  }
  const ev: { row: number; column: string; valueMasked: string; reasonEn: string; reasonTh: string }[] = []
  let failed = 0

  const check = (ok: boolean, i: number, c: string, ren: string, rth: string) => {
    if (!ok) {
      failed++
      if (ev.length < 5) evPush(ev, i, c, ren, rth)
    }
  }

  switch (templateKey) {
    case 'NOT_NULL': {
      scoped.forEach((r, i) => check(r[colName] != null && r[colName] !== '', i, colName, 'Value is null or empty', 'ค่าเป็นค่าว่าง'))
      break
    }
    case 'REGEX': {
      let re: RegExp
      try { re = new RegExp(String(definition.parameters?.pattern ?? '.*')) }
      catch { return { status: 'ERROR', passRate: 0, failedRows: 0, evaluatedRows: total, evidence: [], messageEn: 'Invalid regex parameter', messageTh: 'พารามิเตอร์ regex ไม่ถูกต้อง' } }
      scoped.forEach((r, i) => {
        const v = r[colName]
        check(v != null && re.test(String(v)), i, colName, `Value does not match pattern ${definition.parameters?.pattern}`, `ค่าไม่ตรงตามรูปแบบ ${definition.parameters?.pattern}`)
      })
      break
    }
    case 'RANGE': {
      const min = Number(definition.parameters?.min ?? -Infinity)
      const max = Number(definition.parameters?.max ?? Infinity)
      scoped.forEach((r, i) => {
        const v = Number(r[colName])
        check(!isNaN(v) && v >= min && v <= max, i, colName, `Value outside allowed range [${min}, ${max}]`, `ค่าอยู่นอกช่วงที่กำหนด [${min}, ${max}]`)
      })
      break
    }
    case 'IN_SET': {
      const allowed = new Set((definition.parameters?.values as string[] ?? []).map((s) => String(s)))
      scoped.forEach((r, i) => {
        const v = r[colName]
        check(v != null && allowed.has(String(v)), i, colName, `Value not in allowed set {${[...allowed].join(', ')}}`, `ค่าไม่อยู่ในชุดที่อนุญาต {${[...allowed].join(', ')}}`)
      })
      break
    }
    case 'UNIQUE': {
      const seen = new Map<string, number>()
      scoped.forEach((r, i) => {
        const v = String(r[colName] ?? '')
        if (seen.has(v)) {
          failed++
          if (ev.length < 5) evPush(ev, i, colName, `Duplicate of row ${seen.get(v)}`, `ซ้ำกับแถวที่ ${seen.get(v)}`)
        } else seen.set(v, i + 1)
      })
      break
    }
    case 'FRESHNESS': {
      const maxHours = Number(definition.parameters?.maxHours ?? 24)
      let latestMs = 0
      scoped.forEach((r) => {
        const t = new Date(String(r[colName] ?? '')).getTime()
        if (!isNaN(t) && t > latestMs) latestMs = t
      })
      const hoursSince = latestMs ? (Date.now() - latestMs) / 3600e3 : Infinity
      failed = hoursSince > maxHours ? total : 0
      if (failed > 0 && ev.length < 5) {
        ev.push({ row: 0, column: colName, valueMasked: latestMs ? new Date(latestMs).toISOString() : '—', reasonEn: `Latest value is ${hoursSince === Infinity ? 'unknown' : hoursSince.toFixed(1) + 'h'} old (limit ${maxHours}h)`, reasonTh: `ค่าล่าสุดเก่า ${hoursSince === Infinity ? 'ไม่ทราบ' : hoursSince.toFixed(1) + ' ชม.'} (จำกัด ${maxHours} ชม.)` })
      }
      break
    }
    case 'ROW_COUNT': {
      const min = Number(definition.parameters?.minRows ?? 0)
      const max = Number(definition.parameters?.maxRows ?? Number.MAX_SAFE_INTEGER)
      const okRows = total >= min && total <= max
      failed = okRows ? 0 : total
      if (failed > 0 && ev.length < 5) {
        ev.push({ row: 0, column: '*', valueMasked: String(total), reasonEn: `Row count ${total} outside expected range [${min}, ${max}]`, reasonTh: `จำนวนแถว ${total} อยู่นอกช่วงที่คาดหวัง [${min}, ${max}]` })
      }
      break
    }
    case 'SCHEMA_MATCH': {
      // parameters.expected: [{name, type}] — compare against actual row keys + typeof
      const expected = (definition.parameters?.expected as { name: string; type: string }[] | undefined) ?? []
      const actualKeys = Object.keys(scoped[0] ?? {})
      const missing = expected.filter((e) => !actualKeys.includes(e.name))
      failed = missing.length
      if (failed > 0 && ev.length < 5) {
        ev.push({ row: 0, column: missing.map((m) => m.name).join(', '), valueMasked: '—', reasonEn: `Expected columns missing from source: ${missing.map((m) => m.name).join(', ')}`, reasonTh: `คอลัมน์ที่คาดหวังหายไปจากต้นทาง: ${missing.map((m) => m.name).join(', ')}` })
      }
      break
    }
    case 'CROSS_FIELD': {
      // e.g. parameters: {left: "date_of_birth", op: "<", right: "registered_at"} or {left:"credit_limit", op:">=", rightValue: 0}
      const left = String(definition.parameters?.left ?? '')
      const op = String(definition.parameters?.op ?? '<')
      const rightCol = definition.parameters?.right ? String(definition.parameters.right) : null
      const rightVal = definition.parameters?.rightValue != null ? Number(definition.parameters.rightValue) : null
      const cmp = (a: number, b: number): boolean => op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : op === '>=' ? a >= b : op === '!=' ? a !== b : a === b
      scoped.forEach((r, i) => {
        const a = rightCol ? new Date(String(r[left] ?? '')).getTime() : Number(r[left])
        const b = rightCol ? new Date(String(r[rightCol] ?? '')).getTime() : (rightVal ?? 0)
        check(!isNaN(a) && !isNaN(b) && cmp(a, b), i, rightCol ?? left, `Cross-field check failed: ${left} ${op} ${rightCol ?? rightVal}`, `การตรวจข้ามฟิลด์ไม่ผ่าน: ${left} ${op} ${rightCol ?? rightVal}`)
      })
      break
    }
    case 'REFERENTIAL': {
      // parameters: {dataset, column} — value must exist in referenced dataset column
      // parameters.dataset may be an id or a dataset name — resolve both.
      const refDataset = String(definition.parameters?.dataset ?? '')
      const refColumn = String(definition.parameters?.column ?? '')
      let ref
      try { ref = await getDatasetData(refDataset) }
      catch {
        const byName = await db.dataset.findFirst({ where: { name: refDataset }, select: { id: true } })
        if (!byName) return { status: 'ERROR', passRate: 0, failedRows: 0, evaluatedRows: total, evidence: [], messageEn: `Referenced dataset not found: ${refDataset}`, messageTh: `ไม่พบชุดข้อมูลอ้างอิง: ${refDataset}` }
        ref = await getDatasetData(byName.id)
      }
      const refSet = new Set(ref.rows.map((r) => String(r[refColumn] ?? '')))
      scoped.forEach((r, i) => {
        const v = r[colName]
        check(v != null && refSet.has(String(v)), i, colName, `No matching record in ${definition.parameters?.dataset}.${refColumn}`, `ไม่พบข้อมูลอ้างอิงใน ${definition.parameters?.dataset}.${refColumn}`)
      })
      break
    }
    default: {
      // operator-based generic evaluation (no-code builder maps operators to these)
      const op = definition.operator ?? 'IS_NOT_NULL'
      scoped.forEach((r, i) => {
        const v = r[colName]
        switch (op) {
          case 'IS_NOT_NULL': check(v != null && v !== '', i, colName, 'Value is null or empty', 'ค่าเป็นค่าว่าง'); break
          case 'MATCHES': check(v != null && new RegExp(String(definition.parameters?.pattern ?? '.*')).test(String(v)), i, colName, `Does not match pattern`, 'ค่าไม่ตรงตามรูปแบบ'); break
          case 'BETWEEN': { const min = Number(definition.parameters?.min ?? -Infinity), max = Number(definition.parameters?.max ?? Infinity); const n = Number(v); check(!isNaN(n) && n >= min && n <= max, i, colName, `Outside range [${min}, ${max}]`, 'อยู่นอกช่วงที่กำหนด'); break }
          case 'IN': { const allowed = new Set((definition.parameters?.values as string[] ?? []).map(String)); check(v != null && allowed.has(String(v)), i, colName, 'Not in allowed set', 'ไม่อยู่ในชุดที่อนุญาต'); break }
          case 'GREATER_THAN': check(Number(v) > Number(definition.parameters?.value ?? 0), i, colName, 'Below threshold', 'ต่ำกว่าเกณฑ์'); break
          case 'LESS_THAN': check(Number(v) < Number(definition.parameters?.value ?? 0), i, colName, 'Above threshold', 'สูงกว่าเกณฑ์'); break
          case 'UNIQUE': check(true, i, colName, '', ''); break // handled below via template UNIQUE
          default: check(v != null && v !== '', i, colName, 'Unsupported operator fallback: not-null', 'โอเปอเรเตอร์ไม่รองรับ ใช้ not-null แทน')
        }
      })
      if (op === 'UNIQUE') {
        const seen = new Map<string, number>()
        failed = 0; ev.length = 0
        scoped.forEach((r, i) => {
          const v = String(r[colName] ?? '')
          if (seen.has(v)) { failed++; if (ev.length < 5) evPush(ev, i, colName, `Duplicate of row ${seen.get(v)}`, `ซ้ำกับแถวที่ ${seen.get(v)}`) }
          else seen.set(v, i + 1)
        })
      }
      break
    }
  }

  const passRate = Number(((total - failed) / total).toFixed(4))
  return {
    status: failed === 0 ? 'PASSED' : passRate >= 0.98 ? 'WARNING' : 'FAILED',
    passRate, failedRows: failed, evaluatedRows: total, evidence: ev,
  }
}

// ─── Profiling ────────────────────────────────────────────────────────────────

export async function profileDataset(datasetId: string): Promise<{
  rowCount: number; columnCount: number; nullRateAvg: number; duplicateRate: number
  columns: ColumnProfile[]; schema: { name: string; type: string; nullable: boolean }[]
}> {
  const { rows, columns } = await getDatasetData(datasetId)
  const profiles: ColumnProfile[] = columns.map((c) => {
    const values = rows.map((r) => r[c.name])
    const nonNull = values.filter((v) => v != null && v !== '')
    const nullCount = values.length - nonNull.length
    const numeric = nonNull.map(Number).filter((v) => !isNaN(v))
    const isNumeric = numeric.length > nonNull.length * 0.9 && nonNull.length > 0
    const base: ColumnProfile = {
      name: c.name, type: c.dataType, count: values.length, nullCount,
      nullRate: Number((nullCount / Math.max(1, values.length)).toFixed(4)),
      distinct: new Set(nonNull.map(String)).size,
    }
    if (isNumeric) {
      const sorted = [...numeric].sort((a, b) => a - b)
      const mean = numeric.reduce((a, b) => a + b, 0) / numeric.length
      base.min = sorted[0]; base.max = sorted[sorted.length - 1]
      base.mean = Number(mean.toFixed(2))
      base.median = sorted[Math.floor(sorted.length / 2)]
      base.stddev = Number(Math.sqrt(numeric.reduce((s, v) => s + (v - mean) ** 2, 0) / numeric.length).toFixed(2))
      base.p05 = sorted[Math.floor(sorted.length * 0.05)]
      base.p95 = sorted[Math.floor(sorted.length * 0.95)]
    } else {
      const freq = new Map<string, number>()
      nonNull.forEach((v) => { const s = String(v); freq.set(s, (freq.get(s) ?? 0) + 1) })
      base.topValues = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, count]) => ({ value: maskByPiiType(c.piiType, value), count }))
    }
    return base
  })
  const nullRateAvg = profiles.length ? profiles.reduce((a, p) => a + p.nullRate, 0) / profiles.length : 0
  // duplicate rate: exact duplicate full-row
  const seen = new Set<string>()
  let dup = 0
  rows.forEach((r) => { const k = JSON.stringify(r); if (seen.has(k)) dup++; else seen.add(k) })
  return {
    rowCount: rows.length, columnCount: columns.length,
    nullRateAvg: Number(nullRateAvg.toFixed(4)),
    duplicateRate: Number((dup / Math.max(1, rows.length)).toFixed(4)),
    columns: profiles,
    schema: columns.map((c) => ({ name: c.name, type: c.dataType, nullable: c.nullable })),
  }
}

// ─── Schema drift (compare current schema vs last profile snapshot) ──────────

export function diffSchema(
  previous: { name: string; type: string; nullable: boolean }[],
  current: { name: string; type: string; nullable: boolean }[],
): { column: string; kind: 'ADDED' | 'REMOVED' | 'TYPE_CHANGED' | 'NULLABILITY_CHANGED'; detailEn: string; detailTh: string }[] {
  const out: { column: string; kind: 'ADDED' | 'REMOVED' | 'TYPE_CHANGED' | 'NULLABILITY_CHANGED'; detailEn: string; detailTh: string }[] = []
  const prevMap = new Map(previous.map((c) => [c.name, c]))
  const curMap = new Map(current.map((c) => [c.name, c]))
  for (const c of current) {
    const p = prevMap.get(c.name)
    if (!p) out.push({ column: c.name, kind: 'ADDED', detailEn: `Column added`, detailTh: 'มีคอลัมน์ใหม่เพิ่มเข้ามา' })
    else if (p.type !== c.type) out.push({ column: c.name, kind: 'TYPE_CHANGED', detailEn: `Type changed ${p.type} → ${c.type}`, detailTh: `ชนิดข้อมูลเปลี่ยน ${p.type} → ${c.type}` })
    else if (p.nullable !== c.nullable) out.push({ column: c.name, kind: 'NULLABILITY_CHANGED', detailEn: `Nullability changed ${p.nullable} → ${c.nullable}`, detailTh: `ค่าว่างได้เปลี่ยน ${p.nullable} → ${c.nullable}` })
  }
  for (const p of previous) if (!curMap.has(p.name)) out.push({ column: p.name, kind: 'REMOVED', detailEn: 'Column removed from source', detailTh: 'คอลัมน์ถูกลบออกจากต้นทาง' })
  return out
}
