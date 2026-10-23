/**
 * Migration script (v0.18.0) — แปลงการจัดหมวดรายคอลัมน์เดิม (DataDomainColumnAssignment, v0.15.0)
 * ให้กลายเป็น Data Element + DataElementColumnMapping โดยอัตโนมัติ ตามการตัดสินใจของเจ้าของระบบ:
 *   "แปลงเป็น Data Element เลย"
 * หลักการ:
 * - element ต้องแขวนใต้ "โดเมนย่อย" เท่านั้น — assignment ที่ชี้โดเมนหลักตรง ๆ จะถูกข้ามพร้อมรายงาน
 * - Meta Data ใช้คลังมาตรฐาน ISO/IEC 11179 (ELEMENT_CATALOG) เมื่อตรง (โดเมนย่อย, คอลัมน์)
 *   หากไม่ตรง สร้างแบบพื้นฐานจากชื่อ/ประเภทคอลัมน์จริง — ผู้ใช้แก้ meta เพิ่มได้ภายหลัง
 * - Idempotent: รันซ้ำได้ (upsert ตาม [subDomainId, nameTh] และ [elementId, assetId, columnName])
 * รัน: bun scripts/migrate-elements.ts
 */
import { PrismaClient } from '@prisma/client'
import { findCatalogEntry, prettyColumnLabel, nextElementCode, isElementDataType } from '../src/lib/elements'
import type { ElementDataType } from '../src/lib/elements'

const db = new PrismaClient()

const ACTOR = 'preecha.engineer@company.co.th'

/** แผนที่ dataType ที่ระบบอนุมาน → dataType ของ element (EMPTY ให้เป็น TEXT ตามค่าเริ่มต้น) */
function normalizeDataType(inferred: string | undefined): ElementDataType {
  const t = (inferred ?? 'TEXT').toUpperCase()
  return isElementDataType(t) ? (t as ElementDataType) : 'TEXT'
}

async function main() {
  const assignments = await db.dataDomainColumnAssignment.findMany({
    include: {
      asset: { select: { id: true, name: true, columns: { select: { name: true, dataType: true } } } },
      domain: { select: { id: true, name: true, parentId: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (assignments.length === 0) {
    console.log('ไม่มีการจัดหมวดรายคอลัมน์เดิม — ไม่ต้องแปลง')
    return
  }

  const domains = await db.dataDomain.findMany({ select: { id: true, name: true, parentId: true } })
  const isSub = new Map(domains.map((d) => [d.id, d.parentId !== null]))

  let created = 0
  let mapped = 0
  let skippedMainDomain = 0

  for (const a of assignments) {
    if (!isSub.get(a.domainId)) {
      skippedMainDomain += 1
      console.warn(`ข้าม (ชี้โดเมนหลักตรง ๆ — element ต้องอยู่ใต้โดเมนย่อย): ${a.asset.name}.${a.columnName} → ${a.domain.name}`)
      continue
    }
    const col = a.asset.columns.find((c) => c.name === a.columnName)
    if (!col) {
      skippedMainDomain += 1
      console.warn(`ข้าม (ไม่พบคอลัมน์จริง): ${a.asset.name}.${a.columnName}`)
      continue
    }

    const catalog = findCatalogEntry(a.domain.name, a.columnName)
    const nameTh = catalog?.nameTh ?? prettyColumnLabel(a.columnName)

    // upsert element ตาม [subDomainId, nameTh] — กันซ้ำเมื่อรัน migration ซ้ำ
    const existing = await db.dataElement.findUnique({
      where: { subDomainId_nameTh: { subDomainId: a.domainId, nameTh } },
      select: { id: true },
    })
    const element = existing
      ? await db.dataElement.update({
          where: { id: existing.id },
          data: {
            nameEn: catalog?.nameEn ?? a.columnName,
            definition: catalog?.definition ?? '',
            examples: catalog?.examples ?? '',
            dataType: catalog?.dataType ?? normalizeDataType(col.dataType),
            formatPattern: catalog?.formatPattern ?? '',
            valueDomain: catalog?.valueDomain ?? '',
            maxLength: catalog?.maxLength ?? null,
            unit: catalog?.unit ?? '',
            pii: catalog?.pii ?? false,
          },
        })
      : await db.dataElement.create({
          data: {
            code: await nextElementCode(db),
            subDomainId: a.domainId,
            nameTh,
            nameEn: catalog?.nameEn ?? a.columnName,
            definition: catalog?.definition ?? '',
            examples: catalog?.examples ?? '',
            dataType: catalog?.dataType ?? normalizeDataType(col.dataType),
            formatPattern: catalog?.formatPattern ?? '',
            valueDomain: catalog?.valueDomain ?? '',
            maxLength: catalog?.maxLength ?? null,
            unit: catalog?.unit ?? '',
            pii: catalog?.pii ?? false,
            createdBy: ACTOR,
          },
        })
    if (!existing) created += 1

    // upsert mapping [elementId, assetId, columnName]
    await db.dataElementColumnMapping.upsert({
      where: { elementId_assetId_columnName: { elementId: element.id, assetId: a.assetId, columnName: a.columnName } },
      create: { elementId: element.id, assetId: a.assetId, columnName: a.columnName, mappedBy: ACTOR, note: 'แปลงอัตโนมัติจากการจัดหมวดรายคอลัมน์ (v0.15.0)' },
      update: {},
    })
    mapped += 1
  }

  await db.auditLog.create({
    data: {
      action: 'MIGRATE_ELEMENTS',
      actor: ACTOR,
      target: `${created} elements`,
      detail: `Migration v0.18.0: แปลงการจัดหมวดรายคอลัมน์เดิม ${assignments.length} รายการ เป็น Data Element ใหม่ ${created} รายการ + mapping ${mapped} รายการ${skippedMainDomain > 0 ? ` (ข้าม ${skippedMainDomain} รายการที่ชี้โดเมนหลัก/คอลัมน์หาย — ต้องจัดหมวดใหม่ระดับโดเมนย่อย)` : ''}`,
    },
  })

  console.log(`สำเร็จ: สร้าง element ใหม่ ${created} · mapping ${mapped} · ข้าม ${skippedMainDomain}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
