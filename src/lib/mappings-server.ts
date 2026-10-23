/**
 * Data Mapping — Server-side helpers (v0.21.0)
 * ใช้ร่วมกันทุก route ของ /api/mappings เพื่อคงรูปแบบ response ให้เหมือนกันทั้งระบบ
 */

import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { buildElementPath } from '@/lib/mappings'

/** include มาตรฐาน: mapping พร้อม element ทั้งสองฝั่ง + โดเมนย่อยของแต่ละฝั่ง */
export const MAPPING_INCLUDE = {
  source: { include: { subDomain: { select: { id: true, name: true, nameEn: true, parentId: true } } } },
  target: { include: { subDomain: { select: { id: true, name: true, nameEn: true, parentId: true } } } },
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
    status: m.status,
    pendingApproval: m.pendingApproval,
    approvedBy: m.approvedBy,
    approvedAt: m.approvedAt,
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
