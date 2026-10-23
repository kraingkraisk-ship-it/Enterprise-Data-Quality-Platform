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
