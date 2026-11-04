// PII masking — applied by default in UI payloads, logs and evidence.
// Policy modes: FULL (default) | PARTIAL — 'NONE' is rejected for PII fields.
export type MaskMode = 'FULL' | 'PARTIAL'

const EMAIL_RE = /^(.{1,3})(.*?)(@.*)$/
const PHONE_RE = /(\d{2,3})\d{4,5}(\d{3})/
const ID13_RE = /^(\d{2})\d{8}(\d{3})$/

export function maskEmail(v: string, mode: MaskMode = 'FULL'): string {
  if (EMAIL_RE.test(v)) {
    const m = v.match(EMAIL_RE)!
    return mode === 'FULL' ? `${'*'.repeat(5)}${m[3]}` : `${m[1]}${'*'.repeat(Math.max(3, m[2].length))}${m[3]}`
  }
  return '•••••'
}

export function maskPhone(v: string, mode: MaskMode = 'FULL'): string {
  const digits = v.replace(/\D/g, '')
  if (PHONE_RE.test(digits)) {
    const m = digits.match(PHONE_RE)!
    return mode === 'FULL' ? `${m[1]}-•••••-${m[2]}` : `${m[1]}-${'*'.repeat(4)}-${m[2]}`
  }
  return '•••••••••'
}

export function maskId13(v: string): string {
  if (ID13_RE.test(v)) {
    const m = v.match(ID13_RE)!
    return `${m[1]}••••••••${m[2]}`
  }
  return '•••••••••••••'
}

export function maskName(v: string, mode: MaskMode = 'FULL'): string {
  const parts = v.trim().split(/\s+/)
  if (parts.length === 1) return mode === 'FULL' ? '••••' : `${parts[0][0]}•••`
  const first = mode === 'FULL' ? '••••' : `${parts[0][0]}•••`
  const last = mode === 'FULL' ? '••••' : `${parts[parts.length - 1][0]}•••`
  return `${first} ${last}`
}

export function maskGeneric(v: string, visible = 2): string {
  const s = String(v)
  if (s.length <= visible) return '•'.repeat(Math.max(4, s.length))
  return `${s.slice(0, visible)}${'•'.repeat(Math.max(4, s.length - visible))}`
}

export function maskAccount(v: string): string {
  const digits = v.replace(/\D/g, '')
  if (digits.length >= 6) return `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`
  return '••••••'
}

/** Mask a value according to its declared PII type. Non-PII values pass through unchanged. */
export function maskByPiiType(piiType: string | null | undefined, value: string, mode: MaskMode = 'FULL'): string {
  if (value == null || value === '') return value ?? ''
  switch (piiType) {
    case 'EMAIL': return maskEmail(value, mode)
    case 'PHONE': return maskPhone(value, mode)
    case 'ID_CARD': return maskId13(value)
    case 'NAME': return maskName(value, mode)
    case 'ACCOUNT': return maskAccount(value)
    default: return value
  }
}

/** Neutralise CSV/Excel formula injection when displaying or exporting cell values. */
export function sanitizeFormulaInjection(v: string): string {
  if (/^[=+\-@\t\r]/.test(v)) return `'${v}`
  return v
}
