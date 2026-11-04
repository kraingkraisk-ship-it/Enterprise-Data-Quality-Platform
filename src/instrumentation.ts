// Next.js instrumentation hook — boots the in-process background worker
// heartbeat (job poller) when the server runs on the nodejs runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startWorkerHeartbeat } = await import('./lib/jobs/runner')
    startWorkerHeartbeat()
  }
}
