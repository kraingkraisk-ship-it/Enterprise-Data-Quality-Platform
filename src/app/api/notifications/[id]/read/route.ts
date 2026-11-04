// POST /api/notifications/[id]/read — mark own notification as read.
import { db } from '@/lib/db'
import { guard, guardBlocked, json, notFoundRes } from '@/lib/api-helpers'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, {})
  if (guardBlocked(g)) return g
  const { id } = await params
  const notification = await db.notification.findUnique({ where: { id } })
  if (!notification || notification.userId !== g.user.id) return notFoundRes()
  if (!notification.readAt) {
    await db.notification.update({ where: { id }, data: { readAt: new Date() } })
  }
  return json({ ok: true })
}
