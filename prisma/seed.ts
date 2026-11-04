// Seed — deterministic, realistic enterprise sample. Runs the REAL validation
// pipeline for today's runs (rules engine + jobs runner), then backfills 30-day
// history. Idempotent: skips when users exist unless FORCE_SEED=1.
import { PrismaClient } from '@prisma/client'
import { createHmac } from 'crypto'

const db = new PrismaClient()

const day = 24 * 3600e3
const ago = (d: number, h = 0) => new Date(Date.now() - d * day - h * 3600e3)

// ── deterministic pseudo-random ──
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function main() {
  const existing = await db.user.count()
  if (existing > 0 && !process.env.FORCE_SEED) {
    console.log('Seed skipped (already seeded). Use FORCE_SEED=1 to reseed.')
    return
  }
  if (process.env.FORCE_SEED) {
    await db.issueComment.deleteMany(); await db.issue.deleteMany()
    await db.validationRuleResult.deleteMany(); await db.validationRun.deleteMany()
    await db.ruleVersion.deleteMany(); await db.rule.deleteMany()
    await db.anomaly.deleteMany(); await db.mLModel.deleteMany()
    await db.profileSnapshot.deleteMany(); await db.datasetColumn.deleteMany()
    await db.datasetPermission.deleteMany(); await db.dataset.deleteMany()
    await db.dataSource.deleteMany(); await db.auditLog.deleteMany()
    await db.notification.deleteMany(); await db.policySetting.deleteMany()
    await db.fileUpload.deleteMany(); await db.job.deleteMany(); await db.user.deleteMany()
  }

  console.log('Seeding users…')
  const users = await Promise.all([
    db.user.create({ data: { email: 'somchai.p@enterprise.co.th', name: 'Somchai Prasertkit', nameTh: 'สมชาย ประเสริฐกิจ', role: 'SYSTEM_ADMIN', businessUnit: 'PLATFORM', titleEn: 'Platform Administrator', titleTh: 'ผู้ดูแลระบบแพลตฟอร์ม', mfaEnabled: true } }),
    db.user.create({ data: { email: 'nattaya.s@enterprise.co.th', name: 'Nattaya Suksumran', nameTh: 'นัทธญา สุขสำราญ', role: 'DATA_OWNER', businessUnit: 'CUSTOMER', titleEn: 'Head of Customer Data', titleTh: 'หัวหน้าข้อมูลลูกค้า', mfaEnabled: true } }),
    db.user.create({ data: { email: 'arree.k@enterprise.co.th', name: 'Arree Kaewkla', nameTh: 'อารี แก้วกล้า', role: 'DATA_STEWARD', businessUnit: 'CUSTOMER', titleEn: 'Customer Data Steward', titleTh: 'ผู้ดูแลข้อมูลลูกค้า' } }),
    db.user.create({ data: { email: 'prasert.w@enterprise.co.th', name: 'Prasert Wongchai', nameTh: 'ประเสริฐ วงศ์ชัย', role: 'DATA_ENGINEER', businessUnit: 'PLATFORM', titleEn: 'Senior Data Engineer', titleTh: 'วิศวกรข้อมูลอาวุโส' } }),
    db.user.create({ data: { email: 'kanya.m@enterprise.co.th', name: 'Kanya Meechai', nameTh: 'กัญญา มีชัย', role: 'DATA_ANALYST', businessUnit: 'SALES', titleEn: 'Business Analyst', titleTh: 'นักวิเคราะห์ธุรกิจ' } }),
    db.user.create({ data: { email: 'thanapon.t@enterprise.co.th', name: 'Thanapon Thirakanok', nameTh: 'ธนาพนธ์ ธีระกนก', role: 'DATA_SCIENTIST', businessUnit: 'PLATFORM', titleEn: 'Lead Data Scientist', titleTh: 'หัวหน้านักวิทยาศาสตร์ข้อมูล' } }),
    db.user.create({ data: { email: 'supaporn.r@enterprise.co.th', name: 'Supaporn Ruangdet', nameTh: 'สุภาพร เรืองเดช', role: 'AUDITOR', businessUnit: 'PLATFORM', titleEn: 'Internal Auditor', titleTh: 'ผู้ตรวจสอบภายใน', mfaEnabled: true } }),
    db.user.create({ data: { email: 'wijak.c@enterprise.co.th', name: 'Wijak Chaiyapong', nameTh: 'วิจักษณ์ ชัยยาพงษ์', role: 'EXECUTIVE', businessUnit: 'PLATFORM', titleEn: 'Chief Data Officer', titleTh: 'ผู้บริหารข้อมูลสูงสุด' } }),
    db.user.create({ data: { email: 'niran.l@enterprise.co.th', name: 'Niran Lertpaisan', nameTh: 'นิรันดร์ เลิศไพศาล', role: 'DATA_OWNER', businessUnit: 'FINANCE', titleEn: 'Finance Data Owner', titleTh: 'เจ้าของข้อมูลการเงิน' } }),
    db.user.create({ data: { email: 'malee.p@enterprise.co.th', name: 'Malee Pongsak', nameTh: 'มาลี พงษ์ศักดิ์', role: 'DATA_STEWARD', businessUnit: 'FINANCE', titleEn: 'Finance Data Steward', titleTh: 'ผู้ดูแลข้อมูลการเงิน' } }),
  ])
  const [admin, ownerCust, stewardCust, engineer, analyst, scientist, auditor, exec, ownerFin, stewardFin] = users

  console.log('Seeding sources & datasets…')
  const [srcPg, srcMssql, srcCsv, srcApi] = await Promise.all([
    db.dataSource.create({ data: { name: 'Customer Postgres (prod)', type: 'POSTGRESQL', health: 'HEALTHY', host: 'pg-prod-01.internal:5432', connectionRef: 'vault://kv/edqp/pg-prod-01-ro', lastSyncAt: ago(0, 1), latencyP95Ms: 84, successRate: 0.997, owner: 'Prasert Wongchai', description: 'Read-only replica for customer domain' } }),
    db.dataSource.create({ data: { name: 'Finance SQL Server', type: 'MSSQL', health: 'DEGRADED', host: 'mssql-fin-02.internal:1433', connectionRef: 'vault://kv/edqp/mssql-fin-ro', lastSyncAt: ago(0, 3), latencyP95Ms: 310, successRate: 0.972, owner: 'Prasert Wongchai', description: 'Read-only login; ledger extracts' } }),
    db.dataSource.create({ data: { name: 'Landing Zone (S3-compatible)', type: 'CSV', health: 'HEALTHY', host: 's3://edqp-landing', lastSyncAt: ago(0, 6), successRate: 0.999, owner: 'Prasert Wongchai', description: 'Secure upload landing zone, AV-scanned' } }),
    db.dataSource.create({ data: { name: 'Marketing Consents API', type: 'REST_API', health: 'HEALTHY', host: 'api.marketing.internal/v2', connectionRef: 'vault://kv/edqp/mkt-api', lastSyncAt: ago(0, 2), latencyP95Ms: 240, successRate: 0.991, owner: 'Prasert Wongchai', description: 'Consent platform REST endpoint (read-only)' } }),
  ])

  const dsCustomer = await db.dataset.create({ data: {
    name: 'Customer Master 360', nameTh: 'ข้อมูลหลักลูกค้า 360', description: 'Golden record of retail/SME customers: identity, contact, segment, credit limit.',
    domain: 'Customer', businessUnit: 'CUSTOMER', sourceId: srcPg.id, classification: 'CONFIDENTIAL', criticality: 'CRITICAL', isCde: true,
    version: 'v3.2.0', rowCount: 5000, columnCount: 11, piiFields: 4, slaHours: 24, ownerId: ownerCust.id, stewardId: stewardCust.id, lastRefreshAt: ago(0, 1),
  } })
  const dsGl = await db.dataset.create({ data: {
    name: 'General Ledger Transactions', nameTh: 'รายการบัญชีแยกประเภท', description: 'Daily journal entries for financial reporting (BCBS 239 critical data when profile enabled).',
    domain: 'Finance', businessUnit: 'FINANCE', sourceId: srcMssql.id, classification: 'RESTRICTED', criticality: 'CRITICAL', isCde: true,
    version: 'v2.1.4', rowCount: 4200, columnCount: 8, piiFields: 0, slaHours: 8, ownerId: ownerFin.id, stewardId: stewardFin.id, lastRefreshAt: ago(0, 3),
  } })
  const dsProduct = await db.dataset.create({ data: {
    name: 'Product Master', nameTh: 'ข้อมูลหลักสินค้า', description: 'Product catalogue with rates and lifecycle status, uploaded as CSV from product office.',
    domain: 'Product', businessUnit: 'CUSTOMER', sourceId: srcCsv.id, classification: 'INTERNAL', criticality: 'HIGH',
    version: 'v1.8.0', rowCount: 1200, columnCount: 6, piiFields: 0, slaHours: 72, ownerId: ownerCust.id, stewardId: stewardCust.id, lastRefreshAt: ago(1),
  } })
  const dsOrders = await db.dataset.create({ data: {
    name: 'Sales Orders', nameTh: 'คำสั่งขาย', description: 'Order headers across WEB, BRANCH and PARTNER channels.',
    domain: 'Sales', businessUnit: 'SALES', sourceId: srcPg.id, classification: 'INTERNAL', criticality: 'HIGH',
    version: 'v4.0.1', rowCount: 3800, columnCount: 7, piiFields: 0, slaHours: 24, ownerId: ownerFin.id, stewardId: stewardFin.id, lastRefreshAt: ago(0, 2),
  } })
  const dsConsents = await db.dataset.create({ data: {
    name: 'Marketing Consents', nameTh: 'ความยินยอมการตลาด', description: 'PDPA consent ledger per customer, channel and purpose.',
    domain: 'Marketing', businessUnit: 'MARKETING', sourceId: srcApi.id, classification: 'CONFIDENTIAL', criticality: 'HIGH', isCde: true,
    version: 'v1.3.2', rowCount: 2600, columnCount: 7, piiFields: 0, slaHours: 24, ownerId: ownerCust.id, stewardId: stewardCust.id, lastRefreshAt: ago(0, 2),
  } })
  const dsTickets = await db.dataset.create({ data: {
    name: 'Support Tickets', nameTh: 'ตั๋วบริการช่วยเหลือ', description: 'Service desk tickets with CSAT scores, CSV drop from CRM.',
    domain: 'Service', businessUnit: 'SERVICE', sourceId: srcCsv.id, classification: 'INTERNAL', criticality: 'MEDIUM',
    version: 'v2.0.0', rowCount: 1800, columnCount: 7, piiFields: 1, slaHours: 72, ownerId: ownerFin.id, stewardId: stewardFin.id, lastRefreshAt: ago(2),
  } })

  const col = (datasetId: string, name: string, dataType: string, opts: Partial<{ nullable: boolean; isPii: boolean; piiType: string; isCde: boolean; classification: string; description: string; position: number }> = {}) =>
    ({ datasetId, name, dataType, nullable: opts.nullable ?? true, isPii: opts.isPii ?? false, piiType: opts.piiType, isCde: opts.isCde ?? false, classification: opts.classification, description: opts.description, position: opts.position ?? 0 })

  await db.datasetColumn.createMany({ data: [
    col(dsCustomer.id, 'customer_id', 'identifier', { nullable: false, isCde: true, position: 1, description: 'Primary key' }),
    col(dsCustomer.id, 'full_name', 'string', { isPii: true, piiType: 'NAME', position: 2, classification: 'CONFIDENTIAL' }),
    col(dsCustomer.id, 'email', 'email', { isPii: true, piiType: 'EMAIL', isCde: true, position: 3, classification: 'CONFIDENTIAL' }),
    col(dsCustomer.id, 'phone', 'phone', { isPii: true, piiType: 'PHONE', position: 4, classification: 'CONFIDENTIAL' }),
    col(dsCustomer.id, 'national_id', 'string', { isPii: true, piiType: 'ID_CARD', position: 5, classification: 'RESTRICTED', isCde: true }),
    col(dsCustomer.id, 'date_of_birth', 'date', { position: 6 }),
    col(dsCustomer.id, 'registered_at', 'datetime', { position: 7 }),
    col(dsCustomer.id, 'segment', 'string', { position: 8, isCde: true }),
    col(dsCustomer.id, 'credit_limit', 'decimal', { position: 9 }),
    col(dsCustomer.id, 'province', 'string', { position: 10 }),
    col(dsCustomer.id, 'is_active', 'boolean', { position: 11 }),
  ] })
  await db.datasetColumn.createMany({ data: [
    col(dsGl.id, 'journal_id', 'identifier', { nullable: false, position: 1 }),
    col(dsGl.id, 'posting_date', 'date', { nullable: false, isCde: true, position: 2 }),
    col(dsGl.id, 'account_code', 'string', { isCde: true, position: 3 }),
    col(dsGl.id, 'description', 'string', { position: 4 }),
    col(dsGl.id, 'amount', 'decimal', { nullable: false, isCde: true, position: 5 }),
    col(dsGl.id, 'dc_indicator', 'string', { nullable: false, position: 6 }),
    col(dsGl.id, 'currency', 'string', { nullable: false, position: 7 }),
    col(dsGl.id, 'approved_by', 'string', { position: 8 }),
  ] })
  await db.datasetColumn.createMany({ data: [
    col(dsProduct.id, 'product_code', 'identifier', { nullable: false, position: 1 }),
    col(dsProduct.id, 'product_name', 'string', { position: 2 }),
    col(dsProduct.id, 'category', 'string', { nullable: false, position: 3 }),
    col(dsProduct.id, 'base_rate', 'decimal', { position: 4 }),
    col(dsProduct.id, 'status', 'string', { nullable: false, position: 5 }),
    col(dsProduct.id, 'launch_date', 'date', { position: 6 }),
  ] })
  await db.datasetColumn.createMany({ data: [
    col(dsOrders.id, 'order_id', 'identifier', { nullable: false, position: 1 }),
    col(dsOrders.id, 'customer_id', 'identifier', { isCde: true, position: 2 }),
    col(dsOrders.id, 'order_date', 'date', { nullable: false, position: 3 }),
    col(dsOrders.id, 'total_amount', 'decimal', { position: 4 }),
    col(dsOrders.id, 'currency', 'string', { nullable: false, position: 5 }),
    col(dsOrders.id, 'channel', 'string', { position: 6 }),
    col(dsOrders.id, 'status', 'string', { position: 7 }),
  ] })
  await db.datasetColumn.createMany({ data: [
    col(dsConsents.id, 'consent_id', 'identifier', { nullable: false, position: 1 }),
    col(dsConsents.id, 'customer_ref', 'identifier', { isCde: true, position: 2 }),
    col(dsConsents.id, 'channel', 'string', { position: 3 }),
    col(dsConsents.id, 'consent_flag', 'string', { isCde: true, position: 4 }),
    col(dsConsents.id, 'consent_date', 'date', { nullable: false, position: 5 }),
    col(dsConsents.id, 'expiry_date', 'date', { position: 6 }),
    col(dsConsents.id, 'purpose', 'string', { position: 7 }),
  ] })
  await db.datasetColumn.createMany({ data: [
    col(dsTickets.id, 'ticket_id', 'identifier', { nullable: false, position: 1 }),
    col(dsTickets.id, 'customer_id', 'identifier', { position: 2 }),
    col(dsTickets.id, 'opened_at', 'datetime', { nullable: false, position: 3 }),
    col(dsTickets.id, 'category', 'string', { position: 4 }),
    col(dsTickets.id, 'priority', 'string', { position: 5 }),
    col(dsTickets.id, 'status', 'string', { position: 6 }),
    col(dsTickets.id, 'csat_score', 'integer', { position: 7 }),
  ] })

  // Grants: analyst & scientist get selected datasets only (deny-by-default demo)
  await db.datasetPermission.createMany({ data: [
    { userId: analyst.id, datasetId: dsCustomer.id, level: 'VIEW', grantedBy: admin.id, reason: 'Sales analytics project 2025' },
    { userId: analyst.id, datasetId: dsOrders.id, level: 'VIEW', grantedBy: admin.id, reason: 'Sales analytics project 2025' },
    { userId: scientist.id, datasetId: dsCustomer.id, level: 'MANAGE', grantedBy: ownerCust.id, reason: 'ML anomaly model development' },
    { userId: scientist.id, datasetId: dsConsents.id, level: 'VIEW', grantedBy: ownerCust.id, reason: 'Drift monitoring' },
  ] })

  console.log('Seeding rules…')
  const mkRule = async (dataset: { id: string }, p: {
    code: string; name: string; nameTh: string; dimension: string; severity: string
    template: string; column?: string; operator?: string; parameters?: Record<string, unknown>; condition?: string
    isActive: boolean; requiresApproval?: boolean; owner: string
    versionStatus: string; createdBy?: string; approvedBy?: string | null; effectiveFrom?: Date | null; tags?: string
  }) => {
    const sumEn = summariseEn(p)
    const sumTh = summariseTh(p)
    const rule = await db.rule.create({ data: {
      code: p.code, datasetId: dataset.id, name: p.name, nameTh: p.nameTh, dimension: p.dimension,
      severity: p.severity, requiresApproval: p.requiresApproval ?? true, isActive: p.isActive,
      currentVersion: 1, owner: p.owner, templateKey: p.template, tags: p.tags,
    } })
    const v = await db.ruleVersion.create({ data: {
      ruleId: rule.id, version: 1,
      definition: { column: p.column, operator: p.operator, parameters: p.parameters, condition: p.condition, severity: p.severity } as object,
      naturalSummaryEn: sumEn, naturalSummaryTh: sumTh, status: p.versionStatus,
      createdBy: p.createdBy ?? p.owner, submittedBy: p.versionStatus === 'DRAFT' ? null : (p.createdBy ?? p.owner), submittedAt: p.versionStatus === 'DRAFT' ? null : ago(6),
      approvedBy: p.versionStatus === 'APPROVED' ? (p.approvedBy ?? null) : null,
      approvedAt: p.versionStatus === 'APPROVED' ? ago(5) : null,
      effectiveFrom: p.versionStatus === 'APPROVED' ? (p.effectiveFrom ?? ago(5)) : null,
    } })
    return { rule, v }
  }
  function summariseEn(p: { name: string; column?: string; template: string; parameters?: Record<string, unknown>; condition?: string; severity: string }): string {
    const cond = p.condition ? ` when ${p.condition}` : ''
    const tmpl: Record<string, string> = {
      NOT_NULL: `must not be null or empty`, REGEX: `must match pattern ${p.parameters?.pattern ?? ''}`,
      RANGE: `must be between ${p.parameters?.min} and ${p.parameters?.max}`,
      IN_SET: `must be one of {${(p.parameters?.values as string[] | undefined)?.join(', ')}}`,
      UNIQUE: `must be unique across all rows`, FRESHNESS: `must be no older than ${p.parameters?.maxHours} hours`,
      ROW_COUNT: `row count must stay within ${p.parameters?.minRows}–${p.parameters?.maxRows}`,
      CROSS_FIELD: `must satisfy ${p.parameters?.left} ${p.parameters?.op} ${p.parameters?.right ?? p.parameters?.rightValue}`,
      REFERENTIAL: `must exist in ${p.parameters?.dataset}.${p.parameters?.column}`,
      SCHEMA_MATCH: `must contain the expected columns`,
    }
    return `${p.column ?? 'Dataset'} ${tmpl[p.template] ?? p.name}${cond}; otherwise mark as ${p.severity}.`
  }
  function summariseTh(p: { name: string; column?: string; template: string; parameters?: Record<string, unknown>; condition?: string; severity: string }): string {
    const cond = p.condition ? ` เมื่อ ${p.condition}` : ''
    const tmpl: Record<string, string> = {
      NOT_NULL: `ต้องไม่เป็นค่าว่าง`, REGEX: `ต้องตรงตามรูปแบบ ${p.parameters?.pattern ?? ''}`,
      RANGE: `ต้องอยู่ระหว่าง ${p.parameters?.min} ถึง ${p.parameters?.max}`,
      IN_SET: `ต้องเป็นค่าใดค่าหนึ่งใน {${(p.parameters?.values as string[] | undefined)?.join(', ')}}`,
      UNIQUE: `ต้องไม่ซ้ำกันทุกแถว`, FRESHNESS: `ต้องมีอายุไม่เกิน ${p.parameters?.maxHours} ชั่วโมง`,
      ROW_COUNT: `จำนวนแถวต้องอยู่ในช่วง ${p.parameters?.minRows}–${p.parameters?.maxRows}`,
      CROSS_FIELD: `ต้องเป็นไปตามเงื่อนไข ${p.parameters?.left} ${p.parameters?.op} ${p.parameters?.right ?? p.parameters?.rightValue}`,
      REFERENTIAL: `ต้องมีอยู่ใน ${p.parameters?.dataset}.${p.parameters?.column}`,
      SCHEMA_MATCH: `ต้องมีคอลัมน์ตามที่กำหนด`,
    }
    return `${p.column ?? 'ชุดข้อมูล'} ${tmpl[p.template] ?? p.name}${cond}; มิฉะนั้นให้ทำเครื่องหมายความรุนแรง ${p.severity}`
  }

  const appr = 'Nattaya Suksumran' // data owner approvals
  const r: Record<string, string> = {}
  const ruleDefs: { key: string; ds: { id: string }; p: Parameters<typeof mkRule>[1] }[] = [
    { key: 'R-001', ds: dsCustomer, p: { code: 'R-001', name: 'Email completeness', nameTh: 'ความครบถ้วนของอีเมล', dimension: 'COMPLETENESS', severity: 'CRITICAL', template: 'NOT_NULL', column: 'email', isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr, tags: 'PDPA,CDE' } },
    { key: 'R-002', ds: dsCustomer, p: { code: 'R-002', name: 'National ID format', nameTh: 'รูปแบบเลขบัตรประชาชน', dimension: 'VALIDITY', severity: 'CRITICAL', template: 'REGEX', column: 'national_id', parameters: { pattern: '^\\d{13}$' }, isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr, tags: 'PDPA' } },
    { key: 'R-003', ds: dsCustomer, p: { code: 'R-003', name: 'Phone number format', nameTh: 'รูปแบบเบอร์โทรศัพท์', dimension: 'VALIDITY', severity: 'HIGH', template: 'REGEX', column: 'phone', parameters: { pattern: '^0\\d{9}$' }, isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr } },
    { key: 'R-004', ds: dsCustomer, p: { code: 'R-004', name: 'Customer ID uniqueness', nameTh: 'รหัสลูกค้าไม่ซ้ำ', dimension: 'UNIQUENESS', severity: 'CRITICAL', template: 'UNIQUE', column: 'customer_id', isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr, tags: 'CDE' } },
    { key: 'R-005', ds: dsCustomer, p: { code: 'R-005', name: 'Segment domain', nameTh: 'โดเมนกลุ่มลูกค้า', dimension: 'VALIDITY', severity: 'MEDIUM', template: 'IN_SET', column: 'segment', parameters: { values: ['RETAIL', 'SME', 'CORPORATE'] }, isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr } },
    { key: 'R-006', ds: dsCustomer, p: { code: 'R-006', name: 'Credit limit plausibility', nameTh: 'วงเงินสินเชื่อสมเหตุสมผล', dimension: 'CONSISTENCY', severity: 'HIGH', template: 'RANGE', column: 'credit_limit', parameters: { min: 0, max: 2000000 }, isActive: false, owner: 'Nattaya Suksumran', versionStatus: 'PENDING_APPROVAL', createdBy: 'Arree Kaewkla' } },
    { key: 'R-007', ds: dsCustomer, p: { code: 'R-007', name: 'Province completeness', nameTh: 'ความครบถ้วนของจังหวัด', dimension: 'COMPLETENESS', severity: 'MEDIUM', template: 'NOT_NULL', column: 'province', isActive: false, requiresApproval: false, owner: 'Nattaya Suksumran', versionStatus: 'DRAFT', createdBy: 'Arree Kaewkla' } },
    { key: 'R-008', ds: dsCustomer, p: { code: 'R-008', name: 'DOB before registration', nameTh: 'วันเกิดต้องมาก่อนวันสมัคร', dimension: 'ACCURACY', severity: 'MEDIUM', template: 'CROSS_FIELD', column: 'date_of_birth', parameters: { left: 'date_of_birth', op: '<', right: 'registered_at' }, isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr } },
    { key: 'R-009', ds: dsCustomer, p: { code: 'R-009', name: 'Registration freshness', nameTh: 'ความสดของข้อมูลสมัคร', dimension: 'TIMELINESS', severity: 'LOW', template: 'FRESHNESS', column: 'registered_at', parameters: { maxHours: 8760 }, isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr } },
    { key: 'R-011', ds: dsGl, p: { code: 'R-011', name: 'Account code completeness', nameTh: 'ความครบถ้วนของรหัสบัญชี', dimension: 'COMPLETENESS', severity: 'HIGH', template: 'NOT_NULL', column: 'account_code', isActive: true, owner: 'Niran Lertpaisan', versionStatus: 'APPROVED', approvedBy: 'Niran Lertpaisan' } },
    { key: 'R-012', ds: dsGl, p: { code: 'R-012', name: 'Amount non-negative', nameTh: 'มูลค่าไม่ติดลบ', dimension: 'VALIDITY', severity: 'CRITICAL', template: 'RANGE', column: 'amount', parameters: { min: 0, max: 10000000 }, isActive: true, owner: 'Niran Lertpaisan', versionStatus: 'APPROVED', approvedBy: 'Niran Lertpaisan' } },
    { key: 'R-013', ds: dsGl, p: { code: 'R-013', name: 'Ledger freshness 48h', nameTh: 'ความสดของบัญชี 48 ชม.', dimension: 'TIMELINESS', severity: 'CRITICAL', template: 'FRESHNESS', column: 'posting_date', parameters: { maxHours: 48 }, isActive: true, owner: 'Niran Lertpaisan', versionStatus: 'APPROVED', approvedBy: 'Niran Lertpaisan' } },
    { key: 'R-014', ds: dsGl, p: { code: 'R-014', name: 'Currency domain', nameTh: 'โดเมนสกุลเงิน', dimension: 'VALIDITY', severity: 'MEDIUM', template: 'IN_SET', column: 'currency', parameters: { values: ['THB', 'USD', 'EUR'] }, isActive: true, owner: 'Niran Lertpaisan', versionStatus: 'APPROVED', approvedBy: 'Niran Lertpaisan' } },
    { key: 'R-015', ds: dsGl, p: { code: 'R-015', name: 'Approver completeness', nameTh: 'ความครบถ้วนของผู้อนุมัติ', dimension: 'COMPLETENESS', severity: 'HIGH', template: 'NOT_NULL', column: 'approved_by', isActive: false, owner: 'Niran Lertpaisan', versionStatus: 'PENDING_APPROVAL', createdBy: 'Malee Pongsak' } },
    { key: 'R-021', ds: dsOrders, p: { code: 'R-021', name: 'Order volume envelope', nameTh: 'กรอบปริมาณคำสั่งขาย', dimension: 'VOLUME', severity: 'MEDIUM', template: 'ROW_COUNT', parameters: { minRows: 3000, maxRows: 5000 }, isActive: true, owner: 'Niran Lertpaisan', versionStatus: 'APPROVED', approvedBy: 'Niran Lertpaisan' } },
    { key: 'R-022', ds: dsOrders, p: { code: 'R-022', name: 'Customer reference integrity', nameTh: 'ความถูกต้องการอ้างอิงลูกค้า', dimension: 'INTEGRITY', severity: 'CRITICAL', template: 'REFERENTIAL', column: 'customer_id', parameters: { dataset: 'Customer Master 360', column: 'customer_id' }, isActive: true, owner: 'Niran Lertpaisan', versionStatus: 'APPROVED', approvedBy: 'Niran Lertpaisan', tags: 'CDE' } },
    { key: 'R-023', ds: dsOrders, p: { code: 'R-023', name: 'Order status domain', nameTh: 'โดเมนสถานะคำสั่งขาย', dimension: 'VALIDITY', severity: 'LOW', template: 'IN_SET', column: 'status', parameters: { values: ['COMPLETED', 'PENDING', 'CANCELLED'] }, isActive: true, owner: 'Niran Lertpaisan', versionStatus: 'APPROVED', approvedBy: 'Niran Lertpaisan' } },
    { key: 'R-031', ds: dsProduct, p: { code: 'R-031', name: 'Product name completeness', nameTh: 'ความครบถ้วนของชื่อสินค้า', dimension: 'COMPLETENESS', severity: 'HIGH', template: 'NOT_NULL', column: 'product_name', isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr } },
    { key: 'R-032', ds: dsProduct, p: { code: 'R-032', name: 'Category domain', nameTh: 'โดเมนหมวดสินค้า', dimension: 'VALIDITY', severity: 'MEDIUM', template: 'IN_SET', column: 'category', parameters: { values: ['DEPOSIT', 'LOAN', 'CARD', 'INSURANCE', 'WEALTH'] }, isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr } },
    { key: 'R-033', ds: dsProduct, p: { code: 'R-033', name: 'Base rate bounds', nameTh: 'ขอบเขตอัตราพื้นฐาน', dimension: 'VALIDITY', severity: 'MEDIUM', template: 'RANGE', column: 'base_rate', parameters: { min: 0, max: 15 }, isActive: false, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr } },
    { key: 'R-041', ds: dsConsents, p: { code: 'R-041', name: 'Consent flag completeness', nameTh: 'ความครบถ้วนของสถานะยินยอม', dimension: 'COMPLETENESS', severity: 'CRITICAL', template: 'NOT_NULL', column: 'consent_flag', isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr, tags: 'PDPA,CDE' } },
    { key: 'R-042', ds: dsConsents, p: { code: 'R-042', name: 'Consent record freshness', nameTh: 'ความสดของบันทึกความยินยอม', dimension: 'TIMELINESS', severity: 'MEDIUM', template: 'FRESHNESS', column: 'consent_date', parameters: { maxHours: 8760 }, isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr } },
    { key: 'R-043', ds: dsConsents, p: { code: 'R-043', name: 'Expiry after consent', nameTh: 'วันหมดอายุต้องหลังวันยินยอม', dimension: 'CONSISTENCY', severity: 'MEDIUM', template: 'CROSS_FIELD', column: 'expiry_date', parameters: { left: 'expiry_date', op: '>', right: 'consent_date' }, isActive: true, owner: 'Nattaya Suksumran', versionStatus: 'APPROVED', approvedBy: appr } },
    { key: 'R-051', ds: dsTickets, p: { code: 'R-051', name: 'Customer reference completeness', nameTh: 'ความครบถ้วนการอ้างอิงลูกค้า', dimension: 'COMPLETENESS', severity: 'HIGH', template: 'NOT_NULL', column: 'customer_id', isActive: true, owner: 'Niran Lertpaisan', versionStatus: 'APPROVED', approvedBy: 'Niran Lertpaisan' } },
    { key: 'R-052', ds: dsTickets, p: { code: 'R-052', name: 'CSAT bounds', nameTh: 'ขอบเขตคะแนน CSAT', dimension: 'ACCURACY', severity: 'LOW', template: 'RANGE', column: 'csat_score', parameters: { min: 1, max: 5 }, isActive: true, owner: 'Niran Lertpaisan', versionStatus: 'APPROVED', approvedBy: 'Niran Lertpaisan' } },
  ]
  for (const def of ruleDefs) {
    const created = await mkRule(def.ds, def.p)
    r[def.key] = created.rule.id
  }

  console.log('Seeding ML models…')
  const m1 = await db.mLModel.create({ data: {
    name: 'customer-numerical-iforest', algorithm: 'IsolationForest', version: 'v1.2.0', stage: 'PROMOTED', isActive: true,
    trainedAt: ago(21), trainingRows: 4800, scopeDatasetId: dsCustomer.id, createdBy: 'Thanapon Thirakanok',
    metrics: { precision: 0.91, recall: 0.84, f1: 0.87, rocAuc: 0.93 } as object,
    params: { nTrees: 100, sampleSize: 256, contamination: 0.03, scoreThreshold: 0.75 } as object,
    featureImportance: [{ feature: 'credit_limit', weight: 0.62 }, { feature: 'segment', weight: 0.14 }, { feature: 'phone_valid', weight: 0.13 }, { feature: 'age', weight: 0.11 }] as object,
  } })
  await db.mLModel.create({ data: {
    name: 'customer-numerical-lof', algorithm: 'LocalOutlierFactor', version: 'v0.3.0', stage: 'SHADOW', isActive: false, shadowOfId: m1.id,
    trainedAt: ago(9), trainingRows: 4800, scopeDatasetId: dsCustomer.id, createdBy: 'Thanapon Thirakanok',
    metrics: { precision: 0.88, recall: 0.86, f1: 0.87, rocAuc: 0.91 } as object,
    params: { nNeighbors: 20, contamination: 0.03 } as object,
    featureImportance: [{ feature: 'credit_limit', weight: 0.58 }, { feature: 'segment', weight: 0.2 }, { feature: 'age', weight: 0.22 }] as object,
  } })
  await db.mLModel.create({ data: {
    name: 'record-linkage-dupes', algorithm: 'DuplicateLinkage', version: 'v2.1.0', stage: 'PROMOTED', isActive: true,
    trainedAt: ago(40), trainingRows: 0, scopeDatasetId: dsCustomer.id, createdBy: 'Thanapon Thirakanok',
    metrics: { precision: 0.94, recall: 0.81, f1: 0.87 } as object,
    params: { fields: ['full_name', 'email'], weights: [0.6, 0.4], threshold: 0.9, blocking: 'email' } as object,
    featureImportance: [{ feature: 'full_name_jw', weight: 0.6 }, { feature: 'email_exact', weight: 0.4 }] as object,
  } })
  await db.mLModel.create({ data: {
    name: 'consent-drift-monitor', algorithm: 'DriftMonitor', version: 'v1.0.0', stage: 'PROMOTED', isActive: true,
    trainedAt: ago(35), trainingRows: 2600, scopeDatasetId: dsConsents.id, createdBy: 'Thanapon Thirakanok',
    metrics: { precision: 0.9, recall: 0.88, f1: 0.89 } as object,
    params: { method: 'PSI', psiThreshold: 0.2, windowDays: 30 } as object,
    featureImportance: [{ feature: 'consent_flag', weight: 0.7 }, { feature: 'channel', weight: 0.3 }] as object,
  } })
  await db.mLModel.create({ data: {
    name: 'customer-numerical-iforest', algorithm: 'IsolationForest', version: 'v2.0.0', stage: 'REGISTERED', isActive: false,
    trainedAt: ago(2), trainingRows: 4950, scopeDatasetId: dsCustomer.id, createdBy: 'Thanapon Thirakanok',
    metrics: { precision: 0.94, recall: 0.89, f1: 0.91, rocAuc: 0.96 } as object,
    params: { nTrees: 150, sampleSize: 256, contamination: 0.02, scoreThreshold: 0.72 } as object,
    featureImportance: [{ feature: 'credit_limit', weight: 0.66 }, { feature: 'segment', weight: 0.12 }, { feature: 'phone_valid', weight: 0.12 }, { feature: 'age', weight: 0.1 }] as object,
  } })

  console.log('Running real validation pipeline for current runs…')
  // Run real validation via the jobs runner for each dataset
  const { enqueue, kickWorker } = await import('../src/lib/jobs/runner')
  const datasets = [dsCustomer, dsGl, dsProduct, dsOrders, dsConsents, dsTickets]
  for (const d of datasets) {
    await enqueue('VALIDATION', { idempotencyKey: `seed-val-${d.id}`, payload: { datasetId: d.id, trigger: 'MANUAL', executedBy: 'System Seed', correlationId: `seed-run-${d.id}` }, maxAttempts: 2 })
    await enqueue('PROFILING', { idempotencyKey: `seed-prof-${d.id}`, payload: { datasetId: d.id } })
  }
  // Real ML anomaly scan (Isolation Forest + record linkage + PSI) on the CDE dataset
  const cm = await db.dataset.findFirst({ where: { name: 'Customer Master 360' } })
  if (cm) {
    const model = await db.mLModel.findFirst({ where: { algorithm: 'IsolationForest', stage: 'PROMOTED' } })
    await enqueue('ANOMALY_SCAN', { idempotencyKey: `seed-anom-${cm.id}`, payload: { datasetId: cm.id, modelId: model?.id }, maxAttempts: 2, timeoutMs: 240_000 })
  }
  kickWorker()
  await waitFor(async () => (await db.job.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } })) === 0, 300_000)

  console.log('Backfilling 30-day history…')
  const rand = rng(42)
  const todayRun = await db.validationRun.findFirst({ where: { datasetId: dsCustomer.id, correlationId: 'seed-run-' + dsCustomer.id } })
  const baseScore = todayRun?.qualityScore ?? 88
  const periodDays: Record<string, number> = { [dsCustomer.id]: 1, [dsGl.id]: 1, [dsOrders.id]: 3, [dsProduct.id]: 5, [dsConsents.id]: 3, [dsTickets.id]: 7 }
  for (const d of datasets) {
    const every = periodDays[d.id]
    for (let i = 30; i >= 1; i -= every) {
      if (i < every) break
      const jitter = (rand() - 0.35) * 4
      const trend = -(i * 0.45) // improving over time
      const score = Math.max(55, Math.min(99, baseScore + trend + jitter))
      const failed = Math.max(0, Math.round((100 - score) / 8))
      const started = ago(i, 6)
      await db.validationRun.create({ data: {
        datasetId: d.id, datasetVersion: d.version, ruleSetVersion: `rs-${started.toISOString().slice(0, 10)}`,
        trigger: 'SCHEDULED', status: 'SUCCEEDED', startedAt: started, completedAt: new Date(started.getTime() + 45000 + Math.floor(rand() * 30000)),
        durationMs: 45000 + Math.floor(rand() * 30000), rowsEvaluated: d.rowCount,
        rulesTotal: 0, rulesPassed: 0, rulesFailed: failed,
        qualityScore: Number(score.toFixed(1)), coverage: 0.8 + rand() * 0.2,
        executedBy: 'scheduler', correlationId: `seed-hist-${d.id}-${i}`, attempt: 1,
        dimensionResults: {} as object,
      } })
    }
  }

  console.log('Seeding anomalies…')
  await db.anomaly.create({ data: {
    datasetId: dsGl.id, datasetVersion: dsGl.version, type: 'SCHEMA_DRIFT', severity: 'HIGH', score: 0.85,
    rawStat: 'TYPE_CHANGED', columnName: 'posting_date',
    explanationEn: 'Schema drift: posting_date changed varchar(10) → datetime2 in Finance SQL Server on latest sync. Downstream reports expect the old type.',
    explanationTh: 'Schema เปลี่ยนแปลง: posting_date เปลี่ยนจาก varchar(10) เป็น datetime2 ใน SQL Server การเงิน รายงานปลายทางคาดหวังชนิดเดิม',
    contributingFeatures: [{ feature: 'posting_date', contribution: 1 }] as object, detectedAt: ago(1, 4),
  } })
  await db.anomaly.create({ data: {
    datasetId: dsConsents.id, datasetVersion: dsConsents.version, type: 'DATA_DRIFT', severity: 'HIGH', score: 0.56,
    rawStat: 'PSI=0.28 (threshold 0.2)', columnName: 'consent_flag',
    explanationEn: 'Categorical distribution shift on consent_flag (GRANTED share fell 68% → 51%, PSI 0.28). Verify with Marketing before assuming data defect.',
    explanationTh: 'การกระจายของ consent_flag เปลี่ยนแปลง (สัดส่วน GRANTED ลดจาก 68% เป็น 51%, PSI 0.28) ควรยืนยันกับฝ่ายการตลาดก่อนสรุปว่าข้อมูลผิดพลาด',
    contributingFeatures: [{ feature: 'consent_flag', contribution: 0.82 }, { feature: 'channel', contribution: 0.18 }] as object,
    detectedAt: ago(2, 2),
  } })
  await db.anomaly.create({ data: {
    datasetId: dsOrders.id, datasetVersion: dsOrders.version, type: 'VOLUME_SHIFT', severity: 'MEDIUM', score: 0.48,
    rawStat: 'rows=2,910 vs 7-day mean 3,780 (-23%)', columnName: 'order_id',
    explanationEn: 'Row volume fell 23% below the 7-day envelope. Could be an upstream feed delay, not a data defect. Check source health first.',
    explanationTh: 'ปริมาณแถวลดลง 23% ต่ำกว่ากรอบ 7 วัน อาจเกิดจากฟีดต้นทางล่าช้า ไม่ใช่ข้อมูลผิดพลาด ควรตรวจสุขภาพแหล่งข้อมูลก่อน',
    contributingFeatures: [{ feature: 'row_count', contribution: 1 }] as object, detectedAt: ago(0, 5),
  } })

  console.log('Seeding issues…')
  const mkIssue = (p: { key: string; datasetId: string; title: string; titleTh: string; description: string; severity: string; status: string; sourceType: string; sourceRef?: string; dimension: string; slaDueAt: Date; slaBreached?: boolean; reportedBy: string; assignee?: string; openedAt: Date; resolvedAt?: Date; resolutionNote?: string }) =>
    db.issue.create({ data: { ...p, slaBreached: p.slaBreached ?? false } })
  const i1 = await mkIssue({ key: 'DQ-1001', datasetId: dsGl.id, title: 'Negative amounts in GL journals', titleTh: 'พบมูลค่าติดลบในรายการบัญชี', description: 'Rule R-012 flagged 7 journals with negative amounts on debit side. Blocking regulatory report submission.', severity: 'CRITICAL', status: 'OPEN', sourceType: 'RULE', sourceRef: r['R-012'], dimension: 'VALIDITY', slaDueAt: ago(2, 20), slaBreached: true, reportedBy: 'Malee Pongsak', assignee: 'Niran Lertpaisan', openedAt: ago(3) })
  const i2 = await mkIssue({ key: 'DQ-1002', datasetId: dsCustomer.id, title: 'Missing emails block onboarding campaign', titleTh: 'อีเมล missing กระทบแคมเปญ', description: 'R-001: ~200 customers missing email values; onboarding campaign suppressed.', severity: 'HIGH', status: 'IN_PROGRESS', sourceType: 'RULE', sourceRef: r['R-001'], dimension: 'COMPLETENESS', slaDueAt: new Date(Date.now() + 1 * day), reportedBy: 'Arree Kaewkla', assignee: 'Arree Kaewkla', openedAt: ago(2) })
  const i3 = await mkIssue({ key: 'DQ-1003', datasetId: dsCustomer.id, title: 'Duplicate customer clusters need review', titleTh: 'ต้องตรวจสอบกลุ่มลูกค้าซ้ำ', description: 'Record linkage found near-duplicate clusters (score ≥ 0.9). Human review pending before merge proposal.', severity: 'HIGH', status: 'OPEN', sourceType: 'ML', dimension: 'UNIQUENESS', slaDueAt: new Date(Date.now() + 2 * day), reportedBy: 'Thanapon Thirakanok', assignee: 'Arree Kaewkla', openedAt: ago(1) })
  await mkIssue({ key: 'DQ-1004', datasetId: dsCustomer.id, title: 'Invalid national ID formats', titleTh: 'รูปแบบเลขบัตรประชาชนไม่ถูกต้อง', description: 'R-002: 2% of national_id values fail 13-digit check.', severity: 'CRITICAL', status: 'IN_PROGRESS', sourceType: 'RULE', sourceRef: r['R-002'], dimension: 'VALIDITY', slaDueAt: ago(0, 6), reportedBy: 'Arree Kaewkla', assignee: 'Arree Kaewkla', openedAt: ago(1) })
  await mkIssue({ key: 'DQ-1005', datasetId: dsConsents.id, title: 'Consent flag drift confirmed as upstream change', titleTh: 'ยืนยัน drift ของ consent flag จากระบบต้นทาง', description: 'PSI 0.28 on consent_flag traced to Marketing platform migration; legitimate change, evidence archived.', severity: 'MEDIUM', status: 'RESOLVED', sourceType: 'ML', dimension: 'CONSISTENCY', slaDueAt: ago(0, 12), reportedBy: 'Thanapon Thirakanok', assignee: 'Nattaya Suksumran', openedAt: ago(2), resolvedAt: ago(0, 4), resolutionNote: 'Confirmed legitimate business change with Marketing owner; monitoring continues.' })
  await mkIssue({ key: 'DQ-1006', datasetId: dsTickets.id, title: 'CSAT scores outside 1–5 bounds', titleTh: 'คะแนน CSAT เกินขอบเขต', description: 'R-052: a CSV drop contained csat_score=0 rows from a survey tool bug.', severity: 'LOW', status: 'OPEN', sourceType: 'RULE', sourceRef: r['R-052'], dimension: 'ACCURACY', slaDueAt: new Date(Date.now() + 5 * day), reportedBy: 'Malee Pongsak', assignee: 'Prasert Wongchai', openedAt: ago(4) })
  await mkIssue({ key: 'DQ-1007', datasetId: dsGl.id, title: 'Schema drift on posting_date', titleTh: 'Schema drift ที่ posting_date', description: 'Source type changed without change ticket. Report ETL adapted; schema contract update pending owner sign-off.', severity: 'HIGH', status: 'PENDING_REVIEW', sourceType: 'SCHEMA_DRIFT', dimension: 'SCHEMA_CONFORMITY', slaDueAt: new Date(Date.now() + 1 * day), reportedBy: 'Prasert Wongchai', assignee: 'Niran Lertpaisan', openedAt: ago(1) })
  await mkIssue({ key: 'DQ-1008', datasetId: dsProduct.id, title: 'Product names missing in CSV drop', titleTh: 'ชื่อสินค้าหายในไฟล์ CSV', description: 'R-031 flagged 24 rows. Product office re-uploaded corrected file.', severity: 'HIGH', status: 'RESOLVED', sourceType: 'RULE', sourceRef: r['R-031'], dimension: 'COMPLETENESS', slaDueAt: ago(1), reportedBy: 'Arree Kaewkla', assignee: 'Arree Kaewkla', openedAt: ago(6), resolvedAt: ago(4), resolutionNote: 'Corrected file uploaded and validation now passes.' })
  await db.issueComment.createMany({ data: [
    { issueId: i1.id, author: 'Niran Lertpaisan', body: 'Confirmed 7 journals posted with wrong DC indicator. Finance ops will reverse and repost tomorrow.', createdAt: ago(2, 12) },
    { issueId: i1.id, author: 'Supaporn Ruangdet', body: 'Audit evidence requested: journal IDs and approval trail attached to validation run.', createdAt: ago(2, 6) },
    { issueId: i2.id, author: 'Arree Kaewkla', body: 'Root cause: source form made email optional in June. Fix scheduled in CRM release 4.7.', createdAt: ago(1, 8) },
  ] })

  console.log('Seeding policy, audit, notifications…')
  const policy: [string, unknown, string, string][] = [
    ['score.weights', { COMPLETENESS: 0.2, ACCURACY: 0.1, VALIDITY: 0.15, CONSISTENCY: 0.1, UNIQUENESS: 0.15, TIMELINESS: 0.1, INTEGRITY: 0.05, VOLUME: 0.05, SCHEMA_CONFORMITY: 0.1 }, 'Dimension weights of the quality score formula', 'น้ำหนักแต่ละมิติในสูตรคะแนนคุณภาพ'],
    ['score.coverageFloor', 0.6, 'Minimum CDE rule coverage before score cap applies', 'ความครอบคลุม CDE ขั้นต่ำก่อนมีการจำกัดคะแนน'],
    ['score.criticalWeight', 2.0, 'Weight multiplier applied to failed CRITICAL rules', 'ตัวคูณน้ำหนักของกฎ CRITICAL ที่ไม่ผ่าน'],
    ['anomaly.scoreThreshold', 0.75, 'Isolation Forest score threshold to raise an anomaly', 'เกณฑ์คะแนน Isolation Forest ในการแจ้งความผิดปกติ'],
    ['duplicate.similarityThreshold', 0.9, 'Jaro-Winkler pair score threshold for duplicate clusters', 'เกณฑ์คะแนนความคล้ายสำหรับกลุ่มข้อมูลซ้ำ'],
    ['drift.psiThreshold', 0.2, 'PSI threshold for drift alerts', 'เกณฑ์ PSI สำหรับแจ้งเตือน drift'],
    ['sla.hoursBySeverity', { CRITICAL: 4, HIGH: 24, MEDIUM: 72, LOW: 168 }, 'Issue SLA hours by severity', 'SLA ของปัญหาตามระดับความรุนแรง (ชั่วโมง)'],
    ['upload.maxSizeMB', 20, 'Maximum upload size in megabytes', 'ขนาดไฟล์อัปโหลดสูงสุด (MB)'],
    ['upload.allowedExtensions', ['.csv', '.xlsx'], 'Upload extension allowlist', 'รายการนามสกุลไฟล์ที่อนุญาต'],
    ['upload.retentionDays', 90, 'Uploaded file retention before purge (PDPA-aware)', 'ระยะเก็บรักษาไฟล์ก่อนลบ (ตามแนวทาง PDPA)'],
    ['ml.shadowDurationDays', 14, 'Minimum shadow period before promotion review', 'ระยะเวลา Shadow ขั้นต่ำก่อนพิจารณา promote'],
    ['masking.defaultMode', 'FULL', 'Default PII masking mode in UI, logs and exports', 'โหมดปิดบัง PII เริ่มต้นใน UI และ log'],
  ]
  for (const [key, value, de, dt] of policy) {
    await db.policySetting.create({ data: { key, value: value as object, updatedBy: 'Somchai Prasertkit', descriptionEn: de, descriptionTh: dt } })
  }

  const auditEvents: { actor: string; actorRole: string; action: string; resourceType: string; resourceId: string; datasetId?: string; detail: Record<string, unknown>; createdAt: Date }[] = [
    { actor: 'Somchai Prasertkit', actorRole: 'SYSTEM_ADMIN', action: 'POLICY_UPDATE', resourceType: 'PolicySetting', resourceId: 'upload.maxSizeMB', detail: { from: 50, to: 20 }, createdAt: ago(10) },
    { actor: 'Arree Kaewkla', actorRole: 'DATA_STEWARD', action: 'RULE_CREATE', resourceType: 'Rule', resourceId: 'R-007', datasetId: dsCustomer.id, detail: { template: 'NOT_NULL', column: 'province' }, createdAt: ago(9) },
    { actor: 'Arree Kaewkla', actorRole: 'DATA_STEWARD', action: 'RULE_SUBMIT', resourceType: 'RuleVersion', resourceId: 'R-006#2', datasetId: dsCustomer.id, detail: { version: 2 }, createdAt: ago(6) },
    { actor: 'Nattaya Suksumran', actorRole: 'DATA_OWNER', action: 'RULE_APPROVE', resourceType: 'RuleVersion', resourceId: 'R-001#1', datasetId: dsCustomer.id, detail: { version: 1, note: 'Evidence reviewed' }, createdAt: ago(5) },
    { actor: 'Nattaya Suksumran', actorRole: 'DATA_OWNER', action: 'RULE_ACTIVATE', resourceType: 'Rule', resourceId: 'R-002', datasetId: dsCustomer.id, detail: { version: 1 }, createdAt: ago(5) },
    { actor: 'scheduler', actorRole: 'SYSTEM', action: 'VALIDATION_RUN', resourceType: 'ValidationRun', resourceId: 'seed-hist-1', datasetId: dsCustomer.id, detail: { trigger: 'SCHEDULED' }, createdAt: ago(4) },
    { actor: 'Kanya Meechai', actorRole: 'DATA_ANALYST', action: 'EXPORT', resourceType: 'Report', resourceId: 'rep-dq-weekly', datasetId: dsCustomer.id, detail: { type: 'dataset_summary', classification: 'CONFIDENTIAL', masking: 'FULL' }, createdAt: ago(3) },
    { actor: 'Prasert Wongchai', actorRole: 'DATA_ENGINEER', action: 'FILE_REJECT', resourceType: 'FileUpload', resourceId: 'upl-9f31', detail: { reason: 'EXECUTABLE_SIGNATURE', audit: true }, createdAt: ago(3, 4) },
    { actor: 'Thanapon Thirakanok', actorRole: 'DATA_SCIENTIST', action: 'MODEL_SHADOW', resourceType: 'MLModel', resourceId: 'customer-numerical-lof#v0.3.0', detail: { shadowOf: 'customer-numerical-iforest#v1.2.0' }, createdAt: ago(2, 9) },
    { actor: 'Thanapon Thirakanok', actorRole: 'DATA_SCIENTIST', action: 'ANOMALY_REVIEW', resourceType: 'Anomaly', resourceId: 'anm-consent-drift', datasetId: dsConsents.id, detail: { reviewStatus: 'CONFIRMED_ISSUE' }, createdAt: ago(2, 2) },
    { actor: 'Somchai Prasertkit', actorRole: 'SYSTEM_ADMIN', action: 'GRANT_CHANGE', resourceType: 'DatasetPermission', resourceId: 'kanya→Customer Master 360', datasetId: dsCustomer.id, detail: { level: 'VIEW' }, createdAt: ago(2) },
    { actor: 'Supaporn Ruangdet', actorRole: 'AUDITOR', action: 'DATA_PREVIEW', resourceType: 'Dataset', resourceId: dsGl.id, detail: { masked: true, purpose: 'Audit sample inspection' }, createdAt: ago(1, 6) },
    { actor: 'Niran Lertpaisan', actorRole: 'DATA_OWNER', action: 'ISSUE_UPDATE', resourceType: 'Issue', resourceId: 'DQ-1001', datasetId: dsGl.id, detail: { status: 'OPEN', note: 'Ops reversal scheduled' }, createdAt: ago(1, 2) },
    { actor: 'Wijak Chaiyapong', actorRole: 'EXECUTIVE', action: 'EXPORT', resourceType: 'Report', resourceId: 'rep-exec-scorecard', detail: { type: 'executive_scorecard', classification: 'INTERNAL', masking: 'FULL' }, createdAt: ago(0, 8) },
    { actor: 'Somchai Prasertkit', actorRole: 'SYSTEM_ADMIN', action: 'USER_ROLE_CHANGE', resourceType: 'User', resourceId: 'malee.p', detail: { from: 'DATA_ANALYST', to: 'DATA_STEWARD' }, createdAt: ago(0, 7) },
  ]
  for (const e of auditEvents) await db.auditLog.create({ data: { ...e, detail: e.detail as object, ip: '10.20.30.44', correlationId: 'corr-' + Math.random().toString(36).slice(2, 12) } })

  await db.notification.createMany({ data: [
    { userId: stewardCust.id, titleEn: 'R-006 v2 awaiting your action', titleTh: 'R-006 v2 รอการดำเนินการของคุณ', bodyEn: 'Credit limit plausibility v2 was submitted for approval. Test evidence is attached.', bodyTh: 'กฎ Credit limit plausibility v2 ถูกส่งเพื่อขออนุมัติ พร้อมหลักฐานการทดสอบ', severity: 'HIGH', link: '/#/rules', createdAt: ago(6) },
    { userId: ownerCust.id, titleEn: '2 rules awaiting your approval', titleTh: 'มี 2 กฎรอการอนุมัติจากคุณ', bodyEn: 'R-006 v2 and R-015 v2 are pending Data Owner approval.', bodyTh: 'R-006 v2 และ R-015 v2 รอการอนุมัติจากเจ้าของข้อมูล', severity: 'HIGH', link: '/#/rules', createdAt: ago(5) },
    { userId: stewardFin.id, titleEn: 'DQ-1001 breached SLA', titleTh: 'DQ-1001 เกิน SLA', bodyEn: 'Critical issue DQ-1001 exceeded its 4-hour SLA. Executive dashboard now shows the breach.', bodyTh: 'ปัญหาระดับวิกฤต DQ-1001 เกิน SLA 4 ชั่วโมงแล้ว แดชบอร์ดผู้บริหารแสดงการละเมิดนี้', severity: 'CRITICAL', link: '/#/issues', createdAt: ago(2, 20) },
    { userId: scientist.id, titleEn: 'Shadow model ready for review', titleTh: 'โมเดล Shadow พร้อมทบทวน', bodyEn: 'customer-numerical-lof v0.3.0 has completed its shadow period. Compare with champion before promotion.', bodyTh: 'customer-numerical-lof v0.3.0 ครบระยะ shadow แล้ว เปรียบเทียบกับ champion ก่อน promote', severity: 'MEDIUM', link: '/#/ml-models', createdAt: ago(1) },
    { userId: engineer.id, titleEn: 'Schema drift on Finance SQL Server', titleTh: 'พบ schema drift บน Finance SQL Server', bodyEn: 'posting_date type changed. Engineering dashboard lists the affected dataset.', bodyTh: 'ชนิดข้อมูล posting_date เปลี่ยน แดชบอร์ดวิศวกรรมระบุชุดข้อมูลที่ได้รับผลกระทบ', severity: 'HIGH', link: '/#/dashboard-engineering', createdAt: ago(1, 4) },
  ] })

  console.log('Seed complete ✔')
  await db.$disconnect()
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('Timed out waiting for jobs')
}

main().catch((e) => { console.error(e); process.exit(1) })
