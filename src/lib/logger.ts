// Structured JSON logging (correlation-id aware). Never log PII or secrets —
// values must be masked via src/lib/masking.ts before calling log helpers.
type Level = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(), level, service: 'edqp-api', msg,
    ...fields,
  })
  if (level === 'ERROR') console.error(line)
  else if (level === 'WARN') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('DEBUG', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('INFO', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('WARN', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('ERROR', msg, fields),
}

export function newCorrelationId(): string {
  return `corr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
