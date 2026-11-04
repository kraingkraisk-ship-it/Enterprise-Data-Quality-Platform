// GET /api/notifications — current user's inbox (latest 20).
import { db } from '@/lib/db'
import { guard, guardBlocked, json } from '@/lib/api-helpers'

export async function GET(req: Request) {
  const g = await guard(req, {})
  if (guardBlocked(g)) return g
  const rows = await db.notification.findMany({
    where: { userId: g.user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  return json({
    notifications: rows.map((n) => ({
      id: n.id, titleEn: n.titleEn, titleTh: n.titleTh,
      bodyEn: n.bodyEn, bodyTh: n.bodyTh, severity: n.severity,
      readAt: n.readAt?.toISOString() ?? null, link: n.link,
      createdAt: n.createdAt.toISOString(),
    })),
  })
}
