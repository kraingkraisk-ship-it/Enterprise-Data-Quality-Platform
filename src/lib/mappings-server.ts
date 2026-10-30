/**
 * Data Mapping — Server-side helpers (v0.21.0)
 * ใช้ร่วมกันทุก route ของ /api/mappings เพื่อคงรูปแบบ response ให้เหมือนกันทั้งระบบ
 */

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { buildElementPath, formatMappingCode, mappingCodePrefix } from '@/lib/mappings'

/** include มาตรฐาน: mapping พร้อม element ทั้งสองฝั่ง + โดเมนย่อยของแต่ละฝั่ง + ทะเบียนอ้างอิงของ LOOKUP (v0.31.0) */
export const MAPPING_INCLUDE = {
  source: { include: { subDomain: { select: { id: true, name: true, nameEn: true, parentId: true } } } },
  target: { include: { subDomain: { select: { id: true, name: true, nameEn: true, parentId: true } } } },
  lookupSet: { select: { id: true, code: true, name: true, status: true } },
} as const

export type MappingRow = Prisma.DataMappingGetPayload<{ include: typeof MAPPING_INCLUDE }>
export type MappingElementRow = MappingRow['source']

export interface DomainLite {
  id: string
  name: string
  nameEn: string
}

/** โหลดโดเมนหลักทั้งหมดครั้งเดียวเพื่อประกอบชื่อโดเมนแม่ของแต่ละโดเมนย่อย */
export async function loadDomainMap(): Promise<Map<string, DomainLite>> {
  const domains = await db.dataDomain.findMany({ select: { id: true, name: true, nameEn: true } })
  return new Map(domains.map((d) => [d.id, d]))
}

/** สรุปข้อมูล Data Element ฝั่งใดฝั่งหนึ่งของ mapping (พร้อมเส้นทางเต็ม โดเมนหลัก.โดเมนย่อย.ชื่อ) */
export function elementSummary(el: MappingElementRow, domainMap: Map<string, DomainLite>) {
  const parent = el.subDomain.parentId ? domainMap.get(el.subDomain.parentId) : undefined
  const parentDomainName = parent?.name ?? ''
  const parentDomainNameEn = parent?.nameEn ?? ''
  return {
    id: el.id,
    code: el.code,
    nameTh: el.nameTh,
    nameEn: el.nameEn,
    subDomainId: el.subDomain.id,
    subDomainName: el.subDomain.name,
    subDomainNameEn: el.subDomain.nameEn,
    parentDomainId: el.subDomain.parentId,
    parentDomainName,
    parentDomainNameEn,
    path: buildElementPath({ parentDomainName, subDomainName: el.subDomain.name, elementName: el.nameTh }),
    dataType: el.dataType,
    status: el.status,
    pii: el.pii,
    classification: el.classification,
    isCde: el.isCde,
    isFinancial: el.isFinancial,
  }
}

export type ElementSummary = ReturnType<typeof elementSummary>

/** แปลงแถว mapping จาก DB เป็นรูปแบบ response มาตรฐาน (มี summary ทั้ง source/target) */
export function mappingExpanded(m: MappingRow, domainMap: Map<string, DomainLite>) {
  return {
    id: m.id,
    code: m.code,
    mappingType: m.mappingType,
    transformNote: m.transformNote,
    note: m.note,
    // ทะเบียนข้อมูลอ้างอิงที่ใช้แมป (v0.31.0 — เฉพาะ LOOKUP)
    lookupSetId: m.lookupSetId,
    lookupSet: m.lookupSet ? { id: m.lookupSet.id, code: m.lookupSet.code, name: m.lookupSet.name, status: m.lookupSet.status } : null,
    status: m.status,
    version: m.version,
    createdBy: m.createdBy,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    source: elementSummary(m.source, domainMap),
    target: elementSummary(m.target, domainMap),
  }
}

export type ExpandedMapping = ReturnType<typeof mappingExpanded>

/** ตรวจคู่ mapping ซ้ำทั้งทิศตรง (A→B) และทิศกลับ (B→A) — เพราะการแมปหมายถึง "ข้อมูลชนิดเดียวกัน" */
export async function findDuplicatePair(
  sourceElementId: string,
  targetElementId: string,
  excludeId?: string,
): Promise<MappingRow | null> {
  return db.dataMapping.findFirst({
    where: {
      AND: [
        excludeId ? { id: { not: excludeId } } : {},
        {
          OR: [
            { sourceElementId, targetElementId },
            { sourceElementId: targetElementId, targetElementId: sourceElementId },
          ],
        },
      ],
    },
    include: MAPPING_INCLUDE,
  })
}

/**
 * สร้างรหัส mapping รุ่นใหม่ (v0.22.0): MAP-{DOMAIN}-{seq} เช่น MAP-CUST-001
 * — prefix จากชื่ออังกฤษของโดเมนหลัก "ฝั่งปลายทาง" (fallback โดเมนย่อย → GEN)
 * — seq นับต่อเฉพาะ prefix นั้น ๆ จากรหัส MAP- ที่มีอยู่ (รายการเก่า MP-#### ไม่ถูกนับ)
 */
export async function generateMappingCode(targetElementId: string): Promise<string> {
  const el = await db.dataElement.findUnique({
    where: { id: targetElementId },
    select: {
      subDomain: {
        select: {
          name: true,
          nameEn: true,
          parentId: true,
          parent: { select: { name: true, nameEn: true } },
        },
      },
    },
  })
  const root = el?.subDomain.parent ?? null
  const nameSource = root
    ? root.nameEn || root.name
    : el?.subDomain.nameEn || el?.subDomain.name || ''
  const prefix = mappingCodePrefix(nameSource)
  const rows = await db.dataMapping.findMany({
    where: { code: { startsWith: `MAP-${prefix}-` } },
    select: { code: true },
  })
  const maxSeq = rows.reduce((max, r) => {
    const seq = Number.parseInt(r.code.slice(`MAP-${prefix}-`.length), 10)
    return Number.isFinite(seq) && seq > max ? seq : max
  }, 0)
  return formatMappingCode(prefix, maxSeq + 1)
}

/* ---------------------------------------------------------------------------
 * Mapping Detail (v0.22.0) — รวมทุกอย่างที่หน้ารายละเอียดต้องใช้ต่อ 1 ฝั่ง endpoint:
 * meta ของ element + ข้อมูลกายภาพจากการแมปคอลัมน์ (asset + schema/table + physical type)
 * + กฎ DQ ที่ผูก (พร้อม exception action + ผลรันล่าสุด) + ธรรมาภิบาล (owner/steward/custodian)
 * --------------------------------------------------------------------------- */

export interface MappingPhysicalEndpoint {
  assetId: string
  assetName: string
  assetStatus: string
  schemaName: string
  tableName: string
  columnName: string
  physicalType: string
  dataType: string
  note: string
  mappedBy: string
}

export interface MappingRuleItem {
  id: string
  column: string
  condition: string
  conditionName: string
  dimension: string
  severity: string
  parameters: string
  exceptionAction: string
  exceptionActionNote: string
  lastRun: { status: string; passRate: number; createdAt: Date } | null
}

export interface MappingEndpointDetail {
  id: string
  code: string
  nameTh: string
  nameEn: string
  path: string
  parentDomainId: string | null
  parentDomainName: string
  subDomainId: string
  subDomainName: string
  status: string
  dataType: string
  formatPattern: string
  maxLength: number | null
  valueDomain: string
  unit: string
  isCde: boolean
  isFinancial: boolean
  pii: boolean
  classification: string
  owner: { email: string; name: string; roleTh: string | null } | null
  steward: { email: string; name: string; roleTh: string | null } | null
  custodian: { email: string; name: string; roleTh: string | null } | null
  physical: MappingPhysicalEndpoint[]
  rules: MappingRuleItem[]
}

export async function buildEndpointDetail(elementId: string): Promise<MappingEndpointDetail | null> {
  const el = await db.dataElement.findUnique({
    where: { id: elementId },
    include: {
      subDomain: { select: { id: true, name: true, nameEn: true, parentId: true } },
      columnMappings: {
        include: {
          asset: { select: { id: true, name: true, schemaName: true, tableName: true, status: true } },
        },
        orderBy: [{ assetId: 'asc' }, { columnName: 'asc' }],
      },
      rules: { where: { enabled: true }, orderBy: { createdAt: 'asc' } },
    },
  })
  if (!el) return null

  const [domainMap, templates, recentRuns, people, physicalColumns] = await Promise.all([
    loadDomainMap(),
    el.rules.length
      ? db.conditionTemplate.findMany({
          where: { key: { in: [...new Set(el.rules.map((r) => r.condition))] } },
          select: { key: true, name: true, dimension: true },
        })
      : Promise.resolve([]),
    el.rules.length
      ? db.dqRun.findMany({
          where: { ruleId: { in: el.rules.map((r) => r.id) } },
          orderBy: { createdAt: 'desc' },
          take: 2000,
          select: { ruleId: true, status: true, passRate: true, createdAt: true },
        })
      : Promise.resolve([]),
    db.user.findMany({
      where: { email: { in: [el.ownerId, el.stewardId, el.custodianId].filter((v): v is string => Boolean(v)) } },
      select: { email: true, name: true, role: true },
    }),
    // physical type/dataType จริงของคอลัมน์ที่แมป (จาก DataAssetColumn)
    el.columnMappings.length
      ? db.dataAssetColumn.findMany({
          where: {
            OR: el.columnMappings.map((cm) => ({ assetId: cm.assetId, name: cm.columnName })),
          },
          select: { assetId: true, name: true, dataType: true, physicalType: true },
        })
      : Promise.resolve([]),
  ])

  const parent = el.subDomain.parentId ? domainMap.get(el.subDomain.parentId) : undefined
  const templateMap = new Map(templates.map((t) => [t.key, t]))
  const lastRunByRule = new Map<string, { status: string; passRate: number; createdAt: Date }>()
  for (const run of recentRuns) {
    if (!lastRunByRule.has(run.ruleId)) {
      lastRunByRule.set(run.ruleId, { status: run.status, passRate: run.passRate, createdAt: run.createdAt })
    }
  }
  const peopleMap = new Map(people.map((u) => [u.email, u]))
  const personOf = (email: string | null) => {
    if (!email) return null
    const u = peopleMap.get(email)
    return { email, name: u?.name ?? email, roleTh: u?.role ?? null }
  }
  const columnMetaMap = new Map(physicalColumns.map((c) => [`${c.assetId}|${c.name}`, c]))

  return {
    id: el.id,
    code: el.code,
    nameTh: el.nameTh,
    nameEn: el.nameEn,
    path: buildElementPath({
      parentDomainName: parent?.name ?? '',
      subDomainName: el.subDomain.name,
      elementName: el.nameTh,
    }),
    parentDomainId: el.subDomain.parentId,
    parentDomainName: parent?.name ?? '',
    subDomainId: el.subDomain.id,
    subDomainName: el.subDomain.name,
    status: el.status,
    dataType: el.dataType,
    formatPattern: el.formatPattern,
    maxLength: el.maxLength,
    valueDomain: el.valueDomain,
    unit: el.unit,
    isCde: el.isCde,
    isFinancial: el.isFinancial,
    pii: el.pii,
    classification: el.classification,
    owner: personOf(el.ownerId),
    steward: personOf(el.stewardId),
    custodian: personOf(el.custodianId),
    physical: el.columnMappings.map((cm) => {
      const col = columnMetaMap.get(`${cm.assetId}|${cm.columnName}`)
      return {
        assetId: cm.assetId,
        assetName: cm.asset.name,
        schemaName: cm.asset.schemaName,
        tableName: cm.asset.tableName,
        columnName: cm.columnName,
        physicalType: col?.physicalType ?? '',
        dataType: col?.dataType ?? '',
        note: cm.note,
        mappedBy: cm.mappedBy,
        assetStatus: cm.asset.status,
      }
    }),
    rules: el.rules.map((r) => ({
      id: r.id,
      column: r.column,
      condition: r.condition,
      conditionName: templateMap.get(r.condition)?.name ?? r.condition,
      dimension: templateMap.get(r.condition)?.dimension ?? 'VALIDITY',
      severity: r.severity,
      parameters: r.parameters,
      exceptionAction: r.exceptionAction,
      exceptionActionNote: r.exceptionActionNote,
      lastRun: lastRunByRule.get(r.id) ?? null,
    })),
  }
}
