'use client'

/**
 * LineageDiagram (v0.21.0) — แผนผังที่มา-ปลายทางแบบภาพของ Data Mapping
 * จัดคอลัมน์ตามระดับ BFS จาก element กึ่งกลาง: ต้นทาง (ซ้าย) → จุดกึ่งกลาง (กลาง) → ปลายทาง (ขวา)
 * เส้นเชื่อม = SVG (สีตามประเภทการแมป · เส้นทึบ = ACTIVE / เส้นประ = ร่างหรือเลิกใช้)
 * กล่อง = HTML วางซ้อนบน SVG (ไม่เพิ่ม dependency ใหม่)
 * a11y: role="img" + aria-label + รายการเส้นทางแบบข้อความสำหรับ screen reader (sr-only)
 * — ตัวเชื่อมไม่พึ่งสีเพียงอย่างเดียว (มีป้ายประเภทบนเส้น + เส้นทึบ/เส้นประ)
 */

import { useId, useMemo } from 'react'
import { MAPPING_TYPES, MAPPING_TYPE_KEYS, isMappingType, type MappingTypeKey } from '@/lib/mappings'
import type { LineageEdge, MappingElementSummary } from './types'

/* สีเส้นตามประเภทการแมป — ตระกูล emerald + เทากลาง + อำพัน (ห้ามน้ำเงิน/indigo) */
const TYPE_STROKE: Record<MappingTypeKey, string> = {
  DIRECT: '#059669', // emerald-600
  RENAME: '#E11D48', // rose-600 (v0.22.0 — Direct/Rename)
  TRANSFORM: '#D97706', // amber-600
  DERIVED: '#0F766E', // teal-700
  AGGREGATE: '#475569', // slate-600
  LOOKUP: '#CA8A04', // yellow-600
}

function typeKey(t: string): MappingTypeKey {
  return isMappingType(t) ? t : 'DIRECT'
}

const STATUS_TEXT: Record<string, string> = {
  DRAFT: 'ร่าง',
  ACTIVE: 'ใช้งาน',
  DEPRECATED: 'เลิกใช้',
}

interface DiagramGeom {
  nodeW: number
  nodeH: number
  gapX: number
  gapY: number
  fontName: string
  fontPath: string
}

const FULL_GEOM: DiagramGeom = { nodeW: 188, nodeH: 88, gapX: 84, gapY: 16, fontName: 'text-[11px]', fontPath: 'text-[9px]' }
const COMPACT_GEOM: DiagramGeom = { nodeW: 150, nodeH: 62, gapX: 52, gapY: 10, fontName: 'text-[10px]', fontPath: 'text-[8px]' }

export interface LineageDiagramProps {
  rootId: string
  nodes: MappingElementSummary[]
  edges: LineageEdge[]
  /** ความลึกที่ใช้ดึงข้อมูล (แสดงใน aria-label เท่านั้น) */
  depth?: number
  /** โหมดย่อ — แถบแนวนอนกล่องเล็ก ไม่มี legend (ใช้ในแท็บของ Dialog element) */
  compact?: boolean
}

export function LineageDiagram({ rootId, nodes, edges, depth = 2, compact = false }: LineageDiagramProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const geom = compact ? COMPACT_GEOM : FULL_GEOM

  /* ---------- คำนวณระดับคอลัมน์ (BFS relax) + ตำแหน่งกล่อง ---------- */
  const layout = useMemo(() => {
    const levels = new Map<string, number>([[rootId, 0]])
    let changed = true
    while (changed) {
      changed = false
      for (const e of edges) {
        const ls = levels.get(e.sourceId)
        const lt = levels.get(e.targetId)
        if (ls !== undefined && lt === undefined) {
          levels.set(e.targetId, ls + 1)
          changed = true
        } else if (lt !== undefined && ls === undefined) {
          levels.set(e.sourceId, lt - 1)
          changed = true
        }
      }
    }
    const minLevel = Math.min(0, ...levels.values())
    const maxLevel = Math.max(0, ...levels.values())

    // จัด node เข้าคอลัมน์ (เรียงตาม path ให้ผลลัพธ์คงที่เสมอ) — node ที่ไม่เชื่อมกราฟวางคอลัมน์ 0
    const columns = new Map<number, MappingElementSummary[]>()
    for (const n of nodes) {
      const lvl = levels.get(n.id) ?? 0
      const col = lvl - minLevel
      const arr = columns.get(col) ?? []
      arr.push(n)
      columns.set(col, arr)
    }
    for (const arr of columns.values()) arr.sort((a, b) => a.path.localeCompare(b.path, 'th'))

    const maxRows = Math.max(1, ...[...columns.values()].map((a) => a.length))
    const width = (maxLevel - minLevel + 1) * (geom.nodeW + geom.gapX) - geom.gapX
    const height = maxRows * (geom.nodeH + geom.gapY) - geom.gapY

    const pos = new Map<string, { x: number; y: number }>()
    for (const [col, arr] of columns) {
      arr.forEach((n, row) => pos.set(n.id, { x: col * (geom.nodeW + geom.gapX), y: row * (geom.nodeH + geom.gapY) }))
    }
    return { columns, minLevel, maxLevel, width, height, pos }
  }, [rootId, nodes, edges, geom])

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const root = nodeById.get(rootId)

  /* ---------- ไม่มีข้อมูล ---------- */
  if (!root || nodes.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
        ยังไม่มีเส้นทาง mapping ที่เชื่อมกับ element นี้
      </p>
    )
  }

  const padT = compact ? 0 : 20 // ที่ว่างสำหรับคำบรรยายคอลัมน์ (โหมดเต็ม)
  const innerW = Math.max(layout.width, compact ? 560 : 720)

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border bg-muted/20 p-2">
        <div
          role="img"
          aria-label={`แผนผังที่มา-ปลายทางของ ${root.nameTh}, ${edges.length} เส้นทาง (ลึกสุด ${depth} ขั้น)`}
          className="relative"
          style={{ width: innerW, height: layout.height + padT + 8 }}
        >
          {/* เส้นเชื่อม (SVG) */}
          <svg
            aria-hidden="true"
            className="absolute inset-0"
            width={innerW}
            height={layout.height + padT + 8}
            viewBox={`0 0 ${innerW} ${layout.height + padT + 8}`}
          >
            <defs>
              {MAPPING_TYPE_KEYS.map((t) => (
                <marker
                  key={t}
                  id={`lw-arrow-${t}-${uid}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={TYPE_STROKE[t]} />
                </marker>
              ))}
            </defs>
            {edges.map((e) => {
              const s = layout.pos.get(e.sourceId)
              const tgt = layout.pos.get(e.targetId)
              if (!s || !tgt) return null
              const tk = typeKey(e.mappingType)
              const x1 = s.x + geom.nodeW
              const y1 = s.y + padT + geom.nodeH / 2
              const x2 = tgt.x
              const y2 = tgt.y + padT + geom.nodeH / 2
              const dash = e.status === 'ACTIVE' ? undefined : '5 4'
              const mx = (x1 + x2) / 2
              const my = (y1 + y2) / 2 - 5
              return (
                <g key={e.id}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={TYPE_STROKE[tk]}
                    strokeWidth={2}
                    strokeDasharray={dash}
                    markerEnd={`url(#lw-arrow-${tk}-${uid})`}
                  />
                  <text
                    x={mx}
                    y={my}
                    textAnchor="middle"
                    fontSize={compact ? 8 : 9}
                    fontWeight={600}
                    fill={TYPE_STROKE[tk]}
                    stroke="#ffffff"
                    strokeWidth={3}
                    style={{ paintOrder: 'stroke' }}
                  >
                    {MAPPING_TYPES[tk].en}
                  </text>
                </g>
              )
            })}
          </svg>

          {/* คำบรรยายคอลัมน์ (โหมดเต็ม) */}
          {!compact &&
            [...layout.columns.keys()].sort((a, b) => a - b).map((col) => (
              <p
                key={col}
                className="absolute text-center text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
                style={{ left: col * (geom.nodeW + geom.gapX), top: 0, width: geom.nodeW }}
              >
                {col + layout.minLevel < 0 ? 'ต้นทาง (upstream)' : col + layout.minLevel === 0 ? 'จุดกึ่งกลาง' : 'ปลายทาง (downstream)'}
              </p>
            ))}

          {/* กล่อง element แต่ละตัว */}
          {nodes.map((n) => {
            const p = layout.pos.get(n.id)
            if (!p) return null
            const isRoot = n.id === rootId
            return (
              <div
                key={n.id}
                className={`absolute rounded-md border bg-card px-2 py-1.5 shadow-sm ${
                  isRoot ? 'border-emerald-500 bg-emerald-50/80 ring-2 ring-emerald-500/50' : 'border-border'
                }`}
                style={{ left: p.x, top: p.y + padT, width: geom.nodeW, height: geom.nodeH }}
                title={`${n.path} · ${n.code}`}
              >
                <p className={`truncate font-medium leading-tight text-foreground ${geom.fontName}`}>{n.nameTh || n.nameEn}</p>
                <p className={`truncate font-mono text-muted-foreground ${geom.fontPath}`}>{n.path}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-0.5">
                  {n.isCde && (
                    <span className="rounded border border-emerald-300 bg-emerald-50 px-1 text-[8px] font-semibold text-emerald-800">CDE</span>
                  )}
                  {n.pii && <span className="rounded border border-amber-300 bg-amber-50 px-1 text-[8px] font-semibold text-amber-800">PII</span>}
                  <span className="rounded border border-border bg-muted/60 px-1 text-[8px] text-muted-foreground">
                    {STATUS_TEXT[n.status] ?? n.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend (โหมดเต็ม) — เส้นทึบ = ใช้งาน · เส้นประ = ร่าง/เลิกใช้ */}
      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground">
          {MAPPING_TYPE_KEYS.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5">
              <svg width="22" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="22" y2="4" stroke={TYPE_STROKE[t]} strokeWidth="2" />
              </svg>
              {MAPPING_TYPES[t].th} ({MAPPING_TYPES[t].en})
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <svg width="22" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="22" y2="4" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" />
            </svg>
            เส้นประ = ร่าง/เลิกใช้ · เส้นทึบ = ใช้งาน
          </span>
        </div>
      )}

      {/* ข้อความเทียบเท่าสำหรับ screen reader */}
      <ul className="sr-only">
        {edges.map((e) => {
          const s = nodeById.get(e.sourceId)
          const t = nodeById.get(e.targetId)
          if (!s || !t) return null
          const tk = typeKey(e.mappingType)
          return (
            <li key={e.id}>
              {`เส้นทาง ${e.code}: ${s.nameTh || s.nameEn} (${s.path}) → ${t.nameTh || t.nameEn} (${t.path}) · ประเภท ${MAPPING_TYPES[tk].th} · สถานะ ${
                STATUS_TEXT[e.status] ?? e.status
              }`}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export default LineageDiagram
