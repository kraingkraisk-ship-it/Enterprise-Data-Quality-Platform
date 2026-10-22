import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

/**
 * GET  /api/dq/datasets — รายการชุดข้อมูลของโมดูล DQ ทั้งหมด พร้อมโดเมน + ตัวเลขประกอบ
 *   ใช้ในหน้า Data Domain (แผง "ชุดข้อมูล DQ ในโดเมน") — อ่านอย่างเดียว
 * POST /api/dq/datasets — สร้างชุดข้อมูลใหม่ (ผูกเข้า Data Domain ได้ทันที)
 *   body: { operatorEmail, name, sourceType, domainId?, csv? }
 *   - csv (ไม่บังคับ): ข้อความ CSV/TSV — บรรทัดแรก = หัวคอลัมน์ → สร้าง SampleRow สำหรับรันกฎตรวจ
 *   - จำกัด 60 คอลัมน์ / 200 แถว (คุมขนาดฐานข้อมูล — เท่า sandbox ของระบบ)
 * สิทธิ์: POST ต้องมี MANAGE_DATASETS — ทุกการสร้างบันทึก Audit Trail
 */

const SOURCE_TYPES = ['CSV', 'EXCEL', 'POSTGRESQL', 'MSSQL', 'REST_API'] as const

const DATASET_NAME_MAX = 120
const MAX_COLUMNS = 60
const MAX_ROWS = 200

export async function GET() {
  try {
    const datasets = await db.dataset.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        domain: {
          select: { id: true, name: true, color: true, parentId: true, parent: { select: { name: true } } },
        },
        _count: { select: { rules: true, sampleRows: true } },
        batches: { orderBy: { createdAt: 'desc' }, take: 1, select: { overallScore: true, createdAt: true } },
      },
    })

    return NextResponse.json({
      datasets: datasets.map((d) => ({
        id: d.id,
        name: d.name,
        sourceType: d.sourceType,
        piiEnabled: d.piiEnabled,
        status: d.status,
        createdAt: d.createdAt,
        domain: d.domain
          ? {
              id: d.domain.id,
              name: d.domain.name,
              color: d.domain.color,
              parentId: d.domain.parentId,
              parentName: d.domain.parent?.name ?? null,
            }
          : null,
        ruleCount: d._count.rules,
        sampleCount: d._count.sampleRows,
        lastBatch: d.batches[0] ? { at: d.batches[0].createdAt, overallScore: d.batches[0].overallScore } : null,
      })),
      count: datasets.length,
    })
  } catch (e) {
    console.error('GET /api/dq/datasets', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายการชุดข้อมูลได้' }, { status: 500 })
  }
}

/* ------------------------- CSV / TSV parser ------------------------- */

/** ตรวจ delimiter: ถ้าบรรทัดแรกไม่มี comma แต่มี tab (พาสต์จาก Excel) → ใช้ tab */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  if (!firstLine.includes(',') && firstLine.includes('\t')) return '\t'
  return ','
}

/** parser แบบ RFC4180-lite รองรับเครื่องหมายคำพูดและคอมมาในค่า */
function parseDelimited(text: string): string[][] {
  const delim = detectDelimiter(text)
  const src = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (row.some((c) => c.trim() !== '')) rows.push(row)
    row = []
  }

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      pushField()
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      pushRow()
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) pushRow()
  return rows
}

function sanitizeHeaderName(raw: string, index: number, used: Set<string>): string {
  let name = raw.trim().replace(/\s+/g, '_')
  if (!name) name = `column_${index + 1}`
  if (/^[0-9]/.test(name)) name = `c_${name}`
  let candidate = name
  let n = 2
  while (used.has(candidate)) {
    candidate = `${name}_${n}`
    n++
  }
  used.add(candidate)
  return candidate
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const name = String(body.name ?? '').trim()
    const sourceType = String(body.sourceType ?? 'CSV').trim().toUpperCase()
    const domainIdRaw = String(body.domainId ?? '').trim()
    const csvText = typeof body.csv === 'string' ? body.csv : ''

    if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อชุดข้อมูล' }, { status: 400 })
    if (name.length > DATASET_NAME_MAX) {
      return NextResponse.json({ error: `ชื่อชุดข้อมูลยาวเกิน ${DATASET_NAME_MAX} ตัวอักษร` }, { status: 400 })
    }
    if (!(SOURCE_TYPES as readonly string[]).includes(sourceType)) {
      return NextResponse.json({ error: 'แหล่งข้อมูลไม่ถูกต้อง (CSV | EXCEL | POSTGRESQL | MSSQL | REST_API)' }, { status: 400 })
    }

    const dup = await db.dataset.findFirst({ where: { name }, select: { id: true } })
    if (dup) return NextResponse.json({ error: `มีชุดข้อมูลชื่อ "${name}" อยู่แล้วในระบบ` }, { status: 409 })

    // ---------- โดเมน (ไม่บังคับ — แต่ถ้าระบุต้องมีจริง: deny-by-default) ----------
    let domainId: string | null = null
    let domainName: string | null = null
    if (domainIdRaw) {
      const domain = await db.dataDomain.findUnique({ where: { id: domainIdRaw }, select: { id: true, name: true } })
      if (!domain) return NextResponse.json({ error: 'ไม่พบโดเมนข้อมูลที่ระบุ' }, { status: 404 })
      domainId = domain.id
      domainName = domain.name
    }

    // ---------- ข้อมูลตัวอย่างจาก CSV/TSV (ไม่บังคับ) ----------
    let sampleRows: Record<string, string>[] = []
    let columnNames: string[] = []
    if (csvText.trim()) {
      const table = parseDelimited(csvText)
      if (table.length < 2) {
        return NextResponse.json({ error: 'ข้อมูลต้องมีอย่างน้อย 1 หัวคอลัมน์ + 1 แถวข้อมูล' }, { status: 400 })
      }
      const used = new Set<string>()
      columnNames = table[0].slice(0, MAX_COLUMNS).map((h, i) => sanitizeHeaderName(h, i, used))
      sampleRows = table
        .slice(1)
        .map((cells) => {
          const row: Record<string, string> = {}
          for (let i = 0; i < columnNames.length; i++) row[columnNames[i]] = (cells[i] ?? '').trim()
          return row
        })
        .filter((row) => Object.values(row).some((v) => v !== ''))
        .slice(0, MAX_ROWS)
      if (sampleRows.length === 0) {
        return NextResponse.json({ error: 'ไม่พบแถวข้อมูลในข้อความที่วาง (ต้องมีอย่างน้อย 1 แถว)' }, { status: 400 })
      }
    }

    const created = await db.$transaction(async (tx) => {
      const ds = await tx.dataset.create({
        data: {
          name,
          sourceType,
          domainId,
        },
      })
      if (sampleRows.length > 0) {
        await tx.sampleRow.createMany({
          data: sampleRows.map((payload) => ({ datasetId: ds.id, payload: JSON.stringify(payload) })),
        })
      }
      return ds
    })

    await db.auditLog.create({
      data: {
        action: 'CREATE_DATASET',
        actor: op.ctx.email,
        target: created.name,
        detail: `สร้างชุดข้อมูลใหม่ "${created.name}" (แหล่งข้อมูล ${sourceType}${
          domainName ? ` · สังกัดโดเมน "${domainName}"` : ' · ยังไม่ระบุโดเมน'
        })${sampleRows.length > 0 ? ` พร้อมข้อมูลตัวอย่าง ${sampleRows.length} แถว / ${columnNames.length} คอลัมน์` : ' (ยังไม่มีข้อมูลตัวอย่าง)'} โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json(
      {
        dataset: { id: created.id, name: created.name, sourceType: created.sourceType, domainId: created.domainId },
        sampleRows: sampleRows.length,
        columns: columnNames.length,
        message: `สร้างชุดข้อมูล "${created.name}" เรียบร้อย${sampleRows.length > 0 ? ` (นำเข้า ${sampleRows.length} แถว)` : ''}`,
      },
      { status: 201 },
    )
  } catch (e) {
    console.error('POST /api/dq/datasets', e)
    return NextResponse.json({ error: 'สร้างชุดข้อมูลไม่สำเร็จ' }, { status: 500 })
  }
}
