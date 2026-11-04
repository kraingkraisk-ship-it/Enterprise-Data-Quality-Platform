// GET /api/reports/download/[id] — permission-checked CSV download (attachment).
import { readFile, stat } from 'fs/promises'
import { basename, join } from 'path'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import {
  guard, guardBlocked, fail, json, clientIp, datasetVisible, notFoundRes,
} from '@/lib/api-helpers'

export const EXPORTS_DIR = join(process.cwd(), 'db', 'exports')

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(req, { permission: 'EXPORT_REPORT' })
  if (guardBlocked(g)) return g
  const { user } = g
  const { id } = await params
  const file = await db.fileUpload.findUnique({ where: { id } })
  if (!file || file.status === 'REJECTED' || file.status === 'QUARANTINED') return notFoundRes()
  if (file.datasetId) {
    const dataset = await db.dataset.findUnique({
      where: { id: file.datasetId },
      select: { id: true, ownerId: true, stewardId: true },
    })
    if (!dataset || !(await datasetVisible(user, dataset))) return notFoundRes()
  }
  // storedName is absolute; resolve through basename to make traversal impossible
  const safeName = basename(file.storedName)
  const filePath = join(EXPORTS_DIR, safeName)
  try {
    await stat(filePath)
  } catch {
    return fail(404, 'Export file is no longer available (retention expired)')
  }
  const content = await readFile(filePath)
  await recordAudit({
    actor: user.name, actorRole: user.role, action: 'EXPORT',
    resourceType: 'FileDownload', resourceId: file.id, datasetId: file.datasetId,
    detail: { download: true, fileId: file.id, originalName: file.originalName },
    ip: clientIp(req), userAgent: req.headers.get('user-agent'),
  })
  return new Response(new Uint8Array(content), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${file.originalName.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
