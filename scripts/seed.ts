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
  { name: 'ทะเบียนบัญชีธนาคาร', sourceType: 'POSTGRESQL', piiEnabled: false },
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
  {
    dataset: 'ทะเบียนบัญชีธนาคาร',
    roles: [
      ['DATA_OWNER', 'MANAGE'],
      ['DQ_ANALYST', 'VIEW'],
      ['DATA_ENGINEER', 'MANAGE'],
      ['BUSINESS_USER', 'VIEW'],
      ['EXECUTIVE', 'VIEW'],
      ['SYS_ADMIN', 'MANAGE'],
    ],
  },
]

/* ------------------- sandbox rows (มีข้อผิดพลาดแฝงจงใจ) ------------------- */

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString()
}

// ทะเบียนบัญชีธนาคาร — ชุดข้อมูลอ้างอิง (ทะเบียนหลัก) สำหรับเอนจิน EXISTS_IN_DATASET (INTEGRITY)
// จงใจไม่มี ACC-77019 และ ACC-77020 เพื่อให้กฎ INTEGRITY ของธุรกรรมจับข้อมูลไม่เชื่อมโยงได้จริง
const ACCOUNT_ROWS: Record<string, unknown>[] = Array.from({ length: 18 }, (_, i) => ({
  account_no: `ACC-77${String(i + 1).padStart(3, '0')}`,
  account_name: `บัญชีกระแสรายวันหมายเลข ${i + 1}`,
  status: i === 17 ? 'CLOSED' : 'ACTIVE',
  opened_at: daysAgo(400 - i * 10),
}))

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

/* ------------------- คลังเงื่อนไขส่วนกลาง (must) ------------------------- */

const CONDITION_TEMPLATES: Array<{
  key: string
  name: string
  nameEn?: string
  sentence: string
  dimension: string
  engineType: string
  params?: string
  isSystem: boolean
}> = [
  // เงื่อนไขมาตรฐานของระบบ 7 แบบ (ลบ/แก้ไม่ได้)
  { key: 'NOT_NULL', name: 'ไม่มีค่าว่าง', nameEn: 'Not empty', sentence: 'not be empty', dimension: 'COMPLETENESS', engineType: 'NOT_NULL', params: '[]', isSystem: true },
  { key: 'EMAIL', name: 'รูปแบบอีเมลถูกต้อง', nameEn: 'Valid email', sentence: 'be a valid email address', dimension: 'VALIDITY', engineType: 'EMAIL', params: '[]', isSystem: true },
  {
    key: 'REGEX',
    name: 'ตรงตามรูปแบบที่กำหนด',
    nameEn: 'Matches pattern',
    sentence: 'match the pattern',
    dimension: 'VALIDITY',
    engineType: 'REGEX',
    params: '[{"key":"pattern","label":"รูปแบบ (Regular Expression)","type":"text","placeholder":"^0[0-9]{9}$"}]',
    isSystem: true,
  },
  {
    key: 'RANGE',
    name: 'อยู่ในช่วงตัวเลขที่กำหนด',
    nameEn: 'Within range',
    sentence: 'be within the range',
    dimension: 'REASONABLENESS',
    engineType: 'RANGE',
    params: '[{"key":"min","label":"ค่าต่ำสุด","type":"number"},{"key":"max","label":"ค่าสูงสุด","type":"number"}]',
    isSystem: true,
  },
  {
    key: 'IN_LIST',
    name: 'อยู่ในรายการค่าที่อนุญาต',
    nameEn: 'In allowed list',
    sentence: 'be one of the allowed values',
    dimension: 'CONSISTENCY',
    engineType: 'IN_LIST',
    params: '[{"key":"values","label":"ค่าที่อนุญาต (คั่นด้วยเครื่องหมาย ,)","type":"text","placeholder":"ACTIVE, INACTIVE"}]',
    isSystem: true,
  },
  { key: 'UNIQUE', name: 'ไม่ซ้ำกันในชุดข้อมูล', nameEn: 'Unique', sentence: 'be unique across the dataset', dimension: 'UNIQUENESS', engineType: 'UNIQUE', params: '[]', isSystem: true },
  {
    key: 'MAX_AGE_DAYS',
    name: 'ข้อมูลไม่เก่าเกินกี่วัน',
    nameEn: 'Max age in days',
    sentence: 'not be older than',
    dimension: 'CURRENTNESS',
    engineType: 'MAX_AGE_DAYS',
    params: '[{"key":"days","label":"จำนวนวันที่ยอมรับได้","type":"number","placeholder":"7"}]',
    isSystem: true,
  },
  // เอนจินมาตรฐานเพิ่มเติม — ให้ทุกมิติ DAMA-DMBOK มีเอนจินของตัวเอง (ACCURACY / TIMELINESS / INTEGRITY)
  {
    key: 'REFERENCE_MATCH',
    name: 'ตรงกับค่ามาตรฐานจากระบบต้นทาง',
    nameEn: 'Matches reference values',
    sentence: 'match the reference value from the trusted source system',
    dimension: 'ACCURACY',
    engineType: 'REFERENCE_MATCH',
    params: '[{"key":"values","label":"ค่ามาตรฐานจากระบบต้นทาง (คั่นด้วยเครื่องหมาย ,)","type":"text","placeholder":"ENTERPRISE, SME, RETAIL"}]',
    isSystem: true,
  },
  {
    key: 'MAX_AGE_HOURS',
    name: 'ข้อมูลไม่เก่าเกินกี่ชั่วโมง',
    nameEn: 'Max age in hours',
    sentence: 'not be older than',
    dimension: 'TIMELINESS',
    engineType: 'MAX_AGE_HOURS',
    params: '[{"key":"hours","label":"จำนวนชั่วโมงที่ยอมรับได้ (ตาม SLA)","type":"number","placeholder":"72"}]',
    isSystem: true,
  },
  {
    key: 'EXISTS_IN_DATASET',
    name: 'มีอยู่จริงในชุดข้อมูลอ้างอิง',
    nameEn: 'Exists in reference dataset',
    sentence: 'exist in the reference dataset column',
    dimension: 'INTEGRITY',
    engineType: 'EXISTS_IN_DATASET',
    params: '[{"key":"refDatasetId","label":"ชุดข้อมูลอ้างอิง (ทะเบียนหลัก)","type":"dataset"},{"key":"refColumn","label":"คอลัมน์ในชุดข้อมูลอ้างอิง","type":"dataset-column"}]',
    isSystem: true,
  },
  // ตัวอย่างเงื่อนไขส่วนกลางที่ผู้ใช้สร้าง — ใช้ร่วมกันทั้งระบบได้
  {
    key: 'CUSTOM_TH_PHONE',
    name: 'หมายเลขโทรศัพท์ไทย 10 หลัก',
    nameEn: 'Thai mobile number',
    sentence: 'match the Thai mobile number pattern (10 digits, starting with 0)',
    dimension: 'VALIDITY',
    engineType: 'REGEX',
    params: '[{"key":"pattern","label":"รูปแบบ (Regular Expression)","type":"text","placeholder":"^0\\\\d{9}$"}]',
    isSystem: false,
  },
  {
    key: 'CUSTOM_NON_NEGATIVE',
    name: 'จำนวนไม่ติดลบ',
    nameEn: 'Non-negative number',
    sentence: 'be a non-negative number within the allowed range',
    dimension: 'REASONABLENESS',
    engineType: 'RANGE',
    params: '[{"key":"min","label":"ค่าต่ำสุด","type":"number","placeholder":"0"},{"key":"max","label":"ค่าสูงสุด","type":"number"}]',
    isSystem: false,
  },
  {
    key: 'CUSTOM_SUPPORTED_CURRENCY',
    name: 'สกุลเงินที่ระบบรองรับ',
    nameEn: 'Supported currency',
    sentence: 'be one of the currencies supported by the treasury system',
    dimension: 'CONSISTENCY',
    engineType: 'IN_LIST',
    params: '[{"key":"values","label":"ค่าที่อนุญาต (คั่นด้วยเครื่องหมาย ,)","type":"text","placeholder":"THB, USD, EUR"}]',
    isSystem: false,
  },
  {
    key: 'CUSTOM_FRESH_DATA',
    name: 'ข้อมูลสด (ไม่เก่าเกิน 7 วัน)',
    nameEn: 'Fresh data (7 days)',
    sentence: 'not be older than the freshness window',
    dimension: 'CURRENTNESS',
    engineType: 'MAX_AGE_DAYS',
    params: '[{"key":"days","label":"จำนวนวันที่ยอมรับได้","type":"number","placeholder":"7"}]',
    isSystem: false,
  },
  // ตัวอย่างเพิ่มเติมให้คลุมครบทั้ง 9 มิติ DAMA-DMBOK — Accuracy / Integrity / Timeliness
  {
    key: 'CUSTOM_SEGMENT_STD',
    name: 'รหัสกลุ่มลูกค้าตามมาตรฐาน CRM',
    nameEn: 'Standard customer segment',
    sentence: 'match the standard customer segment defined by the CRM system',
    dimension: 'ACCURACY',
    engineType: 'REFERENCE_MATCH',
    params: '[{"key":"values","label":"ค่ามาตรฐานจากระบบต้นทาง (คั่นด้วยเครื่องหมาย ,)","type":"text","placeholder":"ENTERPRISE, SME, RETAIL"}]',
    isSystem: false,
  },
  {
    key: 'CUSTOM_BRANCH_REF',
    name: 'รหัสสาขาตรงตามทะเบียนสาขาหลัก',
    nameEn: 'Registered branch code',
    sentence: 'be a branch code that exists in the master branch registry',
    dimension: 'INTEGRITY',
    engineType: 'IN_LIST',
    params: '[{"key":"values","label":"รหัสสาขาที่มีอยู่จริง (คั่นด้วยเครื่องหมาย ,)","type":"text","placeholder":"BKK, CNX, PKT, HKT, KKC"}]',
    isSystem: false,
  },
  {
    key: 'CUSTOM_DAILY_REFRESH',
    name: 'อัปเดตตามรอบรายวัน (ไม่เกิน 1 วัน)',
    nameEn: 'Daily refresh (1 day)',
    sentence: 'not be older than the daily refresh window',
    dimension: 'TIMELINESS',
    engineType: 'MAX_AGE_DAYS',
    params: '[{"key":"days","label":"จำนวนวันที่ยอมรับได้","type":"number","placeholder":"1"}]',
    isSystem: false,
  },
]

/* ------------------- กฎเริ่มต้น (ใช้ร่วมหลายชุดข้อมูลได้) ------------------- */

const RULES: Array<{
  datasets: string[]
  column: string
  condition: string
  parameters: string
  severity: string
}> = [
  { datasets: ['ลูกค้าองค์กร — Master'], column: 'customer_id', condition: 'NOT_NULL', parameters: '{}', severity: 'CRITICAL' },
  { datasets: ['ลูกค้าองค์กร — Master'], column: 'email', condition: 'EMAIL', parameters: '{}', severity: 'HIGH' },
  { datasets: ['ลูกค้าองค์กร — Master'], column: 'credit_limit', condition: 'RANGE', parameters: '{"min":0,"max":1000000}', severity: 'HIGH' },
  // กฎที่ใช้ร่วม 2 ชุดข้อมูล — ใช้เงื่อนไขส่วนกลาง CUSTOM_TH_PHONE
  {
    datasets: ['ลูกค้าองค์กร — Master', 'ข้อมูลพนักงาน HR'],
    column: 'phone',
    condition: 'CUSTOM_TH_PHONE',
    parameters: '{"pattern":"^0\\\\d{9}$"}',
    severity: 'MEDIUM',
  },
  { datasets: ['รายการธุรกรรมรายวัน'], column: 'txn_id', condition: 'UNIQUE', parameters: '{}', severity: 'HIGH' },
  {
    datasets: ['รายการธุรกรรมรายวัน'],
    column: 'currency',
    condition: 'CUSTOM_SUPPORTED_CURRENCY',
    parameters: '{"values":"THB, USD, EUR"}',
    severity: 'MEDIUM',
  },
  { datasets: ['รายการธุรกรรมรายวัน'], column: 'txn_date', condition: 'MAX_AGE_DAYS', parameters: '{"days":30}', severity: 'LOW' },
  { datasets: ['รายการธุรกรรมรายวัน'], column: 'amount', condition: 'CUSTOM_NON_NEGATIVE', parameters: '{"min":0,"max":1000000}', severity: 'HIGH' },
  // กฎมิติ Accuracy — รหัสกลุ่มลูกค้าต้องตรงกับค่ามาตรฐานจาก CRM (เอนจิน REFERENCE_MATCH)
  {
    datasets: ['ลูกค้าองค์กร — Master'],
    column: 'segment',
    condition: 'CUSTOM_SEGMENT_STD',
    parameters: '{"values":"ENTERPRISE, SME, RETAIL"}',
    severity: 'MEDIUM',
  },
  // กฎมิติ Timeliness — ธุรกรรมต้องทันตาม SLA 72 ชั่วโมง (เอนจิน MAX_AGE_HOURS)
  {
    datasets: ['รายการธุรกรรมรายวัน'],
    column: 'txn_date',
    condition: 'MAX_AGE_HOURS',
    parameters: '{"hours":72}',
    severity: 'MEDIUM',
  },
  // กฎมิติ Integrity — เลขบัญชีต้องมีอยู่จริงในทะเบียนบัญชี (เอนจิน EXISTS_IN_DATASET)
  // refDatasetId จะถูกแทนที่ด้วย id จริงของชุดข้อมูล "ทะเบียนบัญชีธนาคาร" ตอน seed
  {
    datasets: ['รายการธุรกรรมรายวัน'],
    column: 'account_no',
    condition: 'EXISTS_IN_DATASET',
    parameters: '{"refDatasetId":"__ACCOUNT_REGISTRY__","refColumn":"account_no"}',
    severity: 'HIGH',
  },
]

async function main() {
  await db.dqRun.deleteMany()
  await db.ruleDataset.deleteMany()
  await db.dqRule.deleteMany()
  await db.conditionTemplate.deleteMany()
  await db.dqSignal.deleteMany()
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
    ['ทะเบียนบัญชีธนาคาร', ACCOUNT_ROWS],
  ] as const) {
    const datasetId = datasetMap.get(name)
    if (!datasetId) continue
    for (const row of rows) {
      await db.sampleRow.create({ data: { datasetId, payload: JSON.stringify(row) } })
    }
  }

  // คลังเงื่อนไขส่วนกลาง (ของระบบ + ตัวอย่างที่ผู้ใช้สร้าง)
  for (const t of CONDITION_TEMPLATES) {
    await db.conditionTemplate.create({
      data: {
        key: t.key,
        name: t.name,
        nameEn: t.nameEn ?? '',
        sentence: t.sentence,
        dimension: t.dimension,
        engineType: t.engineType,
        params: t.params ?? '[]',
        isSystem: t.isSystem,
        enabled: true,
        createdBy: t.isSystem ? null : 'anucha.analyst@company.co.th',
      },
    })
  }

  // กฎเริ่มต้น — เชื่อมกับหลายชุดข้อมูลผ่าน RuleDataset (many-to-many)
  for (const r of RULES) {
    const datasetIds = r.datasets.map((name) => datasetMap.get(name)).filter((id): id is string => Boolean(id))
    if (datasetIds.length === 0) continue
    // แทน placeholder ของกฎ INTEGRITY ด้วย id จริงของชุดข้อมูลทะเบียนบัญชีธนาคาร
    const parameters = r.parameters.includes('__ACCOUNT_REGISTRY__')
      ? r.parameters.replaceAll('"__ACCOUNT_REGISTRY__"', JSON.stringify(datasetMap.get('ทะเบียนบัญชีธนาคาร') ?? ''))
      : r.parameters
    await db.dqRule.create({
      data: {
        column: r.column,
        condition: r.condition,
        parameters,
        severity: r.severity,
        enabled: true,
        datasets: { create: datasetIds.map((datasetId) => ({ datasetId })) },
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
      dimension: 'REASONABLENESS',
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
      dimension: 'COMPLETENESS',
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
      action: 'CREATE_CONDITION',
      actor: 'system@seed',
      target: `${CONDITION_TEMPLATES.length} conditions`,
      detail: 'Seed เริ่มต้นระบบ: ตั้งค่าคลังเงื่อนไขส่วนกลาง (เงื่อนไขมาตรฐาน 10 รายการครอบคลุมเอนจินครบ 9 มิติ DAMA-DMBOK + ตัวอย่างที่ผู้ใช้สร้าง 7 รายการ)',
    },
  })
  await db.auditLog.create({
    data: {
      action: 'CREATE_RULE',
      actor: 'system@seed',
      target: `${RULES.length} rules`,
      detail: 'Seed เริ่มต้นระบบ: สร้างกฎคุณภาพข้อมูลเริ่มต้น 11 ข้อ (ครอบคลุมเอนจินใหม่ REFERENCE_MATCH / MAX_AGE_HOURS / EXISTS_IN_DATASET + มีกฎที่ใช้ร่วมหลายชุดข้อมูล) + ข้อมูลตัวอย่าง sandbox',
    },
  })

  console.log('Seed complete:', {
    users: await db.user.count(),
    datasets: await db.dataset.count(),
    grants: await db.datasetAccess.count(),
    sampleRows: await db.sampleRow.count(),
    conditionTemplates: await db.conditionTemplate.count(),
    rules: await db.dqRule.count(),
    ruleDatasetLinks: await db.ruleDataset.count(),
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
