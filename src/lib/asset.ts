/**
 * Data Asset Library — เครื่องมือหลักสำหรับโมดูลนำเข้าข้อมูล (Data Asset Import)
 * - แยกวิเคราะห์ CSV (อัตโนมัติเรื่อง delimiter / เครื่องหมายคำพูด / ขึ้นบรรทัดใหม่)
 * - ปรับรูปแบบ JSON ให้เป็นแถวข้อมูลมาตรฐาน (รองรับหลายรูปทรง)
 * - อนุมานชนิดข้อมูลของคอลัมน์ (INTEGER / NUMBER / BOOLEAN / DATE / DATETIME / TEXT)
 * - ตรวจ SQL แบบ deny-by-default ก่อนไปยังฐานข้อมูลต้นทาง (ปลอดภัยตามหลักระบบ)
 * - ข้อจำกัดนำเข้า: จำนวนแถว / จำนวนคอลัมน์ / ขนาดไฟล์ (กันระบบล้น)
 */

export type Row = Record<string, unknown>

export const ASSET_LIMITS = {
  maxRows: 1000, // จำนวนแถวสูงสุดต่อการนำเข้า 1 ครั้ง
  maxColumns: 100, // จำนวนคอลัมน์สูงสุด
  maxFileChars: 8_000_000, // ขนาดข้อความไฟล์สูงสุด (~8MB เป็นข้อความ)
  previewRows: 5, // จำนวนแถวพรีวิว
  dbQueryTimeoutMs: 8_000, // timeout การเชื่อมต่อฐานข้อมูล
} as const

/* ------------------------------------------------------------------ */
/* CSV parser — รองรับเครื่องหมายคำพูด, ค่าที่มี comma ข้างใน, CRLF     */
/* ------------------------------------------------------------------ */

/** ตรวจ delimiter ที่น่าจะใช่จากบรรทัดแรก ๆ (, ; tab |) */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n')
  const candidates = [',', ';', '\t', '|']
  let best = ','
  let bestCount = -1
  for (const d of candidates) {
    const count = sample.split(d).length - 1
    if (count > bestCount) {
      best = d
      bestCount = count
    }
  }
  return best
}

/** แยกบรรทัด CSV ทีละ field โดยเคารพเครื่องหมายคำพูด ("..." และ "" คือ escape) */
function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  let i = 0
  while (i < line.length) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      cur += ch
      i += 1
      continue
    }
    if (ch === '"' && cur === '') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === delimiter) {
      fields.push(cur.trim())
      cur = ''
      i += 1
      continue
    }
    cur += ch
    i += 1
  }
  fields.push(cur.trim())
  return fields
}

export interface CsvParseResult {
  columns: string[]
  rows: Row[]
  delimiter: string
  skippedRows: number
}

/** แยกวิเคราะห์ข้อความ CSV เป็น columns + rows (แถวแรกคือหัวคอลัมน์เสมอ) */
export function parseCsv(text: string, delimiterHint?: string): CsvParseResult {
  const clean = text.replace(/^\uFEFF/, '') // ตัด BOM
  const delimiter = delimiterHint && delimiterHint.length > 0 ? delimiterHint : detectDelimiter(clean)
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    throw new Error('ไฟล์ CSV ต้องมีอย่างน้อย 1 แถวหัวคอลัมน์ + 1 แถวข้อมูล')
  }

  const header = splitCsvLine(lines[0], delimiter).map((h, idx) => {
    const name = h.replace(/^"|"$/g, '').trim() || `column_${idx + 1}`
    return name
  })
  if (header.length > ASSET_LIMITS.maxColumns) {
    throw new Error(`คอลัมน์เกินขีดจำกัด (${header.length} > ${ASSET_LIMITS.maxColumns})`)
  }

  // กันหัวคอลัมน์ซ้ำ: col, col → col, col_2
  const seen = new Map<string, number>()
  const columns = header.map((name) => {
    const n = (seen.get(name) ?? 0) + 1
    seen.set(name, n)
    return n === 1 ? name : `${name}_${n}`
  })

  const rows: Row[] = []
  let skipped = 0
  for (const line of lines.slice(1)) {
    if (rows.length >= ASSET_LIMITS.maxRows) {
      skipped += lines.length - 1 - rows.length - skipped
      break
    }
    const fields = splitCsvLine(line, delimiter)
    const row: Row = {}
    columns.forEach((col, idx) => {
      row[col] = fields[idx] ?? ''
    })
    // แถวว่างทั้งแถว → ข้าม
    if (Object.values(row).every((v) => v === '' || v === null)) {
      skipped += 1
      continue
    }
    rows.push(row)
  }

  if (rows.length === 0) {
    throw new Error('ไม่พบแถวข้อมูลที่ใช้ได้ในไฟล์ CSV (อาจมีแต่หัวคอลัมน์)')
  }
  return { columns, rows, delimiter, skippedRows: skipped }
}

/* ------------------------------------------------------------------ */
/* JSON normalizer — รองรับหลายรูปทรง: array / object เดียว / {key:[…]} */
/* ------------------------------------------------------------------ */

/** เปลี่ยนค่าใด ๆ เป็นข้อความสำหรับเก็บในแถว (คงความหมายให้ผู้ใช้อ่านได้) */
function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Date) return v.toISOString()
  return JSON.stringify(v)
}

/** ทำ object ซ้อนให้แบนราบ (a.b) เพื่อแสดงเป็นคอลัมน์ได้ */
function flattenObject(obj: Record<string, unknown>, prefix = '', depth = 0): Row {
  const out: Row = {}
  if (depth > 3) {
    for (const [k, v] of Object.entries(obj)) out[`${prefix}${k}`] = stringifyValue(v)
    return out
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}${k}`
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flattenObject(v as Record<string, unknown>, `${key}.`, depth + 1))
    } else if (Array.isArray(v)) {
      out[key] = JSON.stringify(v)
    } else {
      out[key] = stringifyValue(v)
    }
  }
  return out
}

export interface JsonParseResult {
  columns: string[]
  rows: Row[]
  skippedRows: number
  shape: string // คำอธิบายรูปทรงที่ตรวจพบ
}

/** แยกวิเคราะห์ข้อความ JSON เป็นแถวข้อมูลมาตรฐาน */
export function parseJsonData(text: string): JsonParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('รูปแบบ JSON ไม่ถูกต้อง — ตรวจสอบวงเล็บ/เครื่องหมายคำพูดอีกครั้ง')
  }

  let arr: unknown[] = []
  let shape = ''
  if (Array.isArray(parsed)) {
    arr = parsed
    shape = 'อาร์เรย์ของวัตถุ (array of objects)'
  } else if (parsed !== null && typeof parsed === 'object') {
    const entries = Object.entries(parsed as Record<string, unknown>)
    const arrayEntry = entries.find(([, v]) => Array.isArray(v) && (v as unknown[]).length > 0)
    if (arrayEntry) {
      arr = arrayEntry[1] as unknown[]
      shape = `วัตถุที่มีอาร์เรย์ภายในคีย์ "${arrayEntry[0]}"`
    } else {
      arr = [parsed]
      shape = 'วัตถุเดียว (single object)'
    }
  } else {
    throw new Error('JSON ต้องเป็นอาร์เรย์หรือวัตถุ — ไม่พบข้อมูลรายแถว')
  }

  if (arr.length === 0) throw new Error('อาร์เรย์ JSON ว่างเปล่า — ไม่มีข้อมูลให้นำเข้า')

  const rows: Row[] = []
  let skipped = 0
  for (const item of arr.slice(0, ASSET_LIMITS.maxRows)) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      skipped += 1
      continue
    }
    rows.push(flattenObject(item as Record<string, unknown>))
  }
  if (rows.length === 0) throw new Error('ไม่พบวัตถุ JSON ที่นำเข้าได้ (ทุกรายการไม่ใช่วัตถุ)')

  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  if (columns.length > ASSET_LIMITS.maxColumns) {
    throw new Error(`คอลัมน์เกินขีดจำกัด (${columns.length} > ${ASSET_LIMITS.maxColumns})`)
  }
  return { columns, rows, skippedRows: skipped, shape }
}

/* ------------------------------------------------------------------ */
/* Type inference — อนุมานชนิดคอลัมน์จากค่าที่เห็น                      */
/* ------------------------------------------------------------------ */

const RE_INTEGER = /^-?\d{1,15}$/
const RE_NUMBER = /^-?\d+(\.\d+)?$/
const RE_BOOLEAN = /^(true|false|yes|no|y|n|1|0)$/i
const RE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/

function inferValue(v: string): 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'DATETIME' | 'DATE' | 'TEXT' | 'EMPTY' {
  const s = v.trim()
  if (s === '') return 'EMPTY'
  if (RE_INTEGER.test(s)) return 'INTEGER'
  if (RE_NUMBER.test(s)) return 'NUMBER'
  if (RE_BOOLEAN.test(s)) return 'BOOLEAN'
  if (RE_DATETIME.test(s)) return 'DATETIME'
  if (RE_DATE.test(s)) return 'DATE'
  return 'TEXT'
}

/** อนุมานชนิดของคอลัมน์จากค่าทั้งหมด (เจอ TEXT ก็เป็น TEXT — เข้มงวดกว่าการเดา) */
export function inferColumnType(rows: Row[], column: string): string {
  const kinds = new Set<string>()
  for (const row of rows.slice(0, 200)) {
    kinds.add(inferValue(String(row[column] ?? '')))
    if (kinds.has('TEXT')) break
  }
  kinds.delete('EMPTY')
  if (kinds.size === 0) return 'EMPTY'
  if (kinds.size === 1) return [...kinds][0]
  // ผสมระหว่าง INTEGER กับ NUMBER → NUMBER
  if (kinds.has('INTEGER') && kinds.has('NUMBER') && kinds.size === 2) return 'NUMBER'
  return 'TEXT'
}

/* ------------------------------------------------------------------ */
/* SQL Guard — deny-by-default สำหรับการนำเข้าจากฐานข้อมูลต้นทาง        */
/* ------------------------------------------------------------------ */

const SQL_FORBIDDEN = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'MERGE', 'CALL', 'SET', 'USE',
  'ATTACH', 'DETACH', 'PRAGMA', 'VACUUM', 'REINDEX', 'INTO OUTFILE', 'LOAD_FILE',
]

export interface SqlCheckResult {
  ok: boolean
  message?: string
}

/** ตรวจคำสั่ง SQL ที่ผู้ใช้กรอก — อนุญาตเฉพาะ SELECT/WITH คำสั่งเดียว (อ่านอย่างเดียว) */
export function checkReadOnlySql(sql: string): SqlCheckResult {
  const clean = sql.trim().replace(/;+\s*$/, '')
  if (!clean) return { ok: false, message: 'กรุณาระบุคำสั่ง SQL' }
  if (clean.includes(';')) return { ok: false, message: 'อนุญาตคำสั่ง SQL ได้ครั้งละ 1 คำสั่งเท่านั้น' }
  const upper = clean.toUpperCase()
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return { ok: false, message: 'อนุญาตเฉพาะคำสั่ง SELECT หรือ WITH (อ่านอย่างเดียว) — คำสั่งอื่นถูกปฏิเสธตามหลัก deny-by-default' }
  }
  for (const kw of SQL_FORBIDDEN) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(clean)) {
      return { ok: false, message: `พบคำสั่งต้องห้าม "${kw}" — ระบบอนุญาตเฉพาะการอ่านข้อมูล (SELECT)` }
    }
  }
  // จำกัดจำนวนแถวอัตโนมัติถ้าไม่มี LIMIT (ทำที่ query builder — ตรงนี้แค่ตรวจ)
  return { ok: true }
}

/** ตรวจชื่อ table ให้เป็น identifier ปลอดภัย (กัน SQL injection จากชื่อตาราง) */
export function checkIdentifier(name: string): SqlCheckResult {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    return { ok: false, message: 'ชื่อตารางต้องเป็นตัวอักษร ตัวเลข และ _ เท่านั้น (เริ่มด้วยตัวอักษร)' }
  }
  return { ok: true }
}

/* ------------------------------------------------------------------ */
/* DB connection config — บันทึก sourceInfo โดยไม่เก็บรหัสผ่าน          */
/* ------------------------------------------------------------------ */

export interface DbConnectionConfig {
  dbType: 'MYSQL' | 'POSTGRESQL'
  host: string
  port: number
  database: string
  username: string
  password: string
  tableName?: string
  query?: string
}

/** สร้าง sourceInfo (JSON) สำหรับเก็บ — ตัดรหัสผ่านออกเสมอ */
export function buildDbSourceInfo(cfg: DbConnectionConfig, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    dbType: cfg.dbType,
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    username: cfg.username,
    ...(extra ?? {}),
  })
}

export const DB_PORT_DEFAULTS: Record<string, number> = { MYSQL: 3306, POSTGRESQL: 5432 }

export const SOURCE_TYPE_META: Record<string, { th: string; en: string; icon: string }> = {
  CSV: { th: 'ไฟล์ CSV', en: 'CSV File', icon: 'FileSpreadsheet' },
  JSON: { th: 'ไฟล์ JSON', en: 'JSON File', icon: 'Braces' },
  DATABASE: { th: 'ฐานข้อมูล', en: 'Database', icon: 'Database' },
}
