import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hasPermission, ROLES } from '@/lib/rbac'
import { buildRuleSentence, isDimensionKey, DIMENSION_LABELS } from '@/lib/dq'
import { gradeOf } from '@/lib/dama'
import { rollupByElement, type RollupRunInput } from '@/lib/elements'

/**
 * GET /api/executive/summary — ข้อมูลแดชบอร์ดผู้บริหาร (v0.17.0 · byDomain อัปเกรดเป็น Element Rollup ใน v0.19.0)
 * query: viewer=<email> (บังคับ — ตรวจสิทธิ์ VIEW_EXEC_DASHBOARD) · days=30|90|180|365 · issuesMode=open|all
 *
 * นิยามคะแนน (ตรงกับหน้าบัตรคะแนน DQ — คำนวณจากผลรันจริง DqRun):
 * - คะแนนชุดข้อมูล = เฉลี่ย passRate ของผลรันล่าสุดรายกฎ (×100)
 * - ชุดข้อมูลที่ยังไม่เคยรันตรวจ = คะแนน 0 (ตามที่ผู้บริหารกำหนด)
 * - คะแนนโดเมน (v0.19.0 — Element Rollup ตามโครงสร้าง 4 ระดับ):
 *     element = อัตราผ่านถ่วงน้ำหนักแถวของผลรันล่าสุดราย (กฎ × ชุดข้อมูล) ของกฎที่ผูก element นั้น
 *     โดเมนย่อย = เฉลี่ยคะแนน element ทั้งหมดใต้โดเมนย่อย (element ที่ยังไม่ถูกวัด นับ 0 — นิยามผู้บริหาร "ไม่เคยรัน = 0")
 *     โดเมนหลัก = เฉลี่ยคะแนนโดเมนย่อยที่มี element อยู่
 *     ที่มาของ element: DqRule.dataElementId (การผูกกฎ–element ปัจจุบัน) — จึงครอบทั้งรันเดี่ยวและรันระดับโดเมน
 * - แนวโน้ม = เฉลี่ย passRate ของทุกผลรันในแต่ละวัน (เกิน 90 วัน → รวมเป็นรายสัปดาห์)
 * อ่านอย่างเดียว — ไม่มี PII (คะแนน/สถานะล้วน)
 */

const DAY_MS = 24 * 60 * 60 * 1000
const ALLOWED_DAYS = [30, 90, 180, 365]

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const viewerEmail = String(searchParams.get('viewer') ?? '').trim().toLowerCase()
    if (!viewerEmail) {
      return NextResponse.json({ error: 'กรุณาระบุผู้เข้าชม (viewer) เพื่อตรวจสิทธิ์ตาม RBAC' }, { status: 400 })
    }

    const viewer = await db.user.findUnique({ where: { email: viewerEmail } })
    if (!viewer || viewer.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'ไม่พบบัญชีผู้เข้าชมนี้ในระบบ หรือบัญชีถูกระงับ' }, { status: 404 })
    }
    if (!hasPermission(viewer.role, 'VIEW_EXEC_DASHBOARD')) {
      const allowed = Object.values(ROLES)
        .filter((r) => r.permissions.includes('VIEW_EXEC_DASHBOARD'))
        .map((r) => r.th)
        .join(', ')
      return NextResponse.json(
        { error: `บทบาท "${ROLES[viewer.role as keyof typeof ROLES]?.th ?? viewer.role}" ไม่มีสิทธิ์เข้าดูแดชบอร์ดผู้บริหาร — ต้องเป็นบทบาท: ${allowed}` },
        { status: 403 },
      )
    }

    const daysParam = Number(searchParams.get('days') ?? 30)
    const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30
    const issuesMode = searchParams.get('issuesMode') === 'all' ? 'all' : 'open'

    const now = Date.now()
    const cutoff = now - days * DAY_MS

    /* ------------------------- โหลดข้อมูลทั้งหมด ------------------------- */
    const [datasets, runsWindow, templates, allRules, issuesRaw, allUsers, domains, elements] = await Promise.all([
      db.dataset.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          domainId: true,
          domain: { select: { id: true, name: true, color: true, parentId: true, parent: { select: { name: true } } } },
        },
      }),
      db.dqRun.findMany({ orderBy: { createdAt: 'desc' }, take: 8000 }),
      db.conditionTemplate.findMany(),
      db.dqRule.findMany({
        where: { enabled: true },
        include: {
          element: { select: { id: true, code: true, nameTh: true } },
          datasets: { include: { dataset: { select: { id: true, name: true } } }, orderBy: { datasetId: 'asc' } },
          runs: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      db.dqIssue.findMany({
        where: issuesMode === 'all' ? {} : { status: { in: ['OPEN', 'IN_PROGRESS'] } },
        include: { dataset: { select: { name: true } } },
        orderBy: { detectedAt: 'desc' },
      }),
      db.user.findMany({ select: { email: true, name: true } }),
      db.dataDomain.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, color: true, parentId: true, parent: { select: { name: true } } } }),
      db.dataElement.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, code: true, nameTh: true, subDomainId: true, subDomain: { select: { id: true, name: true, parentId: true } } },
        orderBy: [{ position: 'asc' }, { nameTh: 'asc' }],
      }),
    ])
    const templateMap = new Map(templates.map((t) => [t.key, t]))
    const datasetNameMap = new Map(datasets.map((d) => [d.id, d.name]))
    const userNameMap = new Map(allUsers.map((u) => [u.email, u.name]))

    /* ------------------- ผลรันล่าสุดรายคู่ (กฎ × ชุดข้อมูล) — เหมือนบัตรคะแนน ------------------- */
    const latestMap = new Map<string, (typeof runsWindow)[number]>()
    for (const run of runsWindow) {
      const key = `${run.ruleId}|${run.datasetId}`
      if (!latestMap.has(key)) latestMap.set(key, run)
    }

    /* ------------------- คะแนนรายชุดข้อมูล (ไม่เคยรัน = 0) ------------------- */
    const datasetScores = new Map<string, number>()
    let sumAll = 0 // รวมทุกชุด (ไม่เคยรัน = 0)
    let sumMeasured = 0
    let measuredCount = 0
    let rulesPassed = 0
    let rulesFailed = 0

    for (const d of datasets) {
      const latestRuns = [...latestMap.values()].filter((r) => r.datasetId === d.id)
      let sum = 0
      for (const run of latestRuns) {
        sum += run.passRate * 100
        if (run.status === 'FAILED') rulesFailed += 1
        else rulesPassed += 1
      }
      const score = latestRuns.length > 0 ? sum / latestRuns.length : 0 // ไม่เคยรัน = 0
      datasetScores.set(d.id, score)
      sumAll += score
      if (latestRuns.length > 0) {
        sumMeasured += score
        measuredCount += 1
      }
    }

    const overallScore = datasets.length > 0 ? sumAll / datasets.length : null
    const measuredScore = measuredCount > 0 ? sumMeasured / measuredCount : null
    const overallGrade = gradeOf(overallScore)

    /* ------------------- แนวโน้ม (ทุกผลรันในหน้าต่างเวลา) ------------------- */
    const weekly = days > 90
    const bucketKey = (t: number): string => {
      const d = new Date(t)
      if (!weekly) return d.toISOString().slice(0, 10)
      // สัปดาห์เริ่มวันจันทร์
      const day = (d.getUTCDay() + 6) % 7
      const monday = new Date(d)
      monday.setUTCDate(d.getUTCDate() - day)
      return monday.toISOString().slice(0, 10)
    }
    const trendBuckets = new Map<string, { sum: number; n: number }>()
    for (const run of runsWindow) {
      const t = new Date(run.createdAt).getTime()
      if (t < cutoff) continue
      const key = bucketKey(t)
      const cell = trendBuckets.get(key) ?? { sum: 0, n: 0 }
      cell.sum += run.passRate * 100
      cell.n += 1
      trendBuckets.set(key, cell)
    }
    const trendPoints = [...trendBuckets.entries()]
      .map(([date, cell]) => ({ date, label: date.slice(5).replace('-', '/'), score: Math.round((cell.sum / cell.n) * 10) / 10, runs: cell.n }))
      .sort((a, b) => (a.date < b.date ? -1 : 1))

    /* ------------------- คะแนนรายโดเมน (v0.19.0 — Element Rollup 4 ระดับ) ------------------- */
    // ที่มาคะแนน element: กฎที่ผูก element (DqRule.dataElementId) × ผลรันล่าสุดราย (กฎ × ชุดข้อมูล)
    // วิธีคำนวณเดียวกับ rollup หน้ารันระดับโดเมน (src/lib/elements.ts — ถ่วงน้ำหนักจำนวนแถว)
    const elementRollupInputs: RollupRunInput[] = []
    for (const r of allRules) {
      if (!r.element) continue
      for (const rd of r.datasets) {
        const run = latestMap.get(`${r.id}|${rd.datasetId}`)
        if (run) {
          elementRollupInputs.push({ dataElementId: r.element.id, totalRows: run.totalRows, passRate: run.passRate, status: run.status })
        }
      }
    }
    const elementRollups = rollupByElement(elementRollupInputs)

    const elementsBySub = new Map<string, typeof elements>()
    for (const e of elements) {
      const arr = elementsBySub.get(e.subDomainId) ?? []
      arr.push(e)
      elementsBySub.set(e.subDomainId, arr)
    }
    const subsByParent = new Map<string, typeof domains>()
    for (const d of domains) {
      if (d.parentId === null) continue
      const arr = subsByParent.get(d.parentId) ?? []
      arr.push(d)
      subsByParent.set(d.parentId, arr)
    }

    const byDomain = domains
      .filter((d) => d.parentId === null)
      .map((top) => {
        const subs = subsByParent.get(top.id) ?? []
        let elementCount = 0
        let elementsMeasured = 0
        const subScores: number[] = []
        for (const s of subs) {
          const els = elementsBySub.get(s.id) ?? []
          if (els.length === 0) continue // โดเมนย่อยไม่มี element — ไม่เข้าเฉลี่ย
          for (const e of els) {
            elementCount += 1
            if (elementRollups.get(e.id)?.score != null) elementsMeasured += 1
          }
          subScores.push(els.reduce((sum, e) => sum + (elementRollups.get(e.id)?.score ?? 0), 0) / els.length)
        }
        const score = subScores.length > 0 ? subScores.reduce((a, b) => a + b, 0) / subScores.length : 0
        return {
          id: top.id,
          name: top.name,
          color: top.color,
          parentName: null as string | null,
          elementCount,
          elementsMeasured,
          score: Math.round(score * 10) / 10,
        }
      })
      .filter((g) => g.elementCount > 0) // โดเมนหลักที่ยังไม่มี element — ยังไม่มีคะแนน element rollup ให้แสดง
      .sort((a, b) => a.score - b.score) // แย่สุดก่อน

    // ชุดข้อมูลที่ไม่สังกัดโดเมนใด — คะแนนยังคงมาจากชุดข้อมูล (เหมือนเดิม เพราะไม่มี element คลุม)
    const unassigned = { sum: 0, n: 0 }
    for (const d of datasets) {
      if (!d.domainId) {
        unassigned.sum += datasetScores.get(d.id) ?? 0
        unassigned.n += 1
      }
    }

    /* ------------------- Critical Issues ------------------- */
    const criticalAll = issuesRaw.filter((i) => i.severity === 'CRITICAL')
    const criticalOpen = issuesRaw.filter((i) => i.severity === 'CRITICAL' && (i.status === 'OPEN' || i.status === 'IN_PROGRESS'))
    const criticalCount = issuesMode === 'all' ? criticalAll.length : criticalOpen.length
    const criticalItems = (issuesMode === 'all' ? criticalAll : criticalOpen).slice(0, 8).map((i) => ({
      id: i.id,
      code: i.code,
      title: i.title,
      datasetName: i.dataset.name,
      status: i.status,
      detectedAt: i.detectedAt,
      dueAt: i.dueAt,
      overdue: !!(i.dueAt && (i.status === 'OPEN' || i.status === 'IN_PROGRESS') && new Date(i.dueAt).getTime() < now),
    }))

    /* ------------------- กฎที่ต่ำกว่า Threshold ------------------- */
    const belowItems = allRules
      .filter((r) => r.runs[0] && r.runs[0].passRate * 100 < r.threshold)
      .map((r) => {
        const passRate = Math.round(r.runs[0].passRate * 1000) / 10
        const template = templateMap.get(r.condition)
        const datasetNames = r.datasets.map((rd) => rd.dataset.name)
        let refDatasetName: string | undefined
        if (template?.engineType === 'EXISTS_IN_DATASET') {
          try {
            const p = JSON.parse(r.parameters || '{}') as Record<string, unknown>
            refDatasetName = datasetNameMap.get(String(p.refDatasetId ?? ''))
          } catch {
            refDatasetName = undefined
          }
        }
        return {
          id: r.id,
          sentence: buildRuleSentence({
            datasetNames,
            column: r.column,
            condition: r.condition,
            conditionSentence: template?.sentence,
            engineType: template?.engineType,
            refDatasetName,
            parameters: r.parameters,
            severity: r.severity,
            filter: r.filter,
          }),
          datasetNames,
          severity: r.severity,
          dimension: isDimensionKey(template?.dimension ?? '') ? (template!.dimension as keyof typeof DIMENSION_LABELS) : null,
          passRate,
          threshold: r.threshold,
          gap: Math.round((r.threshold - passRate) * 10) / 10,
          at: r.runs[0].createdAt,
        }
      })
      .sort((a, b) => b.gap - a.gap)

    /* ------------------- ปัญหาที่เกิน SLA (dueAt ที่ผู้ใช้ตั้ง) ------------------- */
    const slaItems = issuesRaw
      .filter((i) => i.dueAt && (i.status === 'OPEN' || i.status === 'IN_PROGRESS') && new Date(i.dueAt).getTime() < now)
      .map((i) => ({
        id: i.id,
        code: i.code,
        title: i.title,
        datasetName: i.dataset.name,
        severity: i.severity,
        status: i.status,
        dueAt: i.dueAt,
        daysOverdue: Math.max(1, Math.floor((now - new Date(i.dueAt as Date).getTime()) / DAY_MS)),
        assignedToName: i.assignedTo ? (userNameMap.get(i.assignedTo) ?? i.assignedTo) : null,
      }))
      .sort((a, b) => b.daysOverdue - a.daysOverdue)

    return NextResponse.json({
      viewer: { name: viewer.name, role: viewer.role, roleTh: ROLES[viewer.role as keyof typeof ROLES]?.th ?? viewer.role },
      generatedAt: new Date().toISOString(),
      period: { days, weekly },
      overall: {
        score: overallScore === null ? null : Math.round(overallScore * 10) / 10,
        measuredScore: measuredScore === null ? null : Math.round(measuredScore * 10) / 10,
        grade: overallGrade ? { band: overallGrade.band, label: overallGrade.label, badgeClass: overallGrade.badgeClass, textClass: overallGrade.textClass } : null,
        datasetsTotal: datasets.length,
        datasetsWithRun: measuredCount,
        datasetsNeverRun: datasets.length - measuredCount,
      },
      rules: { passed: rulesPassed, failed: rulesFailed, total: rulesPassed + rulesFailed },
      byDomain: {
        method: 'ELEMENT_ROLLUP',
        groups: byDomain,
        unassigned: { datasetCount: unassigned.n, score: unassigned.n > 0 ? Math.round((unassigned.sum / unassigned.n) * 10) / 10 : null },
      },
      trend: { days, weekly, points: trendPoints },
      criticalIssues: { mode: issuesMode, count: criticalCount, openCount: criticalOpen.length, totalCount: criticalAll.length, items: criticalItems },
      belowThreshold: { count: belowItems.length, items: belowItems.slice(0, 10) },
      sla: { overdueCount: slaItems.length, items: slaItems.slice(0, 10) },
    })
  } catch (e) {
    console.error('GET /api/executive/summary', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดแดชบอร์ดผู้บริหารได้' }, { status: 500 })
  }
}
