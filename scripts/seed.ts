/**
 * Seed script — ข้อมูลตัวอย่างสำหรับ RBAC Console
 * รัน: bun scripts/seed.ts
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

async function main() {
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

  console.log('Seed complete:', {
    users: await db.user.count(),
    datasets: await db.dataset.count(),
    grants: await db.datasetAccess.count(),
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
