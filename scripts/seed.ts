/**
 * Seed script — ข้อมูลตัวอย่างสำหรับ RBAC Console + Core Features Console
 * รัน: bun scripts/seed.ts
 * (ข้อมูลทั้งหมดเป็น sandbox — การรันจะรีเซ็ตกลับค่าเริ่มต้น)
 */
import { PrismaClient } from '@prisma/client'
import { evaluateRule, DIMENSION_LABELS, type DimensionKey, type Row } from '../src/lib/dq'
import { inferColumnType } from '../src/lib/asset'

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
  { name: 'ลูกค้าองค์กร — Master', sourceType: 'POSTGRESQL', piiEnabled: true, classification: 'CUSTOMER_PERSONAL' },
  { name: 'รายการธุรกรรมรายวัน', sourceType: 'MSSQL', piiEnabled: true, classification: 'AML_KYC' },
  { name: 'แคตตาล็อกสินค้า', sourceType: 'CSV', piiEnabled: false, classification: 'DATA_GOVERNANCE' },
  { name: 'คำร้องเรียนลูกค้า', sourceType: 'EXCEL', piiEnabled: true, classification: 'CUSTOMER_PERSONAL' },
  { name: 'อัตราแลกเปลี่ยน (API)', sourceType: 'REST_API', piiEnabled: false, classification: 'FINANCIAL_REPORTING' },
  { name: 'ข้อมูลพนักงาน HR', sourceType: 'CSV', piiEnabled: true, classification: 'UNCLASSIFIED' },
  { name: 'ทะเบียนบัญชีธนาคาร', sourceType: 'POSTGRESQL', piiEnabled: false, classification: 'CARD_PAYMENT' },
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

/* ------------------- ประวัติผลการรันตรวจ (แดชบอร์ดใช้แสดงผลจริง) ------------------- */

const RUN_BATCHES: Array<{ daysAgo: number; label: string }> = [
  { daysAgo: 6, label: 'รอบตรวจย้อนหลัง 6 วัน' },
  { daysAgo: 2, label: 'รอบตรวจย้อนหลัง 2 วัน' },
  { daysAgo: 0, label: 'รอบตรวจล่าสุด' },
]

async function main() {
  await db.dqRun.deleteMany()
  await db.dataAssetRecord.deleteMany()
  await db.dataAssetColumn.deleteMany()
  await db.dataAsset.deleteMany()
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

  // ---------- ประวัติผลการรันตรวจ 3 รอบ (6 วันก่อน / 2 วันก่อน / ล่าสุด) ----------
  // ใช้เอนจินประเมินผลจริงของระบบ (lib/dq.ts) — แดชบอร์ดจึงมีข้อมูลสถิติและความเสี่ยงตั้งแต่เปิดหน้าแรก
  const seededRules = await db.dqRule.findMany({ include: { datasets: true } })
  const seededTemplates = await db.conditionTemplate.findMany()
  const tplMap = new Map(seededTemplates.map((t) => [t.key, t]))

  const sampleByDataset = new Map<string, Row[]>()
  for (const sr of await db.sampleRow.findMany({ orderBy: { createdAt: 'asc' } })) {
    try {
      const arr = sampleByDataset.get(sr.datasetId) ?? []
      arr.push(JSON.parse(sr.payload) as Row)
      sampleByDataset.set(sr.datasetId, arr)
    } catch {
      /* แถวเสีย — ข้าม */
    }
  }

  // cache ค่าอ้างอิงของเอนจิน EXISTS_IN_DATASET (INTEGRITY)
  const refValuesCache = new Map<string, Set<string>>()
  async function refValuesFor(refDatasetId: string, refColumn: string): Promise<Set<string>> {
    const cacheKey = `${refDatasetId}|${refColumn}`
    const cached = refValuesCache.get(cacheKey)
    if (cached) return cached
    const refRows = sampleByDataset.get(refDatasetId) ?? []
    const refValues = new Set(
      refRows
        .map((r) => (r[refColumn] === null || r[refColumn] === undefined ? '' : String(r[refColumn]).trim()))
        .filter((v) => v !== ''),
    )
    refValuesCache.set(cacheKey, refValues)
    return refValues
  }

  const datasetNameById2 = new Map([...datasetMap.entries()])
  let latestRunSignals = 0

  for (const batch of RUN_BATCHES) {
    const batchAt = new Date(Date.now() - batch.daysAgo * 86_400_000)
    const isLatest = batch.daysAgo === 0

    for (const rule of seededRules) {
      const tpl = tplMap.get(rule.condition)
      const engineType = tpl?.engineType
      if (!engineType) continue
      const dimension = (tpl?.dimension ?? 'VALIDITY') as DimensionKey

      let evalContext: { refValues?: Set<string> } | undefined
      if (engineType === 'EXISTS_IN_DATASET') {
        try {
          const p = JSON.parse(rule.parameters || '{}') as { refDatasetId?: string; refColumn?: string }
          const refDatasetId = String(p.refDatasetId ?? '')
          const refColumn = String(p.refColumn ?? '')
          if (refDatasetId && refColumn) {
            evalContext = { refValues: await refValuesFor(refDatasetId, refColumn) }
          }
        } catch {
          /* พารามิเตอร์เสีย — ประเมินแบบไม่มีบริบท */
        }
      }

      for (const link of rule.datasets) {
        const rows = sampleByDataset.get(link.datasetId) ?? []
        const evaluation = evaluateRule(
          { column: rule.column, engineType, parameters: rule.parameters },
          rows,
          evalContext,
        )
        const status = evaluation.failedRows === 0 ? 'PASSED' : 'FAILED'
        const passRate = evaluation.totalRows > 0 ? (evaluation.totalRows - evaluation.failedRows) / evaluation.totalRows : 1

        await db.dqRun.create({
          data: {
            ruleId: rule.id,
            datasetId: link.datasetId,
            status,
            totalRows: evaluation.totalRows,
            failedRows: evaluation.failedRows,
            passRate,
            dimension,
            createdAt: batchAt,
          },
        })

        // สัญญาณกฎล้มเหลวของรอบล่าสุด — ต้องมีมนุษย์ทบทวนเสมอ (เหมือน logic ของ /api/dq/run)
        if (isLatest && status === 'FAILED') {
          const dsName = datasetNameById2.get(link.datasetId) ?? 'ชุดข้อมูล'
          await db.dqSignal.create({
            data: {
              datasetId: link.datasetId,
              kind: 'RULE_VIOLATION',
              dimension,
              title: `กฎล้มเหลว: ${rule.column} — ${tpl?.name ?? rule.condition}`,
              detail: `รอบตรวจล่าสุด (${batchAt.toLocaleDateString('th-TH')}) ล้มเหลว ${evaluation.failedRows} จาก ${evaluation.totalRows} แถว ตามมาตราที่ ${Object.keys(DIMENSION_LABELS).indexOf(dimension) + 1} ${DIMENSION_LABELS[dimension].th} — โปรดทบทวนและดำเนินการโดยมนุษย์ (ระบบไม่แก้ไขข้อมูลต้นทาง)`,
              severity: rule.severity,
              status: 'PENDING_REVIEW',
            },
          })
          latestRunSignals++
        }
      }
    }
  }

  await db.auditLog.create({
    data: {
      action: 'RUN_VALIDATION',
      actor: 'system@seed',
      target: `${RUN_BATCHES.length} batches`,
      detail: `Seed เริ่มต้นระบบ: บันทึกประวัติผลการตรวจ ${RUN_BATCHES.length} รอบ (6 วันก่อน / 2 วันก่อน / ล่าสุด) ด้วยเอนจินประเมินผลจริง ตามมาตรา DAMA-DMBOK 9 มิติ + สัญญาณกฎล้มเหลวรอบล่าสุด ${latestRunSignals} รายการ`,
    },
  })

  await db.auditLog.create({
    data: {
      action: 'SET_CLASSIFICATION',
      actor: 'system@seed',
      target: `${DATASETS.length} datasets`,
      detail: 'Seed เริ่มต้นระบบ: จำแนกประเภทข้อมูลตามกรอบมาตรฐาน (ข้อมูลส่วนบุคคล/AML-KYC/การกำกับดูแล/บัตร/การเงิน) — เหลือ 1 ชุดข้อมูลรอจำแนก (ข้อมูลพนักงาน HR)',
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

  // ---------- Data Asset ตัวอย่าง (โมดูล Data Asset — CSV / JSON) ----------
  // ทำข้อมูลตัวอย่างให้คลังข้อมูล (Data Inventory) มีข้อมูลตั้งแต่เปิดหน้าแรก
  interface SeedAsset {
    name: string
    description: string
    sourceType: 'CSV' | 'JSON' | 'DATABASE'
    sourceInfo: Record<string, unknown>
    rows: Row[]
    columns: string[]
  }

  const ASSET_BRANCH_CSV = 'ทะเบียนลูกค้าสาขาภาคเหนือ (CSV)'
  const branchRows: Row[] = [
    { customer_id: 'NC-1001', full_name: 'อนันต์ ใจดี', email: 'anan.jaidee@example.co.th', phone: '053-210-101', branch: 'เชียงใหม่', balance: 42500.5, kyc_date: '2026-09-02' },
    { customer_id: 'NC-1002', full_name: 'พิมพ์ชนก แสงทอง', email: 'pimchanok.s@example.co.th', phone: '053-210-102', branch: 'เชียงใหม่', balance: 18700, kyc_date: '2026-09-10' },
    { customer_id: 'NC-1003', full_name: 'ธนกร มั่นคง', email: 'thanakorn.m@example.co.th', phone: '054-330-201', branch: 'ลำพูน', balance: 92150.75, kyc_date: '2026-08-21' },
    { customer_id: 'NC-1004', full_name: 'สุนิสา บุญมาก', email: 'sunisa.b@example.co.th', phone: '054-330-202', branch: 'ลำปาง', balance: 7300, kyc_date: '2026-09-15' },
    { customer_id: 'NC-1005', full_name: 'วิชัย เดินทาง', email: 'wichai.d@example.co.th', phone: '055-110-301', branch: 'แพร่', balance: 156800, kyc_date: '2026-07-30' },
    { customer_id: 'NC-1006', full_name: 'กมลวรรณ อ่อนน้อม', email: 'kamolwan.o@example.co.th', phone: '055-110-302', branch: 'น่าน', balance: 33450, kyc_date: '2026-09-18' },
    { customer_id: 'NC-1007', full_name: 'ประเสริฐ งามดี', email: 'prasert.n@example.co.th', phone: '042-500-401', branch: 'เชียงราย', balance: 58900.25, kyc_date: '2026-08-05' },
    { customer_id: 'NC-1008', full_name: 'มานะ ตั้งใจ', email: 'mana.t@example.co.th', phone: '042-500-402', branch: 'พะเยา', balance: 9900, kyc_date: '2026-09-22' },
  ]
  const ASSET_EXCHANGE_JSON = 'รายงานอัตราแลกเปลี่ยนรายวัน (JSON)'
  const fxRows: Row[] = [
    { date: '2026-10-19', currency: 'USD', buy: 33.12, sell: 33.85, source: 'ตลาดในประเทศ' },
    { date: '2026-10-19', currency: 'EUR', buy: 36.4, sell: 37.15, source: 'ตลาดในประเทศ' },
    { date: '2026-10-19', currency: 'JPY', buy: 0.2215, sell: 0.2285, source: 'ตลาดในประเทศ' },
    { date: '2026-10-19', currency: 'GBP', buy: 42.8, sell: 43.65, source: 'ตลาดในประเทศ' },
    { date: '2026-10-19', currency: 'SGD', buy: 24.9, sell: 25.42, source: 'ตลาดในประเทศ' },
    { date: '2026-10-19', currency: 'CNY', buy: 4.63, sell: 4.71, source: 'ตลาดในประเทศ' },
    { date: '2026-10-19', currency: 'AUD', buy: 21.75, sell: 22.2, source: 'ตลาดในประเทศ' },
    { date: '2026-10-19', currency: 'HKD', buy: 4.24, sell: 4.33, source: 'ตลาดในประเทศ' },
  ]
  const SEED_ASSETS: SeedAsset[] = [
    {
      name: ASSET_BRANCH_CSV,
      description: 'ทะเบียนลูกค้ารายสาขาภาคเหนือ พร้อมยอดคงเหลือและวันที่ KYC — นำเข้าจากไฟล์ CSV รายเดือน',
      sourceType: 'CSV',
      sourceInfo: { fileName: 'north-branch-customers.csv', sizeChars: 1024, delimiter: ',', skippedRows: 0 },
      rows: branchRows,
      columns: ['customer_id', 'full_name', 'email', 'phone', 'branch', 'balance', 'kyc_date'],
    },
    {
      name: ASSET_EXCHANGE_JSON,
      description: 'อัตราแลกเปลี่ยนซื้อ-ขายรายวัน 8 สกุล — นำเข้าจาก JSON feed ระบบ Treasury',
      sourceType: 'JSON',
      sourceInfo: { fileName: 'fx-daily.json', sizeChars: 768, shape: 'อาร์เรย์ของวัตถุ (array of objects)', skippedRows: 0 },
      rows: fxRows,
      columns: ['date', 'currency', 'buy', 'sell', 'source'],
    },
  ]

  for (const a of SEED_ASSETS) {
    await db.$transaction(async (tx) => {
      const asset = await tx.dataAsset.create({
        data: {
          name: a.name,
          description: a.description,
          sourceType: a.sourceType,
          sourceInfo: JSON.stringify(a.sourceInfo),
          rowCount: a.rows.length,
          columnCount: a.columns.length,
          importedBy: 'preecha.engineer@company.co.th',
        },
      })
      await tx.dataAssetColumn.createMany({
        data: a.columns.map((c, idx) => ({ assetId: asset.id, name: c, dataType: inferColumnType(a.rows, c), position: idx })),
      })
      await tx.dataAssetRecord.createMany({
        data: a.rows.map((r, idx) => ({ assetId: asset.id, rowNo: idx + 1, payload: JSON.stringify(r) })),
      })
    })
    await db.auditLog.create({
      data: {
        action: 'IMPORT_DATA_ASSET',
        actor: 'preecha.engineer@company.co.th',
        target: a.name,
        detail: `นำเข้า Data Asset "${a.name}" จากแหล่ง ${a.sourceType} — ${a.rows.length} แถว / ${a.columns.length} คอลัมน์ โดย ปรีชา วิศวกรรม (บทบาท Data Engineer)`,
      },
    })
  }

  console.log('Seed complete:', {
    users: await db.user.count(),
    datasets: await db.dataset.count(),
    grants: await db.datasetAccess.count(),
    sampleRows: await db.sampleRow.count(),
    conditionTemplates: await db.conditionTemplate.count(),
    rules: await db.dqRule.count(),
    ruleDatasetLinks: await db.ruleDataset.count(),
    runs: await db.dqRun.count(),
    signals: await db.dqSignal.count(),
    exceptions: await db.dqException.count(),
    dataAssets: await db.dataAsset.count(),
    dataAssetRecords: await db.dataAssetRecord.count(),
  })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
