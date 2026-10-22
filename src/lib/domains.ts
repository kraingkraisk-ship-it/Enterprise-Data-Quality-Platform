/**
 * Data Domain helpers (v0.14.0) — โดเมนข้อมูลและโดเมนย่อยของคลังข้อมูล (Data Inventory)
 * หลักการ:
 * - โครงสร้าง 2 ระดับเท่านั้น: โดเมนหลัก (parentId = null) → โดเมนย่อย (parentId = id โดเมนหลัก)
 * - ทุกการสร้าง/แก้ไข/ลบ ต้องผ่านสิทธิ์ MANAGE_DATASETS ตาม RBAC (ตรวจใน API เสมอ)
 * - สีของ badge เป็นคีย์สีจากพาเลตที่กำหนดเอง (ไม่ใช้ฟ้า/น้ำเงินตามมาตรฐาน UI)
 */

/** ความลึกสูงสุดของต้นไม้โดเมน — 1 = โดเมนหลัก, 2 = โดเมนย่อย */
export const DOMAIN_MAX_DEPTH = 2

/** ขีดจำกัดความยาวข้อความ */
export const DOMAIN_NAME_MAX = 80
export const DOMAIN_DESC_MAX = 300

/** ค่า sentinel ของ Radix Select เมื่อ "ไม่ระบุโดเมน" (Select ห้าม value เป็นสตริงว่าง) */
export const NO_DOMAIN = '__none__'

export interface DomainColorDef {
  key: string
  th: string
  /** จุดสีบน badge/ชิป */
  dot: string
  /** ชิปพื้นหลังอ่อน */
  chip: string
  /** วงกลมตัวเลือกสีในฟอร์ม */
  swatch: string
}

/** พาเลตสีของโดเมน — เขียน literal class ทั้งหมดเพื่อให้ Tailwind 4 JIT เห็นครบ */
export const DOMAIN_COLORS: DomainColorDef[] = [
  { key: 'emerald', th: 'เขียวมรกต', dot: 'bg-emerald-500', chip: 'border-emerald-300 bg-emerald-50 text-emerald-800', swatch: 'bg-emerald-500' },
  { key: 'teal', th: 'เขียวน้ำทะเล', dot: 'bg-teal-500', chip: 'border-teal-300 bg-teal-50 text-teal-800', swatch: 'bg-teal-500' },
  { key: 'amber', th: 'เหลืองอำพัน', dot: 'bg-amber-500', chip: 'border-amber-300 bg-amber-50 text-amber-800', swatch: 'bg-amber-500' },
  { key: 'orange', th: 'ส้ม', dot: 'bg-orange-500', chip: 'border-orange-300 bg-orange-50 text-orange-800', swatch: 'bg-orange-500' },
  { key: 'rose', th: 'ชมพูแดง', dot: 'bg-rose-500', chip: 'border-rose-300 bg-rose-50 text-rose-800', swatch: 'bg-rose-500' },
  { key: 'violet', th: 'ม่วง', dot: 'bg-violet-500', chip: 'border-violet-300 bg-violet-50 text-violet-800', swatch: 'bg-violet-500' },
  { key: 'lime', th: 'เขียวมะนาว', dot: 'bg-lime-500', chip: 'border-lime-300 bg-lime-50 text-lime-800', swatch: 'bg-lime-500' },
  { key: 'cyan', th: 'ฟ้าอมเขียว', dot: 'bg-cyan-500', chip: 'border-cyan-300 bg-cyan-50 text-cyan-800', swatch: 'bg-cyan-500' },
  { key: 'slate', th: 'เทา', dot: 'bg-slate-500', chip: 'border-slate-300 bg-slate-50 text-slate-700', swatch: 'bg-slate-500' },
]

const COLOR_MAP = new Map(DOMAIN_COLORS.map((c) => [c.key, c]))

/** คืนสีตามคีย์ (ถ้าไม่พบ/เก่าให้ fallback emerald) */
export function domainColor(key?: string | null): DomainColorDef {
  return COLOR_MAP.get(key ?? '') ?? DOMAIN_COLORS[0]
}

export function isValidDomainColor(key: string): boolean {
  return COLOR_MAP.has(key)
}

/* ------------------------------------------------------------------ */
/* Tree helpers — ใช้ทั้ง client (UI) และ server (seed ได้)              */
/* ------------------------------------------------------------------ */

/** โดเมน 1 แถวจาก API (flat) */
export interface DomainItem {
  id: string
  name: string
  nameEn: string
  description: string
  parentId: string | null
  color: string
  position: number
  /** จำนวน Data Asset ที่ผูกกับโดเมนนี้โดยตรง */
  assetCount: number
  createdAt: string
}

/** โดเมนแบบต้นไม้ (โดเมนหลัก + โดเมนย่อยของมัน) */
export interface DomainNode extends DomainItem {
  children: DomainItem[]
}

/** ประกอบ flat list → ต้นไม้ (โดเมนย่อยที่พ่อหายไปจะถูกข้าม — deny-by-default) */
export function buildDomainTree(items: DomainItem[]): DomainNode[] {
  const roots = items.filter((d) => !d.parentId)
  return roots
    .slice()
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'th'))
    .map((root) => ({
      ...root,
      children: items
        .filter((d) => d.parentId === root.id)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'th')),
    }))
}

/** จำนวน asset รวมของโดเมนหลัก (ของตัวเอง + ทุกโดเมนย่อย) */
export function rollupAssetCount(node: DomainNode): number {
  return node.assetCount + node.children.reduce((s, c) => s + c.assetCount, 0)
}

/** path เต็ม "โดเมนหลัก / โดเมนย่อย" — ใช้แสดงบนการ์ดและ dialog */
export function domainPath(item: Pick<DomainItem, 'id' | 'name' | 'parentId'>, all: Pick<DomainItem, 'id' | 'name'>[]): string {
  if (!item.parentId) return item.name
  const parent = all.find((d) => d.id === item.parentId)
  return parent ? `${parent.name} / ${item.name}` : item.name
}
