/**
 * Seed script — ข้อมูลตัวอย่างสำหรับ RBAC Console + Core Features Console
 * รัน: bun scripts/seed.ts
 * (ข้อมูลทั้งหมดเป็น sandbox — การรันจะรีเซ็ตกลับค่าเริ่มต้น)
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const USERS = [
  { email: 'somchai.owner@company.co.th', name: 'สมชาย วิชาการดี', role: 'DATA_OWNER', status: 'ACTIVE' },
  { email: 'malee.steward@company.co.th', name: 'มาลี รักษาข้อมูล', role: 'DATA_STEWARD', status: 'ACTIVE' },
  { email: 'anucha.analyst@company.co.th', name: 'อนุชา วิเคราะห์ดี', role: 'DQ_ANALYST', status: 'ACTIVE' },
  { email: 'preecha.engineer@company.co.th', name: 'ปรีชา วิศวกรรม', role: 'DATA_ENGINEER', status: 'ACTIVE' },
  { email: 'kanya.compliance@company.co.th', name: 'กัญญา กำกับดูแล', role: 'COMPLIANCE_OFFICER', status: 'ACTIVE' },
  { email: 'business@company.co.th', name: 'ผู้ใช้งานธุรกิจ', role: 'BUSINESS_USER', status: 'ACTIVE' },
  { email: 'ceo@company.co.th', name: 'ผู้บริหารใหญ่', role: 'EXECUTIVE', status: 'ACTIVE' },
  { email: 'sys.admin@company.co.th', name: 'ผู้ดูแลระบบ', role: 'SYS_ADMIN', status: 'ACTIVE' },
  { email: 'nikorn.sales@company.co.th', name: 'นิกร ขายดี', role: 'BUSINESS_USER', status: 'SUSPENDED' },
  { email: 'tip.steward2@company.co.th', name: 'ทิพย์ ดูแลดี', role: 'DATA_STEWARD', status: 'ACTIVE' },
]

const DATASETS = [
  { name: 'ลูกค้าองค์กร — Master', sourceType: 'POSTGRESQL', piiEnabled: true },
  { name: 'รายการธุรกรรมรายวัน', sourceType: 'MSSQL', piiEnabled: true },
  { name: 'แคตตาล็อกสินค้า', sourceType: 'CSV', piiEnabled: false },
  { name: 'คำร้องเรียนลูกค้า', sourceType: 'EXCEL', piiEnabled: true },
  { name: 'อัตราแลกเปลี่ยน (API)', sourceType: 'REST_API', piiEnabled: false },
  { name: 'ข้อมูลพนักงาน HR', sourceType: 'CSV', piiEnabled: true },
]

const GRANTS: Array<{ dataset: string; roles: Array<[string, string]> }> = [
  {
    dataset: 'ลูกค้าองค์กร — Master',
    roles: [
      ['DATA_OWNER', 'MANAGE'],
      ['DATA_STEWARD', 'MANAGE'],
      ['DQ_ANALYST', 'VIEW'],
      ['DATA_ENGINEER', 'MANAGE'],
      ['COMPLIANCE_OFFICER', 'VIEW'],
      ['SYS_ADMIN', 'MANAGE'],
    ],
  },
  {
    dataset: 'รายการธุรกรรมรายวัน',
    roles: [
      ['DATA_OWNER', 'MANAGE'],
      ['DQ_ANALYST', 'VIEW'],
      ['DATA_ENGINEER', 'MANAGE'],
      ['BUSINESS_USER', 'VIEW'],
      ['EXECUTIVE', 'VIEW'],
      ['SYS_ADMIN', 'MANAGE'],
    ],
  },
  {
    dataset: 'แคตตาล็อกสินค้า',
    roles: [
      ['DATA_STEWARD', 'MANAGE'],
      ['BUSINESS_USER', 'VIEW'],
      ['EXECUTIVE', 'VIEW'],
      ['SYS_ADMIN', 'MANAGE'],
    ],
  },
  {
    dataset: 'คำร้องเรียนลูกค้า',
    roles: [
      ['DATA_OWNER', 'MANAGE'],
      ['DQ_ANALYST', 'VIEW'],
      ['COMPLIANCE_OFFICER', 'VIEW'],
      ['SYS_ADMIN', 'MANAGE'],
    ],
  },
  {
    dataset: 'อัตราแลกเปลี่ยน (API)',
    roles: [
      ['DATA_ENGINEER', 'MANAGE'],
      ['BUSINESS_USER', 'VIEW'],
      ['EXECUTIVE', 'VIEW'],
      ['SYS_ADMIN', 'MANAGE'],
    ],
  },
  {
    dataset: 'ข้อมูลพนักงาน HR',
    roles: [
      ['DATA_OWNER', 'MANAGE'],
      ['COMPLIANCE_OFFICER', 'VIEW'],
      ['SYS_ADMIN', 'MANAGE'],
    ],
  },
]

/* ------------------- sandbox rows (มีข้อผิดพลาดแฝงจงใจ) ------------------- */

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

const CUSTOMER_ROWS: Record<string, unknown>[] = [
  { customer_id: 'C-1001', full_name: 'สมศรี ใจดี', email: 'somsri@acme.co.th', phone: '0812345678', segment: 'ENTERPRISE', credit_limit: 850000, updated_at: daysAgo(1) },
  { customer_id: 'C-1002', full_name: 'สมชาย ทรงพล', email: 'somchai.p@acme.co.th', phone: '0823456789', segment: 'SME', credit_limit: 420000, updated_at: daysAgo(2) },
  { customer_id: 'C-1003', full_name: 'มานะ มานพ', email: 'manana@acme.co.th', phone: '0834567890', segment: 'SME', credit_limit: 350000, updated_at: daysAgo(3) },
  { customer_id: 'C-1004', full_name: 'สุนีย์ ทองแท้', email: 'sunee#acme.co.th', phone: '0845678901', segment: 'ENTERPRISE', credit_limit: 980000, updated_at: daysAgo(1) },
  { customer_id: 'C-1005', full_name: 'ปิยะ ประเสริฐ', email: '', phone: '0856789012', segment: 'SME', credit_limit: 210000, updated_at: daysAgo(5) },
  { customer_id: 'C-1006', full_name: 'กมล กิตติ', email: 'kamol@acme.co.th', phone: '0867890123', segment: 'RETAIL', credit_limit: 120000, updated_at: daysAgo(2) },
  { customer_id: 'C-1007', full_name: 'อรุณ แสงดาว', email: 'arun@acme.co.th', phone: '0878901234', segment: 'RETAIL', credit_limit: 90000, updated_at: daysAgo(130) },
  { customer_id: 'C-1008', full_name: 'วิภา วัฒนา', email: 'wipa@', phone: '0889012345', segment: 'SME', credit_limit: 300000, updated_at: daysAgo(4) },
  { customer_id: 'C-1009', full_name: 'ธนา ธำรง', email: 'thana@acme.co.th', phone: '0-890123456', segment: 'ENTERPRISE', credit_limit: 760000, updated_at: daysAgo(6) },
  { customer_id: 'C-1010', full_name: 'จิรายุ รุ่งเรือง', email: 'jirayu@acme.co.th', phone: '0912345678', segment: 'SME', credit_limit: 280000, updated_at: daysAgo(3) },
  { customer_id: 'C-1011', full_name: 'สุขุม สุขสันต์', email: 'sukhum@acme.co.th', phone: '0923456789', segment: 'RETAIL', credit_limit: 150000, updated_at: daysAgo(1) },
  { customer_id: 'C-1012', full_name: 'พรทิพย์ พัฒนา', email: 'porntip@acme.co.th', phone: '0934567890', segment: 'SME', credit_limit: 410000, updated_at: daysAgo(2) },
  { customer_id: 'C-1013', full_name: 'อดิศร อดุลย์', email: 'adisorn@acme.co.th', phone: '0945678901', segment: 'ENTERPRISE', credit_limit: -50000, updated_at: daysAgo(8) },
  { customer_id: 'C-1014', full_name: 'มัลลิกา มีสุข', email: 'mallika@acme.co.th', phone: '0956789012', segment: 'RETAIL', credit_limit: 80000, updated_at: daysAgo(9) },
  { customer_id: 'C-1015', full_name: 'ณัฐ นิยมดี', email: 'nat@acme.co.th', phone: '0967890123', segment: 'SME', credit_limit: 260000, updated_at: daysAgo(140) },
  { customer_id: 'C-1016', full_name: 'รัตนา รุ่งโรจน์', email: 'rattana@acme.co.th', phone: '0978901234', segment: 'RETAIL', credit_limit: 110000, updated_at: daysAgo(7) },
  { customer_id: 'C-1017', full_name: 'กิตติ กำจัดดี', email: 'kitti@acme.co.th', phone: '0989012345', segment: 'SME', credit_limit: 330000, updated_at: daysAgo(1) },
  { customer_id: 'C-1018', full_name: 'สมศรี ใจดี', email: 'somsri.d@acme.co.th', phone: '', segment: 'SME', credit_limit: 190000, updated_at: daysAgo(2) },
  { customer_id: 'C-1019', full_name: 'ประเสริฐ ปราณี', email: 'prasert@acme.co.th', phone: '0812345678', segment: 'ENTERPRISE', credit_limit: 640000, updated_at: daysAgo(3) },
  { customer_id: 'C-1020', full_name: 'ทรงพล ทวีผล', email: 'somchai.p@acme.co.th', phone: '0823456789', segment: 'SME', credit_limit: 9999999, updated_at: daysAgo(4) },
]

const TXN_ROWS: Record<string, unknown>[] = [
  { txn_id: 'T-90001', account_no: 'ACC-77001', amount: 15000.5, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(1) },
  { txn_id: 'T-90002', account_no: 'ACC-77002', amount: 32000, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(1) },
  { txn_id: 'T-90003', account_no: 'ACC-77003', amount: 8500, currency: 'USD', status: 'PENDING', txn_date: daysAgo(2) },
  { txn_id: 'T-90004', account_no: 'ACC-77004', amount: -1200, currency: 'THB', status: 'FAILED', txn_date: daysAgo(2) },
  { txn_id: 'T-90005', account_no: 'ACC-77005', amount: 45900, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(3) },
  { txn_id: 'T-90006', account_no: 'ACC-77006', amount: 7750.25, currency: 'EUR', status: 'COMPLETED', txn_date: daysAgo(3) },
  { txn_id: 'T-90007', account_no: 'ACC-77007', amount: 250000, currency: 'THB', status: 'DONE', txn_date: daysAgo(4) },
  { txn_id: 'T-90008', account_no: 'ACC-77008', amount: 19800, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(45) },
  { txn_id: 'T-90009', account_no: 'ACC-77009', amount: 5400, currency: 'THB', status: 'PENDING', txn_date: daysAgo(5) },
  { txn_id: 'T-90010', account_no: 'ACC-77010', amount: 66000, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(60) },
  { txn_id: 'T-90011', account_no: 'ACC-77011', amount: 12300, currency: 'JPY', status: 'COMPLETED', txn_date: daysAgo(6) },
  { txn_id: 'T-90012', account_no: 'ACC-77012', amount: 28800, currency: 'THB', status: 'FAILED', txn_date: daysAgo(6) },
  { txn_id: 'T-90013', account_no: 'ACC-77013', amount: 9999, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(7) },
  { txn_id: 'T-90014', account_no: 'ACC-77014', amount: 17500, currency: 'USD', status: 'PENDING', txn_date: daysAgo(7) },
  { txn_id: 'T-90015', account_no: 'ACC-77015', amount: -450, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(8) },
  { txn_id: 'T-90016', account_no: 'ACC-77016', amount: 30500, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(8) },
  { txn_id: 'T-90017', account_no: 'ACC-77017', amount: 8800, currency: 'THB', status: 'CANCELLED', txn_date: daysAgo(9) },
  { txn_id: 'T-90018', account_no: 'ACC-77018', amount: 42300, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(9) },
  { txn_id: 'T-90019', account_no: 'ACC-77019', amount: 5100, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(10) },
  { txn_id: 'T-90001', account_no: 'ACC-77020', amount: 7100, currency: 'THB', status: 'COMPLETED', txn_date: daysAgo(10) },
]

/* --------------------------- กฎเริ่มต้น 7 ข้อ ----------------------------- */

const RULES: Array<{
  dataset: string
  column: string
  condition: string
  parameters: string
  severity: string
}> = [
  { dataset: 'ลูกค้าองค์กร — Master', column: 'customer_id', condition: 'NOT_NULL', parameters: '{}', severity: 'CRITICAL' },
  { dataset: 'ลูกค้าองค์กร — Master', column: 'email', condition: 'EMAIL', parameters: '{}', severity: 'HIGH' },
  { dataset: 'ลูกค้าองค์กร — Master', column: 'credit_limit', condition: 'RANGE', parameters: '{"min":0,"max":1000000}', severity: 'HIGH' },
  { dataset: 'ลูกค้าองค์กร — Master', column: 'phone', condition: 'REGEX', parameters: '{"pattern":"^0\\\\d{9}$"}', severity: 'MEDIUM' },
  { dataset: 'รายการธุรกรรมรายวัน', column: 'txn_id', condition: 'UNIQUE', parameters: '{}', severity: 'HIGH' },
  { dataset: 'รายการธุรกรรมรายวัน', column: 'currency', condition: 'IN_LIST', parameters: '{"values":"THB, USD, EUR"}', severity: 'MEDIUM' },
  { dataset: 'รายการธุรกรรมรายวัน', column: 'txn_date', condition: 'MAX_AGE_DAYS', parameters: '{"days":30}', severity: 'LOW' },
]

async function main() {
  await db.dqSignal.deleteMany()
  await db.dqRun.deleteMany()
  await db.dqRule.deleteMany()
  await db.dqException.deleteMany()
  await db.sampleRow.deleteMany()
  await db.auditLog.deleteMany()
  await db.datasetAccess.deleteMany()
  await db.dataset.deleteMany()
  await db.user.deleteMany()

  for (const u of USERS) {
    await db.user.create({ data: u })
  }

  const datasetMap = new Map<string, string>()
  for (const d of DATASETS) {
    const created = await db.dataset.create({ data: d })
    datasetMap.set(d.name, created.id)
  }

  for (const g of GRANTS) {
    const datasetId = datasetMap.get(g.dataset)
    if (!datasetId) continue
    for (const [roleId, level] of g.roles) {
      await db.datasetAccess.create({ data: { datasetId, roleId, level } })
    }
  }

  // ข้อมูลตัวอย่าง sandbox (มีข้อผิดพลาดแฝงเพื่อให้กฎจับได้จริง)
  for (const [name, rows] of [
    ['ลูกค้าองค์กร — Master', CUSTOMER_ROWS],
    ['รายการธุรกรรมรายวัน', TXN_ROWS],
  ] as const) {
    const datasetId = datasetMap.get(name)
    if (!datasetId) continue
    for (const row of rows) {
      await db.sampleRow.create({ data: { datasetId, payload: JSON.stringify(row) } })
    }
  }

  // กฎเริ่มต้น 7 ข้อ
  for (const r of RULES) {
    const datasetId = datasetMap.get(r.dataset)
    if (!datasetId) continue
    await db.dqRule.create({
      data: {
        datasetId,
        column: r.column,
        condition: r.condition,
        parameters: r.parameters,
        severity: r.severity,
        enabled: true,
      },
    })
  }

  // สัญญาณ AI รอทบทวนตั้งแต่แรก (ต้องมีมนุษย์ตัดสินใจเสมอ)
  const custId = datasetMap.get('ลูกค้าองค์กร — Master')!
  const txnId = datasetMap.get('รายการธุรกรรมรายวัน')!
  await db.dqSignal.create({
    data: {
      datasetId: custId,
      kind: 'ML_ANOMALY',
      dimension: 'ACCURACY',
      title: 'ค่าผิดปกติ (outlier) ในคอลัมน์ credit_limit',
      detail:
        'โมเดลตรวจพบค่า credit_limit 9,999,999 (แถว #20) ห่างจากกรอบ IQR อย่างมีนัยสำคัญ — โปรดทบทวนก่อนดำเนินการ (สัญญาณ AI ไม่ได้แก้ไขข้อมูล)',
      severity: 'MEDIUM',
      status: 'PENDING_REVIEW',
    },
  })
  await db.dqSignal.create({
    data: {
      datasetId: txnId,
      kind: 'ML_ANOMALY',
      dimension: 'VOLUME',
      title: 'ปริมาณธุรกรรมต่ำกว่าค่าเฉลี่ยรายวัน',
      detail:
        'จำนวนระเบียนวันนี้ต่ำกว่าค่าเฉลี่ย 7 วันที่ผ่านมา 38% — อาจมีข้อมูลหายระหว่างนำเข้า (สัญญาณ AI — รอมนุษย์ทบทวน)',
      severity: 'LOW',
      status: 'PENDING_REVIEW',
    },
  })

  // คำขอข้อยกเว้น: 1 รออนุมัติ + 1 อนุมัติแล้ว (พร้อมวันหมดอายุ)
  await db.dqException.create({
    data: {
      datasetId: custId,
      reason: 'ลูกค้ารายใหม่จาก partner feed ยังไม่มีอีเมล — ขอยกเว้นกฎ email ระหว่างรอข้อมูลเพิ่มจากพาร์ทเนอร์',
      requestedBy: 'malee.steward@company.co.th',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 14 * 86_400_000),
    },
  })
  await db.dqException.create({
    data: {
      datasetId: txnId,
      reason: 'ธุรกรรมย้อนหลังจาก migration — ขอยกเว้นกฎ txn_date ไม่เกิน 30 วัน จนกว่า migration เสร็จ',
      requestedBy: 'preecha.engineer@company.co.th',
      status: 'APPROVED',
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
      decidedBy: 'somchai.owner@company.co.th',
      decidedAt: new Date(Date.now() - 2 * 86_400_000),
    },
  })

  await db.auditLog.create({
    data: {
      action: 'CREATE_USER',
      actor: 'system@seed',
      target: `${USERS.length} users`,
      detail: 'Seed เริ่มต้นระบบ: สร้างบัญชีผู้ใช้ตัวอย่าง 10 บัญชี',
    },
  })
  await db.auditLog.create({
    data: {
      action: 'GRANT_ACCESS',
      actor: 'system@seed',
      target: `${DATASETS.length} datasets`,
      detail: 'Seed เริ่มต้นระบบ: กำหนดสิทธิ์เข้าถึงชุดข้อมูลตามบทบาท',
    },
  })
  await db.auditLog.create({
    data: {
      action: 'CREATE_RULE',
      actor: 'system@seed',
      target: `${RULES.length} rules`,
      detail: 'Seed เริ่มต้นระบบ: สร้างกฎคุณภาพข้อมูลเริ่มต้น 7 ข้อ + ข้อมูลตัวอย่าง sandbox',
    },
  })

  console.log('Seed complete:', {
    users: await db.user.count(),
    datasets: await db.dataset.count(),
    grants: await db.datasetAccess.count(),
    sampleRows: await db.sampleRow.count(),
    rules: await db.dqRule.count(),
    signals: await db.dqSignal.count(),
    exceptions: await db.dqException.count(),
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
