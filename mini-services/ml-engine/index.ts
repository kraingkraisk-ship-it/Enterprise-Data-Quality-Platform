/**
 * mini-service: ml-engine (v0.37.0) — เอนจิน scikit-learn ของ ML Studio
 * พอร์ตคงที่ 3020 · รันด้วย `bun --hot index.ts` (รีสตาร์ตอัตโนมัติเมื่อแก้ไฟล์)
 * การเรียก: เฉพาะฝั่ง server ของ Next.js เรียกตรง http://127.0.0.1:3020 (เบราว์เซอร์ไม่เรียกเอง)
 *   GET  /health  → สถานะบริการ + เวอร์ชัน scikit-learn
 *   POST /train   → { modelKey, train: [{features,y}], test: [...], randomState }
 *   POST /predict → { modelKey, rows: [features...] } → { probabilities }
 * คุณลักษณะ (features) สร้างฝั่งแพลตฟอร์มจาก Data Asset + กฎ DQ — เอนจินเรียนรู้จากเวกเตอร์ล้วน
 * (หลักการ train/test จาก Data Asset + DQ Rule อยู่ที่แพลตฟอร์ม — บริการนี้เป็นตัวเรียนรู้)
 */

const PORT = 3020
const PYTHON_CANDIDATES = ['/home/z/.venv/bin/python3', 'python3', '/usr/bin/python3']
let pythonBin: string | null = null
let cachedSklearnVersion: string | null | undefined

interface PyResult {
  ok?: boolean
  error?: string
  detail?: string
  [key: string]: unknown
}

/** ส่ง JSON ให้สคริปต์ python (ลองหาตัวแปลงที่ใช้ได้เอง — รองรับทั้ง venv และ system python) */
async function runPython(script: string, payload: unknown): Promise<PyResult> {
  const candidates = pythonBin ? [pythonBin] : PYTHON_CANDIDATES
  let lastError = 'unknown'
  for (const bin of candidates) {
    try {
      const proc = Bun.spawn([bin, script], { cwd: import.meta.dir, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
      proc.stdin.write(JSON.stringify(payload))
      await proc.stdin.end()
      const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
      if (code !== 0) {
        lastError = err.trim().slice(-400) || `exit code ${code}`
        continue
      }
      pythonBin = bin
      return JSON.parse(out) as PyResult
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastError)
}

const jsonError = (message: string, status = 500) => Response.json({ ok: false, error: message }, { status })

async function handleTrain(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { modelKey?: string; train?: unknown; test?: unknown; randomState?: number } | null
  if (!body || typeof body.modelKey !== 'string' || !Array.isArray(body.train) || body.train.length === 0) {
    return jsonError('BAD_REQUEST: ต้องมี modelKey และ train (รายการเวกเตอร์คุณลักษณะ + ป้าย)', 400)
  }
  try {
    const result = await runPython('train.py', body)
    return Response.json(result)
  } catch (e) {
    return jsonError(`TRAIN_FAILED: ${e instanceof Error ? e.message : 'unknown'}`)
  }
}

async function handlePredict(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { modelKey?: string; rows?: unknown } | null
  if (!body || typeof body.modelKey !== 'string' || !Array.isArray(body.rows)) {
    return jsonError('BAD_REQUEST: ต้องมี modelKey และ rows (รายการเวกเตอร์คุณลักษณะ)', 400)
  }
  try {
    const result = await runPython('predict.py', body)
    return Response.json(result)
  } catch (e) {
    return jsonError(`PREDICT_FAILED: ${e instanceof Error ? e.message : 'unknown'}`)
  }
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/health') {
      if (cachedSklearnVersion === undefined) {
        const info = await runPython('version.py', {}).catch(() => null)
        cachedSklearnVersion = typeof info?.version === 'string' ? info.version : null
      }
      return Response.json({
        ok: true,
        service: 'ml-engine',
        engine: 'scikit-learn',
        estimator: 'LogisticRegression',
        sklearnVersion: cachedSklearnVersion,
        python: pythonBin,
      })
    }
    if (req.method === 'POST' && url.pathname === '/train') return handleTrain(req)
    if (req.method === 'POST' && url.pathname === '/predict') return handlePredict(req)
    return jsonError('NOT_FOUND', 404)
  },
})

console.log(`[ml-engine] scikit-learn engine listening on http://127.0.0.1:${PORT}`)
