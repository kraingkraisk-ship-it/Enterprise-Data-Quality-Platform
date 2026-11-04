// /api/admin/policy — GET all settings, POST upsert (ADMIN_POLICY, audited).
import { z } from 'zod'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { POLICY_DEFAULTS } from '@/lib/types'
import { guard, guardBlocked, fail, json, clientIp } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, { permission: 'ADMIN_POLICY' })
  if (guardBlocked(g)) return g
  const rows = await db.policySetting.findMany({ orderBy: { key: 'asc' } })
  return json({
    settings: rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedBy: r.updatedBy,
      updatedAt: r.updatedAt.toISOString(),
      descriptionEn: r.descriptionEn,
      descriptionTh: r.descriptionTh,
    })),
  })
}

const postSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
})

export async function POST(req: Request) {
  const g = await guard(req, { permission: 'ADMIN_POLICY' })
  if (guardBlocked(g)) return g
  const { user } = g
  let parsed
  try {
    parsed = postSchema.safeParse(await req.json())
  } catch {
    return fail(400, 'Invalid JSON body')
  }
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? 'Invalid body')
  const { key, value } = parsed.data
  const before = await db.policySetting.findUnique({ where: { key } })
  const previous = before?.value ?? POLICY_DEFAULTS[key] ?? null
  const setting = await db.policySetting.upsert({
    where: { key },
    create: { key, value: value as object, updatedBy: user.name },
    update: { value: value as object, updatedBy: user.name },
  })
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'POLICY_UPDATE',
    resourceType: 'PolicySetting', resourceId: key,
    detail: { from: previous, to: value },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return json({ ok: true, setting: { key: setting.key, value: setting.value, updatedBy: setting.updatedBy, updatedAt: setting.updatedAt.toISOString() } })
}
