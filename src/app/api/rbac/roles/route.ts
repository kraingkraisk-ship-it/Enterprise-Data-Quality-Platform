import { NextResponse } from 'next/server'
import { PERMISSION_LABELS, ROLE_LIST } from '@/lib/rbac'

export async function GET() {
  return NextResponse.json({
    roles: ROLE_LIST,
    permissions: PERMISSION_LABELS,
  })
}
