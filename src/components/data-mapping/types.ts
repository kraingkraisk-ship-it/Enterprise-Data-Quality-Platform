/**
 * Data Mapping — Frontend types (v0.21.0)
 * รูปทรงข้อมูลจาก /api/mappings + /api/mappings/lineage (ต้องตรงกับ src/lib/mappings-server.ts)
 * ใช้ร่วมกันทั้งแท็บใน Dialog Data Element และหน้า Data Mapping
 */

/** สรุป Data Element ฝั่งใดฝั่งหนึ่งของ mapping (พร้อมเส้นทางเต็ม โดเมนหลัก.โดเมนย่อย.ชื่อ) */
export interface MappingElementSummary {
  id: string
  code: string
  nameTh: string
  nameEn: string
  subDomainId: string
  subDomainName: string
  subDomainNameEn: string
  parentDomainId: string | null
  parentDomainName: string
  parentDomainNameEn: string
  path: string
  dataType: string
  status: string
  pii: boolean
  classification: string
  isCde: boolean
  isFinancial: boolean
}

/** Mapping แบบ expanded (มี summary ทั้ง source/target) จาก GET/POST/PATCH /api/mappings */
export interface ExpandedMapping {
  id: string
  code: string
  mappingType: string
  transformNote: string
  note: string
  status: 'DRAFT' | 'ACTIVE' | 'DEPRECATED'
  /** เวอร์ชันสเปก (v0.22.0) — อัตโนมัติ +0.1 เมื่ออนุมัติเนื้อหาที่แก้ · ปรับมือได้ด้วยสิทธิ์อนุมัติ */
  version: string
  pendingApproval: boolean
  approvedBy: string | null
  approvedAt: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  source: MappingElementSummary
  target: MappingElementSummary
}

/** เส้นเชื่อมในแผนผัง lineage จาก GET /api/mappings/lineage */
export interface LineageEdge {
  id: string
  code: string
  sourceId: string
  targetId: string
  mappingType: string
  transformNote: string
  status: string
  pendingApproval: boolean
}

/** ผลลัพธ์แผนผัง lineage (nodes = element ทุกตัวที่เกี่ยว, edges = mapping ทุกเส้น) */
export interface LineageResponse {
  rootId: string
  depth: number
  nodes: MappingElementSummary[]
  edges: LineageEdge[]
  nodeCount: number
  edgeCount: number
}

/** Element แถวเดียวจาก GET /api/elements (ใช้ใน picker เลือกต้นทาง/ปลายทาง) */
export interface PickerElement {
  id: string
  code: string
  subDomainId: string
  parentDomainId: string | null
  nameTh: string
  nameEn: string
  status: string
  pendingApproval: boolean
}

/** โดเมนแบบย่อสำหรับ cascade picker (จาก GET /api/domains) */
export interface PickerDomain {
  id: string
  name: string
  nameEn: string
  parentId: string | null
  color?: string
}

/** ผู้ใช้แบบย่อ (จาก GET /api/rbac/users) */
export interface OperatorUser {
  email: string
  name: string
  role: string
}

/* ---------------------------------------------------------------------------
 * Mapping Detail (v0.22.0) — รายละเอียดเต็มจาก GET /api/mappings/[id]
 * ตรงกับ MappingEndpointDetail ใน src/lib/mappings-server.ts
 * --------------------------------------------------------------------------- */

export interface MappingPerson {
  email: string
  name: string
  roleTh: string | null
}

/** ข้อมูลกายภาพ 1 รายการที่ผูกกับ element (จากการแมป element ↔ คอลัมน์ใน Data Asset) */
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

/** กฎ DQ 1 ข้อที่ผูกกับ element (พร้อม exception action + ผลรันล่าสุด) */
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
  lastRun: { status: string; passRate: number; createdAt: string } | null
}

/** รายละเอียด endpoint หนึ่งฝั่งของ mapping (meta + กายภาพ + กฎ + ธรรมาภิบาล) */
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
  owner: MappingPerson | null
  steward: MappingPerson | null
  custodian: MappingPerson | null
  physical: MappingPhysicalEndpoint[]
  rules: MappingRuleItem[]
}

/** รายการ Audit Trail 1 แถว */
export interface MappingAuditEntry {
  id: string
  action: string
  actor: string
  target: string
  detail: string
  createdAt: string
}

/** Response เต็มของ GET /api/mappings/[id] (v0.22.0) */
export interface MappingDetailResponse {
  mapping: ExpandedMapping
  source: MappingEndpointDetail | null
  target: MappingEndpointDetail | null
  exceptionActions: Array<{ key: string; count: number }>
  audit: MappingAuditEntry[]
}
