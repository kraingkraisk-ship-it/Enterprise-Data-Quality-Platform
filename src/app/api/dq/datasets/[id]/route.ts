import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveOperator } from '@/lib/operator'

/**
 * PATCH /api/dq/datasets/[id] — จัดการชุดข้อมูลโมดูล DQ (deny-by-default)
 *   body: { operatorEmail, action: 'SET_DOMAIN', domainId }
 *   - SET_DOMAIN: ผูก/ย้ายชุดข้อมูลเข้าโดเมน (domainId ว่าง = นำออกจากโดเมน)
 * สิทธิ์: MANAGE_DATASETS — ทุกการเปลี่ยนแปลงบันทึก Audit Trail
 */
type Body = { action?: string; operatorEmail?: string; domainId?: string }

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = (await req.json().catch(() => null)) as Body | null
    if (!body) return NextResponse.json({ error: 'รูปแบบข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const op = await resolveOperator(body.operatorEmail, 'MANAGE_DATASETS')
    if (!op.ok) return NextResponse.json({ error: op.message }, { status: op.status })

    const action = String(body.action ?? '').trim().toUpperCase()
    if (action !== 'SET_DOMAIN') {
      return NextResponse.json({ error: 'การดำเนินการไม่ถูกต้อง (SET_DOMAIN)' }, { status: 400 })
    }

    const dataset = await db.dataset.findUnique({
      where: { id },
      include: { domain: { select: { name: true } } },
    })
    if (!dataset) return NextResponse.json({ error: 'ไม่พบชุดข้อมูลนี้ในระบบ' }, { status: 404 })

    const domainIdRaw = String(body.domainId ?? '').trim()
    let domainName: string | null = null
    if (domainIdRaw) {
      const domain = await db.dataDomain.findUnique({ where: { id: domainIdRaw }, select: { id: true, name: true } })
      if (!domain) return NextResponse.json({ error: 'ไม่พบโดเมนข้อมูลที่ระบุ' }, { status: 404 })
      domainName = domain.name
    }

    if ((dataset.domain?.name ?? null) === domainName) {
      return NextResponse.json({ error: 'ชุดข้อมูลนี้อยู่ในโดเมนนี้อยู่แล้ว' }, { status: 409 })
    }

    await db.dataset.update({ where: { id }, data: { domainId: domainIdRaw || null } })
    await db.auditLog.create({
      data: {
        action: 'SET_DATASET_DOMAIN',
        actor: op.ctx.email,
        target: dataset.name,
        detail: `จัดชุดข้อมูล "${dataset.name}" ${
          domainName
            ? `เข้าโดเมน "${domainName}"${dataset.domain?.name ? ` (เดิม: "${dataset.domain.name}")` : ''}`
            : `ออกจากโดเมน${dataset.domain?.name ? ` (เดิม: "${dataset.domain.name}")` : ''}`
        } โดย ${op.ctx.name} (บทบาท ${op.ctx.roleTh})`,
      },
    })

    return NextResponse.json({
      ok: true,
      message: domainName ? `จัด "${dataset.name}" เข้าโดเมน "${domainName}" เรียบร้อย` : `นำ "${dataset.name}" ออกจากโดเมนแล้ว`,
    })
  } catch (e) {
    console.error('PATCH /api/dq/datasets/[id]', e)
    return NextResponse.json({ error: 'จัดการชุดข้อมูลไม่สำเร็จ' }, { status: 500 })
  }
}
