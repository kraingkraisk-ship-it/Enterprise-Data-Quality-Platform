// Public demo-IdP endpoint: returns the persona selector list (safe fields only).
// Production replaces this with an OIDC discovery/authorize flow — same contract.
import { db } from '@/lib/db'
import { json, fail, clientIp } from '@/lib/api-helpers'
import { rateLimit } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'

export async function GET(req: Request) {
  const limited = rateLimit(`personas:${clientIp(req)}`, 30)
  if (!limited.allowed) return fail(429, 'Too many requests. Please retry shortly.')
  try {
    const users = await db.user.findMany({
      where: { active: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true, name: true, nameTh: true, role: true, businessUnit: true,
        titleEn: true, titleTh: true, mfaEnabled: true, active: true, email: true,
      },
    })
    return json({ users })
  } catch (e) {
    logger.error('personas.failed', { error: e instanceof Error ? e.message : 'unknown' })
    return fail(500, 'Unable to load sign-in personas.')
  }
}
