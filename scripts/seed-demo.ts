/**
 * Seed ข้อมูลสาธิต (v0.33.0) — สร้างข้อมูล demo ครบวงจรหลัง sandbox rollback ทำ DB หาย
 * ครอบคลุม: ผู้ใช้ 8 บทบาท (รหัสผ่านเริ่มต้น) · Data Domain/Element · Data Asset
 * · ทะเบียนข้อมูลอ้างอิง RD-0001/RD-0002 · คลังเงื่อนไข 10 · กฎ 8 ข้อ · Mapping 1 เส้น
 * Idempotent — รันซ้ำได้ (เช็คของเดิมก่อนสร้างทุกชิ้น)
 * รัน: bunx tsx scripts/seed-demo.ts
 */
import { PrismaClient } from '@prisma/client'
import { scryptSync, randomBytes } from 'node:crypto'
import { CONDITIONS, type ConditionKey } from '../src/lib/dq'

const prisma = new PrismaClient()
const DEMO_PASSWORD = 'Dq@2025'

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

const USERS = [
  { email: 'somchai.owner@company.co.th', name: 'สมชาย ใจดีงาม', role: 'DATA_OWNER' },
  { email: 'malee.steward@company.co.th', name: 'มาลี รักษางาม', role: 'DATA_STEWARD' },
  { email: 'aree.analyst@company.co.th', name: 'อารี วิเคราะห์เก่ง', role: 'DQ_ANALYST' },
  { email: 'preecha.engineer@company.co.th', name: 'ปรีชา วิศวข้อมูล', role: 'DATA_ENGINEER' },
  { email: 'kanit.compliance@company.co.th', name: 'กนิต ตรวจตราดี', role: 'COMPLIANCE_OFFICER' },
  { email: 'niran.user@company.co.th', name: 'นิรัน ใช้งานดี', role: 'BUSINESS_USER' },
  { email: 'wisit.executive@company.co.th', name: 'วิศิษฐ์ บริหารงาม', role: 'EXECUTIVE' },
  { email: 'sys.admin@company.co.th', name: 'ผู้ดูแลระบบ', role: 'SYS_ADMIN' },
]

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000)
}

async function main() {
  const log: string[] = []

  /* ---------------- 1) ผู้ใช้ 8 บทบาท + รหัสผ่าน ---------------- */
  const hash = hashPassword(DEMO_PASSWORD)
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, status: 'ACTIVE' },
      create: { ...u, status: 'ACTIVE', passwordHash: hash },
    })
  }
  // admin@test.com (เดิม) — รักษาไว้ ให้มีรหัสผ่านถ้ายังไม่มี
  await prisma.user.upsert({
    where: { email: 'admin@test.com' },
    update: {},
    create: { email: 'admin@test.com', name: 'admin', role: 'SYS_ADMIN', status: 'ACTIVE', passwordHash: hash },
  })
  log.push('users: 8 บทบาท + admin@test.com (รหัสผ่าน Dq@2025)')

  /* ---------------- 2) Data Domain + โดเมนย่อย ---------------- */
  async function ensureDomain(name: string, nameEn: string, parentId: string | null, position: number, color: string) {
    const found = await prisma.dataDomain.findFirst({ where: { name, parentId } })
    if (found) return found
    return prisma.dataDomain.create({
      data: { name, nameEn, description: '', color, position, createdBy: 'sys.admin@company.co.th', parentId },
    })
  }
  const domCustomer = await ensureDomain('ข้อมูลลูกค้า', 'Customer', null, 0, 'emerald')
  const domFinance = await ensureDomain('ข้อมูลการเงิน', 'Finance', null, 1, 'teal')
  const subRegister = await ensureDomain('ทะเบียนลูกค้า', 'Customer Register', domCustomer.id, 0, 'emerald')
  const subFx = await ensureDomain('อัตราแลกเปลี่ยน', 'FX Rate', domFinance.id, 0, 'teal')
  log.push('domains: ข้อมูลลูกค้า/ทะเบียนลูกค้า · ข้อมูลการเงิน/อัตราแลกเปลี่ยน')

  /* ---------------- 3) Data Asset 2 ชุด (columns + SampleRow + DataAssetRecord) ---------------- */
  const customerRows: Record<string, string | number>[] = [
    { customer_code: 'CUST-001', customer_name: 'บจก.ไทยพัฒนาการ', segment: 'ENTERPRISE', credit_limit: 25000000, email: 'contact@thaipat.co.th', phone: '02-123-4567' },
    { customer_code: 'CUST-002', customer_name: 'หจก.รุ่งเรืองการค้า', segment: 'SME', credit_limit: 1500000, email: 'info@rungreung.co.th', phone: '081-234-5678' },
    { customer_code: 'CUST-003', customer_name: 'บจก.อินทรีเทคโนโลยี', segment: 'ENTERPRISE', credit_limit: 48000000, email: 'it@inturi-tech.co.th', phone: '02-987-6543' },
    { customer_code: 'CUST-002', customer_name: 'หจก.รุ่งเรืองการค้า (สาขา 2)', segment: 'SME', credit_limit: 1200000, email: 'branch2@rungreung.co.th', phone: '081-234-5679' },
    { customer_code: 'CUST-004', customer_name: 'บจก.แสงสุริยา', segment: 'SME', credit_limit: 2200000, email: '', phone: '089-111-2233' },
    { customer_code: 'CUST-005', customer_name: 'ราชการทหารบก (จัดซื้อกลาง)', segment: 'GOV', credit_limit: 80000000, email: 'procure@army.mil.th', phone: '02-456-7890' },
    { customer_code: 'CUST-006', customer_name: 'บจก.ฟู้ดดีลี่', segment: 'SME', credit_limit: 800000, email: 'sales@foodly.co.th', phone: '092-345-6789' },
    { customer_code: 'CUST-007', customer_name: 'บจก.โลจิสติกส์ไทย', segment: 'ENTERPRISE', credit_limit: 65000000, email: 'ops@thailogistic.co.th', phone: '02-777-8888' },
    { customer_code: 'CUST-008', customer_name: 'หจก.สมหวังอุตสาหกรรม', segment: 'SME', credit_limit: 1900000, email: 'somwang.ind@gmail.com', phone: '086-555-1010' },
    { customer_code: 'CUST-009', customer_name: 'บจก.กรีนเอ็นเนอร์ยี่', segment: 'OTHER', credit_limit: 35000000, email: 'hello@greenenergy.co.th', phone: '02-321-6549' },
    { customer_code: 'CUST-010', customer_name: 'บจก.รวมน้ำใจก่อสร้าง', segment: 'SME', credit_limit: 4200000, email: 'contact@ruamnam.co.th', phone: '084-222-3333' },
    { customer_code: 'CUST-011', customer_name: 'บจก.ซีพีเอฟซิมูเลต', segment: 'ENTERPRISE', credit_limit: 120000000, email: '', phone: '02-111-2222' },
    { customer_code: 'CUST-012', customer_name: 'หจก.วิศวกรรมประแสง', segment: 'SME', credit_limit: 950000, email: 'no-reply@prayong.co.th', phone: '080-999-8888' },
    { customer_code: 'CUST-013', customer_name: 'บจก.ดิจิทัลเพย์เมนต์', segment: 'ENTERPRISE', credit_limit: 90000000, email: 'finance@digitalpay.co.th', phone: '02-654-3210' },
    { customer_code: 'CUST-014', customer_name: 'รพ.สงฆ์ใกล้บ้าน', segment: 'GOV', credit_limit: 55000000, email: 'admin@closhosp.go.th', phone: '02-445-5667' },
    { customer_code: 'CUST-015', customer_name: 'บจก.อัญมณีสยาม', segment: 'OTHER', credit_limit: 28000000, email: 'มงคล@อัญมณี', phone: '091-777-8888' },
    { customer_code: 'CUST-016', customer_name: 'บจก.แอ็กครูโรบอติกส์', segment: 'ENTERPRISE', credit_limit: 72000000, email: 'kriangkrai@accuru.co.th', phone: '02-506-7788' },
    { customer_code: 'CUST-017', customer_name: 'หจก.ชลบุรีซีฟู้ด', segment: 'PREMIUM', credit_limit: 3300000, email: 'seafood@chonburi.co.th', phone: '038-222-1111' },
    { customer_code: 'CUST-018', customer_name: 'บจก.เคซีไอลีสซิ่ง', segment: 'OTHER', credit_limit: 150000000, email: 'leasing@kci.co.th', phone: '02-888-9999' },
    { customer_code: 'CUST-019', customer_name: 'บจก.ศรีสุขภาพ', segment: 'SME', credit_limit: 1100000, email: 'care@srissuk.co.th', phone: '085-123-9876' },
    { customer_code: 'CUST-020', customer_name: 'บจก.เพาเวอร์กริด', segment: 'ENTERPRISE', credit_limit: 98000000, email: 'grid@powergrid.co.th', phone: '02-444-5555' },
  ]
  const fxRows: Record<string, string | number>[] = [
    { currency: 'THB', rate: 1.0, as_of_date: '2026-10-28' },
    { currency: 'USD', rate: 35.82, as_of_date: '2026-10-28' },
    { currency: 'EUR', rate: 38.74, as_of_date: '2026-10-28' },
    { currency: 'JPY', rate: 0.2361, as_of_date: '2026-10-27' },
    { currency: 'GBP', rate: 45.31, as_of_date: '2026-10-27' },
    { currency: 'SGD', rate: 26.55, as_of_date: '2026-10-27' },
    { currency: 'AUD', rate: 23.09, as_of_date: '2026-10-26' },
    { currency: 'HKD', rate: 4.58, as_of_date: '2026-10-26' },
    { currency: 'USD', rate: 35.77, as_of_date: '2026-10-25' },
    { currency: 'EUR', rate: 38.69, as_of_date: '2026-10-25' },
  ]

  // ใช้ Dataset + SampleRow เป็นแหล่งข้อมูลเอนจิน (run/run-domain อ่านจาก SampleRow)
  async function ensureDataset(name: string, domainId: string, classification: string, rows: Record<string, string | number>[]) {
    let ds = await prisma.dataset.findFirst({ where: { name } })
    if (!ds) {
      ds = await prisma.dataset.create({
        data: { name, sourceType: 'CSV', piiEnabled: true, classification, status: 'ACTIVE', domainId },
      })
      for (const row of rows) {
        await prisma.sampleRow.create({ data: { datasetId: ds.id, payload: JSON.stringify(row) } })
      }
    }
    return ds
  }

  const dsCustomer = await ensureDataset('ทะเบียนลูกค้าองค์กร', subRegister.id, 'CONFIDENTIAL', customerRows)
  const dsFx = await ensureDataset('อัตราแลกเปลี่ยนรายวัน', subFx.id, 'INTERNAL', fxRows)
  log.push('datasets: ทะเบียนลูกค้าองค์กร (21 แถว) · อัตราแลกเปลี่ยนรายวัน (10 แถว) + SampleRows')

  // DataAsset สำหรับคลังข้อมูล + สแกนค่านอกทะเบียน (DataAssetRecord)
  async function ensureAssetFull(name: string, domainId: string, schema: string, table: string, columns: { name: string; dataType: string; physicalType: string }[], rows: Record<string, string | number>[]) {
    const found = await prisma.dataAsset.findFirst({ where: { name } })
    if (found) return found
    const asset = await prisma.dataAsset.create({
      data: {
        name, sourceType: 'CSV', domainId, schemaName: schema, tableName: table,
        sourceInfo: JSON.stringify({ fileName: `${table}.csv`, seeded: true }), piiEnabled: true,
        rowCount: rows.length, columnCount: columns.length, importedBy: 'preecha.engineer@company.co.th',
      },
    })
    for (let i = 0; i < columns.length; i++) {
      await prisma.dataAssetColumn.create({ data: { assetId: asset.id, name: columns[i].name, dataType: columns[i].dataType, physicalType: columns[i].physicalType, position: i } })
    }
    for (let i = 0; i < rows.length; i++) {
      await prisma.dataAssetRecord.create({ data: { assetId: asset.id, rowNo: i + 1, payload: JSON.stringify(rows[i]) } })
    }
    return asset
  }
  await ensureAssetFull(
    'ทะเบียนลูกค้าองค์กร', subRegister.id, 'CRM', 'customer_master',
    [
      { name: 'customer_code', dataType: 'TEXT', physicalType: 'VARCHAR(20)' },
      { name: 'customer_name', dataType: 'TEXT', physicalType: 'VARCHAR(200)' },
      { name: 'segment', dataType: 'TEXT', physicalType: 'VARCHAR(20)' },
      { name: 'credit_limit', dataType: 'NUMBER', physicalType: 'DECIMAL(18,2)' },
      { name: 'email', dataType: 'TEXT', physicalType: 'VARCHAR(120)' },
      { name: 'phone', dataType: 'TEXT', physicalType: 'VARCHAR(30)' },
    ],
    customerRows,
  )
  await ensureAssetFull(
    'อัตราแลกเปลี่ยนรายวัน', subFx.id, 'FX', 'fx_rate_daily',
    [
      { name: 'currency', dataType: 'TEXT', physicalType: 'VARCHAR(3)' },
      { name: 'rate', dataType: 'NUMBER', physicalType: 'DECIMAL(12,4)' },
      { name: 'as_of_date', dataType: 'DATE', physicalType: 'DATE' },
    ],
    fxRows,
  )
  log.push('data assets: 2 (columns + records สำหรับคลังข้อมูล/สแกน orphan)')

  /* ---------------- 4) ทะเบียนข้อมูลอ้างอิง RD-0001 / RD-0002 ---------------- */
  async function ensureRefSet(code: string, name: string, nameEn: string, subDomainId: string, values: { value: string; labelTh: string; labelEn: string }[]) {
    let set = await prisma.referenceSet.findUnique({ where: { code } })
    if (!set) {
      set = await prisma.referenceSet.create({
        data: {
          code, name, nameEn, description: 'ทะเบียนมาตรฐานขององค์กร (seed)', subDomainId,
          ownerId: 'somchai.owner@company.co.th', stewardId: 'malee.steward@company.co.th',
          status: 'ACTIVE', approvedBy: 'somchai.owner@company.co.th', approvedAt: daysAgo(10), version: '1.1',
          createdBy: 'sys.admin@company.co.th',
        },
      })
    }
    for (let i = 0; i < values.length; i++) {
      const v = values[i]
      const exists = await prisma.referenceValue.findUnique({ where: { setId_value: { setId: set.id, value: v.value } } })
      if (!exists) {
        await prisma.referenceValue.create({ data: { setId: set.id, value: v.value, labelTh: v.labelTh, labelEn: v.labelEn, sortOrder: i, status: 'ACTIVE' } })
      }
    }
    return set
  }
  const refFx = await ensureRefSet('RD-0001', 'สกุลเงินมาตรฐานสากล (ISO 4217)', 'ISO 4217 Currency', subFx.id, [
    { value: 'THB', labelTh: 'บาทไทย', labelEn: 'Thai Baht' },
    { value: 'USD', labelTh: 'ดอลลาร์สหรัฐ', labelEn: 'US Dollar' },
    { value: 'EUR', labelTh: 'ยูโร', labelEn: 'Euro' },
    { value: 'JPY', labelTh: 'เยนญี่ปุ่น', labelEn: 'Japanese Yen' },
    { value: 'GBP', labelTh: 'ปอนด์สเตอร์ลิง', labelEn: 'British Pound' },
    { value: 'SGD', labelTh: 'ดอลลาร์สิงคโปร์', labelEn: 'Singapore Dollar' },
  ])
  const refSeg = await ensureRefSet('RD-0002', 'กลุ่มลูกค้าองค์กร', 'Customer Segment', subRegister.id, [
    { value: 'SME', labelTh: 'ธุรกิจขนาดกลางและขนาดย่อม', labelEn: 'SME' },
    { value: 'ENTERPRISE', labelTh: 'ลูกค้าองค์กรขนาดใหญ่', labelEn: 'Enterprise' },
    { value: 'GOV', labelTh: 'หน่วยงานราชการ', labelEn: 'Government' },
    { value: 'OTHER', labelTh: 'อื่น ๆ', labelEn: 'Other' },
  ])
  log.push('reference sets: RD-0001 (6 ค่า) · RD-0002 (4 ค่า) — ACTIVE v1.1')

  /* ---------------- 5) Data Element 4 ตัว + แมปคอลัมน์จริง ---------------- */
  async function ensureElement(code: string, subDomainId: string, nameTh: string, nameEn: string, dataType: string, opts: Partial<{ isCde: boolean; pii: boolean; referenceSetId: string; valueDomain: string; definition: string; status: string }> = {}) {
    const found = await prisma.dataElement.findUnique({ where: { code } })
    if (found) return found
    return prisma.dataElement.create({
      data: {
        code, subDomainId, nameTh, nameEn, dataType,
        definition: opts.definition ?? '', valueDomain: opts.valueDomain ?? '',
        ownerId: 'somchai.owner@company.co.th', stewardId: 'malee.steward@company.co.th',
        custodianId: 'preecha.engineer@company.co.th',
        isCde: opts.isCde ?? false, pii: opts.pii ?? false,
        referenceSetId: opts.referenceSetId ?? null,
        status: 'ACTIVE', approvedBy: 'somchai.owner@company.co.th', approvedAt: daysAgo(9),
        createdBy: 'preecha.engineer@company.co.th',
      },
    })
  }
  const elCustCode = await ensureElement('EL-0001', subRegister.id, 'รหัสลูกค้า', 'Customer Code', 'TEXT', { isCde: true, definition: 'รหัสประจำตัวลูกค้าองค์กร รูปแบบ CUST-XXX ไม่ซ้ำกัน', valueDomain: 'CUST-XXX โดย XXX = 1..999' })
  const elSegment = await ensureElement('EL-0002', subRegister.id, 'กลุ่มลูกค้า', 'Customer Segment', 'TEXT', { referenceSetId: refSeg.id, definition: 'การจำแนกกลุ่มลูกค้าองค์กรตามทะเบียนข้อมูลอ้างอิง' })
  const elCurrency = await ensureElement('EL-0003', subFx.id, 'สกุลเงิน', 'Currency Code', 'TEXT', { isCde: true, referenceSetId: refFx.id, definition: 'รหัสสกุลเงินตามมาตรฐาน ISO 4217 (ทะเบียนขององค์กร)' })
  const elCrmCode = await ensureElement('EL-0004', subRegister.id, 'รหัสลูกค้า CRM', 'Customer Code (CRM)', 'TEXT', { definition: 'รหัสลูกค้าในระบบ CRM — ไหลมาจากระบบหลักโดยตรง' })
  async function ensureColMapping(elementId: string, assetId: string, columnName: string) {
    const exists = await prisma.dataElementColumnMapping.findUnique({ where: { elementId_assetId_columnName: { elementId, assetId, columnName } } })
    if (!exists) await prisma.dataElementColumnMapping.create({ data: { elementId, assetId, columnName, mappedBy: 'preecha.engineer@company.co.th' } })
  }
  log.push('elements: EL-0001 (CDE) · EL-0002 (ผูก RD-0002) · EL-0003 (CDE, ผูก RD-0001) · EL-0004')

  /* ---------------- 6) คลังเงื่อนไข 10 ระบบ ---------------- */
  for (const key of Object.keys(CONDITIONS) as ConditionKey[]) {
    const c = CONDITIONS[key]
    await prisma.conditionTemplate.upsert({
      where: { key },
      update: {},
      create: {
        key, name: c.th, nameEn: c.en, sentence: c.sentence,
        dimension: c.dimension, engineType: key, params: JSON.stringify(c.params),
        isSystem: true, enabled: true,
      },
    })
  }
  log.push('condition templates: 10 ระบบ (จาก lib/dq.ts แหล่งเดียว)')

  /* ---------------- 7) กฎ 8 ข้อ ---------------- */
  async function ensureRule(column: string, condition: ConditionKey, parameters: Record<string, unknown>, severity: string, dsIds: string[], elementId?: string) {
    const exists = await prisma.dqRule.findFirst({ where: { column, condition, dataElementId: elementId ?? null } })
    if (exists) return exists
    const rule = await prisma.dqRule.create({
      data: {
        column, condition, parameters: JSON.stringify(parameters), severity, threshold: 95,
        dataElementId: elementId ?? null, enabled: true,
      },
    })
    for (const dsId of dsIds) {
      await prisma.ruleDataset.create({ data: { ruleId: rule.id, datasetId: dsId } })
    }
    return rule
  }
  await ensureRule('customer_code', 'NOT_NULL', {}, 'HIGH', [dsCustomer.id], elCustCode.id)
  await ensureRule('customer_code', 'UNIQUE', {}, 'HIGH', [dsCustomer.id], elCustCode.id)
  await ensureRule('email', 'EMAIL', {}, 'MEDIUM', [dsCustomer.id])
  await ensureRule('segment', 'IN_LIST', { referenceSetId: refSeg.id }, 'HIGH', [dsCustomer.id], elSegment.id)
  await ensureRule('credit_limit', 'RANGE', { min: 0, max: 100000000 }, 'MEDIUM', [dsCustomer.id])
  await ensureRule('currency', 'REFERENCE_MATCH', { referenceSetId: refFx.id }, 'CRITICAL', [dsFx.id], elCurrency.id)
  await ensureRule('rate', 'RANGE', { min: 0, max: 1000 }, 'MEDIUM', [dsFx.id])
  await ensureRule('as_of_date', 'MAX_AGE_DAYS', { days: 7 }, 'LOW', [dsFx.id])
  log.push('rules: 8 ข้อ (รวม IN_LIST/REFERENCE_MATCH โหมดทะเบียน)')

  /* ---------------- 8) Data Mapping 1 เส้น (ACTIVE) ---------------- */
  const mapExists = await prisma.dataMapping.findUnique({ where: { code: 'MP-0001' } })
  if (!mapExists) {
    await prisma.dataMapping.create({
      data: {
        code: 'MP-0001', sourceElementId: elCustCode.id, targetElementId: elCrmCode.id,
        mappingType: 'DIRECT', note: 'รหัสลูกค้าจากระบบหลักไหลเข้า CRM โดยตรง (seed)',
        status: 'ACTIVE', version: '1.0', approvedBy: 'somchai.owner@company.co.th', approvedAt: daysAgo(8),
        createdBy: 'preecha.engineer@company.co.th',
      },
    })
  }
  await ensureColMapping(elCustCode.id, (await prisma.dataAsset.findFirst({ where: { name: 'ทะเบียนลูกค้าองค์กร' } }))!.id, 'customer_code')
  await ensureColMapping(elSegment.id, (await prisma.dataAsset.findFirst({ where: { name: 'ทะเบียนลูกค้าองค์กร' } }))!.id, 'segment')
  await ensureColMapping(elCurrency.id, (await prisma.dataAsset.findFirst({ where: { name: 'อัตราแลกเปลี่ยนรายวัน' } }))!.id, 'currency')
  log.push('mapping: MP-0001 DIRECT (EL-0001→EL-0004) + แมปคอลัมน์จริง 3 เส้น')

  /* ---------------- 9) แผนงาน DQ 2026–2030 (v0.34.0 — ProjectTask) ---------------- */
  // แผนแม่บท: ปี 2026 ทวนสอบโดเมนหลักที่มีข้อมูลอยู่แล้ว (ลูกค้า/การเงิน/สินเชื่อ) — ปีถัดไปขยายโดเมนอื่นถึง 2030
  // แต่ละ Task มีน้ำหนักคะแนน ×1–×5 และความคืบหน้า 0–100 (สถานะ derive จาก progress)
  const PLAN_TASKS: Array<{
    title: string; detail: string; domainLabel: string; year: number; quarter: number;
    weight: number; progress: number; ownerRole: string; sortOrder: number;
  }> = [
    { title: 'ทวนสอบความสมบูรณ์ทะเบียนลูกค้าองค์กร (ครบถ้วน/ไม่ซ้ำ)', detail: 'กฎ NOT_NULL/UNIQUE รหัสลูกค้า — จัดเก็บหลักฐานผลรันตรวจ', domainLabel: 'ข้อมูลลูกค้า', year: 2026, quarter: 1, weight: 5, progress: 100, ownerRole: 'DATA_OWNER', sortOrder: 1 },
    { title: 'ทวนสอบรูปแบบอีเมล/เบอร์โทรติดต่อลูกค้า', detail: 'กฎ EMAIL — แก้ค่าที่รูปแบบไม่ถูกต้องจากโปรไฟล์ข้อมูล', domainLabel: 'ข้อมูลลูกค้า', year: 2026, quarter: 2, weight: 3, progress: 100, ownerRole: 'DATA_STEWARD', sortOrder: 2 },
    { title: 'จัดระดับชั้นข้อมูล (Classification) ลูกค้าทุกกลุ่ม', detail: 'CONFIDENTIAL/INTERNAL ตามนโยบาย PDPA', domainLabel: 'ข้อมูลลูกค้า', year: 2026, quarter: 3, weight: 2, progress: 75, ownerRole: 'COMPLIANCE_OFFICER', sortOrder: 3 },
    { title: 'ทวนสอบความถูกต้องอัตราแลกเปลี่ยนรายวัน', detail: 'กฎ REFERENCE_MATCH สกุลเงิน + MAX_AGE_DAYS 7 วัน', domainLabel: 'ข้อมูลการเงิน', year: 2026, quarter: 1, weight: 4, progress: 100, ownerRole: 'DATA_STEWARD', sortOrder: 4 },
    { title: 'ทวนสอบช่วงค่าอัตราดอกเบี้ย/ค่าธรรมเนียม', detail: 'กฎ RANGE — ตรวจค่านอกช่วงที่ธนาคารประกาศ', domainLabel: 'ข้อมูลการเงิน', year: 2026, quarter: 2, weight: 3, progress: 50, ownerRole: 'DQ_ANALYST', sortOrder: 5 },
    { title: 'ทวนสอบความครบถ้วนไฟล์สินเชื่อรายเดือน', detail: 'ไฟล์จากระบบสินเชื่อ — ตรวจแถวว่างของวงเงิน/วันสัญญา', domainLabel: 'ข้อมูลสินเชื่อ', year: 2026, quarter: 3, weight: 4, progress: 40, ownerRole: 'DATA_STEWARD', sortOrder: 6 },
    { title: 'ทวนสอบรหัสสาขา/หน่วยงานเจ้าของสินเชื่อ', detail: 'แมปกับทะเบียนอ้างอิงหน่วยงาน', domainLabel: 'ข้อมูลสินเชื่อ', year: 2026, quarter: 4, weight: 2, progress: 0, ownerRole: 'DATA_STEWARD', sortOrder: 7 },
    { title: 'ทวนสอบยอดเงินฝากรายวันเทียบระบบแกน', detail: 'Reconcile กับระบบ core banking', domainLabel: 'ข้อมูลเงินฝาก', year: 2027, quarter: 1, weight: 5, progress: 0, ownerRole: 'DATA_OWNER', sortOrder: 8 },
    { title: 'ทวนสอบความเป็นเอกภาพรหัสสถานะลูกหนี้', detail: 'IN_LIST ตามทะเบียนสถานะ', domainLabel: 'ข้อมูลสินเชื่อ', year: 2027, quarter: 2, weight: 3, progress: 0, ownerRole: 'DQ_ANALYST', sortOrder: 9 },
    { title: 'ทวนสอบข้อมูลความเสี่ยง (NPL/พึงผูกพัน) รายเดือน', detail: 'เกณฑ์ BCBS 239 — ความถูกต้อง/ตรวจสอบย้อนหลังได้', domainLabel: 'ข้อมูลความเสี่ยง', year: 2027, quarter: 3, weight: 5, progress: 0, ownerRole: 'DATA_OWNER', sortOrder: 10 },
    { title: 'ทวนสอบประวัติคะแนนความเสี่ยงลูกค้า (Risk Score)', detail: 'ช่วงค่า + ความเปลี่ยนแปลงผิดปกติข้ามรอบ', domainLabel: 'ข้อมูลความเสี่ยง', year: 2028, quarter: 1, weight: 4, progress: 0, ownerRole: 'DQ_ANALYST', sortOrder: 11 },
    { title: 'ทวนสอบข้อมูลการตลาด — ความยินยอม (Consent) PDPA', detail: 'ธง consent ครบถ้วน/อ้างอิงถูกต้อง', domainLabel: 'ข้อมูลการตลาด', year: 2028, quarter: 2, weight: 4, progress: 0, ownerRole: 'COMPLIANCE_OFFICER', sortOrder: 12 },
    { title: 'ทวนสอบความสมบูรณ์ข้อมูลผู้เบิกจ่าย/ที่อยู่', detail: 'ซ้ำซ้อน/ไม่ครบก่อนออกหนังสือ', domainLabel: 'ข้อมูลทรัพยากรบุคคล', year: 2029, quarter: 1, weight: 2, progress: 0, ownerRole: 'DATA_STEWARD', sortOrder: 13 },
    { title: 'ทวนสอบข้อมูลจัดซื้อ — รหัสคู่ค้า/เลขผู้เสียภาษี', detail: 'แมปทะเบียนคู่ค้า ตรวจรูปแบบเลขผู้เสียภาษี', domainLabel: 'ข้อมูลการจัดซื้อ', year: 2030, quarter: 1, weight: 3, progress: 0, ownerRole: 'DATA_STEWARD', sortOrder: 14 },
    { title: 'ทวนสอบสิทธิ์เข้าถึงข้อมูลไอที (Access Review)', detail: 'RBAC รายชุดข้อมูล — ตรวจบัญชีค้าง/สิทธิ์เกิน', domainLabel: 'ข้อมูลระบบไอที', year: 2030, quarter: 2, weight: 3, progress: 0, ownerRole: 'SYS_ADMIN', sortOrder: 15 },
  ]
  let planCreated = 0
  for (const t of PLAN_TASKS) {
    const exists = await prisma.projectTask.findFirst({ where: { title: t.title, domainLabel: t.domainLabel, year: t.year } })
    if (exists) continue
    await prisma.projectTask.create({ data: { ...t, createdBy: 'sys.admin@company.co.th', updatedBy: 'sys.admin@company.co.th' } })
    planCreated++
  }
  log.push(`project plan: แผนงาน DQ 2026–2030 ${PLAN_TASKS.length} task 8 โดเมน (เพิ่มใหม่ ${planCreated})`)

  /* ---------------- 10) Audit log เริ่มต้น ---------------- */
  const auditCount = await prisma.auditLog.count()
  if (auditCount === 0) {
    await prisma.auditLog.create({
      data: {
        action: 'SEED_DEMO', actor: 'sys.admin@company.co.th', target: 'platform',
        detail: 'สร้างข้อมูลสาธิตเริ่มต้นครบวงจร (v0.34.0): ผู้ใช้ 8 บทบาท · โดเมน 2 · asset/dataset 2 ชุด · ทะเบียน RD-0001/RD-0002 · เงื่อนไข 10 · กฎ 8 · แมป 1 · แผนงาน DQ 2026–2030',
      },
    })
    log.push('audit: SEED_DEMO 1 รายการ')
  }

  console.log('\n=== SEED DEMO เสร็จสมบูรณ์ ===')
  for (const line of log) console.log(' · ' + line)
  console.log(`\nรหัสผ่านเริ่มต้นทุกบัญชี: ${DEMO_PASSWORD}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
