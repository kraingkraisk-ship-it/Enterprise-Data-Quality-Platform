import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  buildRuleSentence,
  isConditionKey,
  isDimensionKey,
} from '@/lib/dq'
import { buildRuleVerdict, fixHintFor, gradeOf } from '@/lib/dama'

/**
 * GET /api/dq/validations/[id] — รายละเอียดรอบการตรวจ 1 รอบ (drill-down)
 * - ผลรายกฎทุกข้อในรอบ + คำตัดสินตามมาตรา (สร้างใหม่จากข้อมูลที่เก็บ)
 * - จำนวนแถวล้มเหลวที่ถูกบันทึก snapshot ไว้ต่อกฎ
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const batch = await db.dqValidationBatch.findUnique({
      where: { id },
      include: { dataset: { select: { id: true, name: true, piiEnabled: true } } },
    })
    if (!batch) {
      return NextResponse.json({ error: 'ไม่พบรอบการตรวจนี้' }, { status: 404 })
    }

    const [runs, templates] = await Promise.all([
      db.dqRun.findMany({
        where: { batchId: batch.id },
        orderBy: { createdAt: 'asc' },
        include: {
          rule: { select: { column: true, condition: true, severity: true, parameters: true, filter: true } },
          _count: { select: { failures: true } },
        },
      }),
      db.conditionTemplate.findMany(),
    ])
    const templateMap = new Map(templates.map((t) => [t.key, t]))

    const results = runs.map((run) => {
      const dimension = isDimensionKey(run.dimension) ? run.dimension : 'VALIDITY'
      const template = templateMap.get(run.rule.condition)
      const engineType = template?.engineType ?? (isConditionKey(run.rule.condition) ? run.rule.condition : null)
      const status = run.status === 'PASSED' ? 'PASSED' : 'FAILED'
      const verdict = buildRuleVerdict({
        status,
        totalRows: run.totalRows,
        failedRows: run.failedRows,
        dimension,
        engineType: engineType ?? 'UNKNOWN',
      })
      return {
        runId: run.id,
        ruleId: run.ruleId,
        column: run.rule.column,
        condition: run.rule.condition,
        conditionName: template?.name ?? run.rule.condition,
        severity: run.rule.severity,
        dimension,
        clauseNo: Number(DAMA_CLAUSE_NO[dimension] ?? 0),
        sentence: buildRuleSentence({
          datasetName: batch.dataset.name,
          column: run.rule.column,
          condition: run.rule.condition,
          conditionSentence: template?.sentence,
          engineType: engineType ?? undefined,
          parameters: run.rule.parameters,
          severity: run.rule.severity,
          filter: run.rule.filter,
        }),
        verdict,
        advice: status === 'FAILED' && engineType ? fixHintFor(engineType, dimension) : null,
        status,
        totalRows: run.totalRows,
        failedRows: run.failedRows,
        passRate: run.passRate,
        failuresCount: run._count.failures,
      }
    })

    const grade = gradeOf(batch.overallScore)
    return NextResponse.json({
      batch: {
        id: batch.id,
        datasetId: batch.datasetId,
        datasetName: batch.dataset.name,
        triggeredBy: batch.triggeredBy,
        createdBy: batch.createdBy,
        totalRules: batch.totalRules,
        passedRules: batch.passedRules,
        failedRules: batch.failedRules,
        skippedRules: batch.skippedRules,
        overallScore: batch.overallScore,
        grade: grade
          ? { band: grade.band, label: grade.label, badgeClass: grade.badgeClass, textClass: grade.textClass }
          : null,
        createdAt: batch.createdAt.toISOString(),
      },
      results,
    })
  } catch (e) {
    console.error('GET /api/dq/validations/[id]', e)
    return NextResponse.json({ error: 'ไม่สามารถโหลดรายละเอียดรอบการตรวจได้' }, { status: 500 })
  }
}

const DAMA_CLAUSE_NO: Record<string, number> = {
  ACCURACY: 1,
  COMPLETENESS: 2,
  CONSISTENCY: 3,
  VALIDITY: 4,
  UNIQUENESS: 5,
  INTEGRITY: 6,
  TIMELINESS: 7,
  CURRENTNESS: 8,
  REASONABLENESS: 9,
}
