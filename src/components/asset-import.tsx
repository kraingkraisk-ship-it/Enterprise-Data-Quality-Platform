'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FileUp,
  Info,
  Loader2,
  Lock,
  PackageSearch,
  Plug,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { parseCsv, parseJsonData } from '@/lib/asset'
import { ROLES } from '@/lib/rbac'

/* ------------------------------------------------------------------ */
/* Import Data — นำเข้าข้อมูลจาก CSV / JSON / Database                  */
/* ผู้ใช้ตั้งชื่อ Data Asset เองได้ + พรีวิวก่อนบันทึกจริง               */
/* ------------------------------------------------------------------ */

type SourceType = 'CSV' | 'JSON' | 'DATABASE'
type DbMode = 'table' | 'query'

interface AssetUser {
  email: string
  name: string
  role: string
}

const IMPORTABLE_ROLES = ['DATA_OWNER', 'DATA_STEWARD', 'DATA_ENGINEER', 'SYS_ADMIN']

const SOURCE_CARDS: Array<{ type: SourceType; th: string; en: string; desc: string; icon: typeof FileSpreadsheet }> = [
  { type: 'CSV', th: 'ไฟล์ CSV', en: 'CSV File', desc: 'อัปโหลดหรือวางเนื้อหา CSV — ตรวจหาตัวคั่นอัตโนมัติ', icon: FileSpreadsheet },
  { type: 'JSON', th: 'ไฟล์ JSON', en: 'JSON File', desc: 'อัปโหลดหรือวาง JSON — รองรับอาร์เรย์/วัตถุซ้อน', icon: Braces },
  { type: 'DATABASE', th: 'ฐานข้อมูล', en: 'Database', desc: 'เชื่อมต่อ MySQL / PostgreSQL อ่านเฉพาะ SELECT', icon: Database },
]

const DB_TYPE_PORTS: Record<string, number> = { MYSQL: 3306, POSTGRESQL: 5432 }

export function AssetImport({ onGoInventory }: { onGoInventory?: () => void }) {
  const { toast } = useToast()
  const csvFileRef = useRef<HTMLInputElement>(null)
  const jsonFileRef = useRef<HTMLInputElement>(null)

  const [sourceType, setSourceType] = useState<SourceType>('CSV')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [operatorEmail, setOperatorEmail] = useState('preecha.engineer@company.co.th')
  const [users, setUsers] = useState<AssetUser[]>([])

  // CSV / JSON — เนื้อหาไฟล์ (อ่านเป็นข้อความ) + ชื่อไฟล์
  const [csvText, setCsvText] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [jsonFileName, setJsonFileName] = useState('')

  // Database
  const [dbType, setDbType] = useState<'MYSQL' | 'POSTGRESQL'>('MYSQL')
  const [dbHost, setDbHost] = useState('')
  const [dbPort, setDbPort] = useState('3306')
  const [dbName, setDbName] = useState('')
  const [dbUser, setDbUser] = useState('')
  const [dbPass, setDbPass] = useState('')
  const [dbMode, setDbMode] = useState<DbMode>('table')
  const [dbTable, setDbTable] = useState('')
  const [dbQuery, setDbQuery] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; tables: string[] } | null>(null)

  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ name: string; rowCount: number; columnCount: number; note: string } | null>(null)

  /* ------------------------- users + operator ------------------------- */
  useEffect(() => {
    let alive = true
    fetch('/api/rbac/users')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return
        const list: AssetUser[] = (d?.users ?? []).filter((u: AssetUser & { status?: string }) => u.status === 'ACTIVE')
        setUsers(list)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const operators = useMemo(
    () => users.filter((u) => IMPORTABLE_ROLES.includes(u.role)),
    [users],
  )

  /* ------------------------- client-side preview ------------------------- */
  const csvPreview = useMemo(() => {
    if (sourceType !== 'CSV' || !csvText.trim()) return null
    try {
      const parsed = parseCsv(csvText)
      return { columns: parsed.columns, rows: parsed.rows.slice(0, 5), total: parsed.rows.length, skipped: parsed.skippedRows }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'CSV ไม่ถูกต้อง' }
    }
  }, [sourceType, csvText])

  const jsonPreview = useMemo(() => {
    if (sourceType !== 'JSON' || !jsonText.trim()) return null
    try {
      const parsed = parseJsonData(jsonText)
      return { columns: parsed.columns, rows: parsed.rows.slice(0, 5), total: parsed.rows.length, shape: parsed.shape }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'JSON ไม่ถูกต้อง' }
    }
  }, [sourceType, jsonText])

  /* ------------------------- file reading ------------------------- */
  const readFile = useCallback(
    (file: File, kind: 'csv' | 'json') => {
      if (file.size > 8 * 1024 * 1024) {
        toast({ title: 'ไฟล์ใหญ่เกิน 8MB', variant: 'destructive' })
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? '')
        if (kind === 'csv') {
          setCsvText(text)
          setCsvFileName(file.name)
          if (!name.trim()) setName(file.name.replace(/\.(csv|txt)$/i, ''))
        } else {
          setJsonText(text)
          setJsonFileName(file.name)
          if (!name.trim()) setName(file.name.replace(/\.json$/i, ''))
        }
      }
      reader.readAsText(file, 'utf-8')
    },
    [name, toast],
  )

  /* ------------------------- db port sync ------------------------- */
  function changeDbType(t: 'MYSQL' | 'POSTGRESQL') {
    setDbType(t)
    setDbPort(String(DB_TYPE_PORTS[t] ?? 3306))
    setTestResult(null)
  }

  /* ------------------------- test connection ------------------------- */
  async function testConnection() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/assets/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorEmail,
          dbType,
          host: dbHost,
          port: Number(dbPort),
          database: dbName,
          username: dbUser,
          password: dbPass,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTestResult({ ok: false, message: data.error ?? `HTTP ${res.status}`, tables: [] })
      } else {
        setTestResult({ ok: true, message: data.message ?? 'เชื่อมต่อสำเร็จ', tables: data.tables ?? [] })
      }
    } catch {
      setTestResult({ ok: false, message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', tables: [] })
    } finally {
      setTesting(false)
    }
  }

  /* ------------------------- import ------------------------- */
  async function doImport() {
    const body: Record<string, unknown> = {
      operatorEmail,
      name: name.trim(),
      description: description.trim(),
      sourceType,
    }
    if (sourceType === 'CSV') {
      body.csvText = csvText
      body.fileName = csvFileName
    } else if (sourceType === 'JSON') {
      body.jsonText = jsonText
      body.fileName = jsonFileName
    } else {
      body.dbType = dbType
      body.host = dbHost.trim()
      body.port = Number(dbPort)
      body.database = dbName.trim()
      body.username = dbUser.trim()
      body.password = dbPass
      if (dbMode === 'table') body.tableName = dbTable.trim()
      else body.query = dbQuery.trim()
    }

    setImporting(true)
    try {
      const res = await fetch('/api/assets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'นำเข้าไม่สำเร็จ', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' })
        return
      }
      setImportResult({ name: data.asset.name, rowCount: data.asset.rowCount, columnCount: data.asset.columnCount, note: data.note ?? '' })
      toast({ title: 'นำเข้าสำเร็จ', description: data.message })
      setName('')
      setDescription('')
      setCsvText('')
      setCsvFileName('')
      setJsonText('')
      setJsonFileName('')
      if (csvFileRef.current) csvFileRef.current.value = ''
      if (jsonFileRef.current) jsonFileRef.current.value = ''
    } catch {
      toast({ title: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  const canImport =
    name.trim().length > 0 &&
    ((sourceType === 'CSV' && csvText.trim().length > 0) ||
      (sourceType === 'JSON' && jsonText.trim().length > 0) ||
      (sourceType === 'DATABASE' && dbHost.trim() && dbName.trim() && dbUser.trim() && (dbMode === 'table' ? dbTable.trim() : dbQuery.trim())))

  const preview = sourceType === 'CSV' ? csvPreview : sourceType === 'JSON' ? jsonPreview : null

  return (
    <div className="space-y-5">
      {/* ------------------------- หัวหน้า ------------------------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">นำเข้าข้อมูล (Import Data)</h2>
          <p className="text-sm text-muted-foreground">
            นำเข้าข้อมูลจากไฟล์ CSV, ไฟล์ JSON หรือฐานข้อมูล — ตั้งชื่อ Data Asset ได้เอง แล้วใช้งานได้ในคลังข้อมูลทันที
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-800">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          RBAC · Audit Trail
        </Badge>
      </div>

      {/* ------------------------- ผลนำเข้าล่าสุด ------------------------- */}
      {importResult && (
        <Card className="border-emerald-200 bg-emerald-50/60">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-900">
                นำเข้า &quot;{importResult.name}&quot; สำเร็จ — {importResult.rowCount.toLocaleString()} แถว / {importResult.columnCount} คอลัมน์
                {importResult.note ? ` (${importResult.note})` : ''}
              </p>
              <p className="text-xs text-emerald-800/80">ดูข้อมูลได้ในหน้าคลังข้อมูล (Data Inventory)</p>
            </div>
            {onGoInventory && (
              <Button size="sm" variant="outline" className="border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100" onClick={onGoInventory}>
                <PackageSearch className="size-4" aria-hidden="true" />
                ไปที่คลังข้อมูล
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* ------------------------- ฟอร์มหลัก ------------------------- */}
        <div className="space-y-5 lg:col-span-3">
          {/* ขั้นที่ 1 เลือกแหล่งข้อมูล */}
          <Card>
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
              <CardTitle className="text-sm sm:text-base">1 · เลือกแหล่งข้อมูล</CardTitle>
              <CardDescription className="text-xs sm:text-sm">รองรับ 3 รูปแบบ — เลือกแบบที่ตรงกับข้อมูลของคุณ</CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-2 sm:p-6 sm:pt-2">
              <RadioGroup
                value={sourceType}
                onValueChange={(v) => setSourceType(v as SourceType)}
                className="grid gap-3 sm:grid-cols-3"
                aria-label="แหล่งข้อมูล"
              >
                {SOURCE_CARDS.map((c) => (
                  <Label
                    key={c.type}
                    htmlFor={`src-${c.type}`}
                    className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                      sourceType === c.type ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'hover:bg-muted/50'
                    }`}
                  >
                    <RadioGroupItem id={`src-${c.type}`} value={c.type} className="sr-only" />
                    <c.icon className={`mb-1.5 size-5 ${sourceType === c.type ? 'text-emerald-600' : 'text-muted-foreground'}`} aria-hidden="true" />
                    <span className="block text-sm font-medium">{c.th}</span>
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">{c.en}</span>
                    <span className="mt-1 block text-xs leading-snug text-muted-foreground">{c.desc}</span>
                  </Label>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* ขั้นที่ 2 ตั้งชื่อ */}
          <Card>
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
              <CardTitle className="text-sm sm:text-base">2 · ตั้งชื่อ Data Asset</CardTitle>
              <CardDescription className="text-xs sm:text-sm">ชื่อนี้จะแสดงในคลังข้อมูล — ตั้งให้สื่อความหมายกับทีม</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 p-4 pt-2 sm:p-6 sm:pt-2">
              <div className="grid gap-1.5">
                <Label htmlFor="asset-name">
                  ชื่อ Data Asset <span className="text-rose-600">*</span>
                </Label>
                <Input
                  id="asset-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="เช่น ทะเบียนลูกค้าสาขาภาคเหนือ"
                  maxLength={120}
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="asset-desc">คำอธิบาย (ไม่บังคับ)</Label>
                <Input
                  id="asset-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="อธิบายที่มา/วัตถุประสงค์ของชุดข้อมูลสั้น ๆ"
                  maxLength={500}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="asset-operator">
                  ผู้ดำเนินการนำเข้า <span className="text-rose-600">*</span>
                </Label>
                <Select value={operatorEmail} onValueChange={setOperatorEmail}>
                  <SelectTrigger id="asset-operator" className="w-full sm:max-w-md">
                    <SelectValue placeholder="เลือกบัญชีผู้ดำเนินการ" />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((u) => (
                      <SelectItem key={u.email} value={u.email}>
                        {u.name} · {ROLES[u.role as keyof typeof ROLES]?.th ?? u.role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">เฉพาะบทบาทที่มีสิทธิ์จัดการข้อมูล (ตาม RBAC) — ทุกการนำเข้าถูกบันทึก Audit Trail</p>
              </div>
            </CardContent>
          </Card>

          {/* ขั้นที่ 3 ข้อมูลตามแหล่ง */}
          <Card>
            <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-2">
              <CardTitle className="text-sm sm:text-base">
                3 · {sourceType === 'CSV' ? 'เนื้อหาไฟล์ CSV' : sourceType === 'JSON' ? 'เนื้อหาไฟล์ JSON' : 'การเชื่อมต่อฐานข้อมูล'}
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                {sourceType === 'DATABASE'
                  ? 'ระบบเชื่อมต่อเพื่อ "อ่าน" ข้อมูลเท่านั้น — อนุญาตเฉพาะคำสั่ง SELECT (deny-by-default)'
                  : 'แนบไฟล์หรือวางเนื้อหาลงช่องข้อความได้ทั้งสองวิธี (สูงสุด 8MB)'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 p-4 pt-2 sm:p-6 sm:pt-2">
              {sourceType === 'CSV' && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" className="h-auto justify-start gap-2 py-3" onClick={() => csvFileRef.current?.click()}>
                      <UploadCloud className="size-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 text-left">
                        <span className="block text-sm font-medium">เลือกไฟล์ CSV</span>
                        <span className="block truncate text-xs text-muted-foreground">{csvFileName || 'ยังไม่ได้เลือกไฟล์'}</span>
                      </span>
                    </Button>
                    <input
                      ref={csvFileRef}
                      type="file"
                      accept=".csv,.txt,text/csv,text/plain"
                      className="hidden"
                      aria-label="เลือกไฟล์ CSV"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) readFile(f, 'csv')
                      }}
                    />
                    <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                      <p className="flex items-center gap-1.5 font-medium text-foreground">
                        <Info className="size-3.5" aria-hidden="true" /> ระบบรองรับอัตโนมัติ
                      </p>
                      <p className="mt-1 leading-relaxed">ตัวคั่น , ; Tab | · เครื่องหมายคำพูด &quot;...&quot; · ขึ้นบรรทัดใหม่ทั้ง LF และ CRLF · แถวแรกคือหัวคอลัมน์</p>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="csv-text">หรือวางเนื้อหา CSV</Label>
                    <Textarea
                      id="csv-text"
                      value={csvText}
                      onChange={(e) => {
                        setCsvText(e.target.value)
                        setCsvFileName('')
                      }}
                      placeholder={'customer_id,name,email,balance\nC-001,สมชาย,somchai@mail.com,15000'}
                      className="min-h-36 font-mono text-xs"
                    />
                  </div>
                </>
              )}

              {sourceType === 'JSON' && (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button type="button" variant="outline" className="h-auto justify-start gap-2 py-3" onClick={() => jsonFileRef.current?.click()}>
                      <UploadCloud className="size-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 text-left">
                        <span className="block text-sm font-medium">เลือกไฟล์ JSON</span>
                        <span className="block truncate text-xs text-muted-foreground">{jsonFileName || 'ยังไม่ได้เลือกไฟล์'}</span>
                      </span>
                    </Button>
                    <input
                      ref={jsonFileRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      aria-label="เลือกไฟล์ JSON"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) readFile(f, 'json')
                      }}
                    />
                    <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                      <p className="flex items-center gap-1.5 font-medium text-foreground">
                        <Info className="size-3.5" aria-hidden="true" /> รูปทรงที่รองรับ
                      </p>
                      <p className="mt-1 leading-relaxed">อาร์เรย์ของวัตถุ · วัตถุเดียว · วัตถุที่มีอาร์เรย์ข้างใน · คีย์ซ้อนจะถูกแบนราบเป็นคอลัมน์</p>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="json-text">หรือวางเนื้อหา JSON</Label>
                    <Textarea
                      id="json-text"
                      value={jsonText}
                      onChange={(e) => {
                        setJsonText(e.target.value)
                        setJsonFileName('')
                      }}
                      placeholder={'[\n  { "id": "C-001", "name": "สมชาย", "balance": 15000 }\n]'}
                      className="min-h-36 font-mono text-xs"
                    />
                  </div>
                </>
              )}

              {sourceType === 'DATABASE' && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="db-type">ชนิดฐานข้อมูล</Label>
                      <Select value={dbType} onValueChange={(v) => changeDbType(v as 'MYSQL' | 'POSTGRESQL')}>
                        <SelectTrigger id="db-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MYSQL">MySQL / MariaDB</SelectItem>
                          <SelectItem value="POSTGRESQL">PostgreSQL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="db-host">Host</Label>
                      <Input id="db-host" value={dbHost} onChange={(e) => setDbHost(e.target.value)} placeholder="db.internal.company.co.th" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="db-port">Port</Label>
                      <Input id="db-port" value={dbPort} onChange={(e) => setDbPort(e.target.value)} inputMode="numeric" placeholder="3306" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="db-name">ชื่อฐานข้อมูล (Database)</Label>
                      <Input id="db-name" value={dbName} onChange={(e) => setDbName(e.target.value)} placeholder="core_banking" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="db-user">Username</Label>
                      <Input id="db-user" value={dbUser} onChange={(e) => setDbUser(e.target.value)} placeholder="readonly_user" autoComplete="off" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="db-pass">Password</Label>
                      <Input id="db-pass" type="password" value={dbPass} onChange={(e) => setDbPass(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-3">
                    <RadioGroup value={dbMode} onValueChange={(v) => setDbMode(v as DbMode)} className="flex flex-wrap gap-3" aria-label="วิธีเลือกข้อมูลจากฐานข้อมูล">
                      <Label htmlFor="db-mode-table" className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[[data-state=checked]]:border-emerald-500 has-[[data-state=checked]]:bg-emerald-50">
                        <RadioGroupItem id="db-mode-table" value="table" /> เลือกตาราง (Table)
                      </Label>
                      <Label htmlFor="db-mode-query" className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[[data-state=checked]]:border-emerald-500 has-[[data-state=checked]]:bg-emerald-50">
                        <RadioGroupItem id="db-mode-query" value="query" /> คำสั่ง SQL (SELECT เท่านั้น)
                      </Label>
                    </RadioGroup>

                    {dbMode === 'table' ? (
                      <div className="grid gap-1.5">
                        <Label htmlFor="db-table">ชื่อตาราง</Label>
                        <Input id="db-table" value={dbTable} onChange={(e) => setDbTable(e.target.value)} placeholder="customer_master" />
                        {testResult?.ok && testResult.tables.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1.5 rounded-lg border bg-muted/30 p-2" role="list" aria-label="ตารางที่พบ">
                            {testResult.tables.slice(0, 30).map((t) => (
                              <button
                                key={t}
                                type="button"
                                role="listitem"
                                className="rounded-md border bg-white px-2 py-1 font-mono text-xs hover:border-emerald-400 hover:bg-emerald-50"
                                onClick={() => setDbTable(t)}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-1.5">
                        <Label htmlFor="db-query">คำสั่ง SQL (อ่านอย่างเดียว)</Label>
                        <Textarea
                          id="db-query"
                          value={dbQuery}
                          onChange={(e) => setDbQuery(e.target.value)}
                          placeholder={'SELECT customer_id, name, balance\nFROM customer_master\nWHERE branch = "เชียงใหม่"'}
                          className="min-h-28 font-mono text-xs"
                        />
                        <p className="flex items-start gap-1.5 text-xs text-amber-700">
                          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          อนุญาตเฉพาะ SELECT/WITH คำสั่งเดียว — คำสั่งเปลี่ยนข้อมูลถูกปฏิเสธทั้งหมด (deny-by-default) และระบบจะจำกัดผลลัพธ์ 1,000 แถวอัตโนมัติ
                        </p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="outline" onClick={testConnection} disabled={testing || !dbHost.trim() || !dbName.trim() || !dbUser.trim()}>
                        {testing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Plug className="size-4" aria-hidden="true" />}
                        ทดสอบการเชื่อมต่อ
                      </Button>
                      {testResult && (
                        <p className={`flex min-w-0 items-center gap-1.5 text-xs ${testResult.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {testResult.ok ? <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" /> : <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />}
                          <span className="min-w-0 break-words">{testResult.message}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* พรีวิว CSV / JSON */}
              {preview && 'error' in preview && (
                <p className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden="true" /> {preview.error}
                </p>
              )}
              {preview && !('error' in preview) && (
                <div className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      พรีวิว — พบ {preview.total.toLocaleString()} แถว / {preview.columns.length} คอลัมน์
                      {sourceType === 'JSON' && 'shape' in preview ? ` · ${preview.shape}` : ''}
                    </p>
                    {'skipped' in preview && preview.skipped > 0 && (
                      <Badge variant="outline" className="text-[10px] text-amber-700">
                        ข้ามแถวว่าง {preview.skipped}
                      </Badge>
                    )}
                  </div>
                  <div className="max-h-56 overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white">
                        <TableRow>
                          {preview.columns.slice(0, 8).map((c) => (
                            <TableHead key={c} className="whitespace-nowrap text-xs">
                              {c}
                            </TableHead>
                          ))}
                          {preview.columns.length > 8 && <TableHead className="text-xs text-muted-foreground">+{preview.columns.length - 8} คอลัมน์…</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.rows.map((row, i) => (
                          <TableRow key={i}>
                            {preview.columns.slice(0, 8).map((c) => (
                              <TableCell key={c} className="max-w-48 truncate text-xs">
                                {String(row[c] ?? '')}
                              </TableCell>
                            ))}
                            {preview.columns.length > 8 && <TableCell className="text-xs text-muted-foreground">…</TableCell>}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* ปุ่มนำเข้า */}
              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                <Button type="button" onClick={doImport} disabled={!canImport || importing} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  {importing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileUp className="size-4" aria-hidden="true" />}
                  นำเข้าข้อมูล
                </Button>
                <p className="text-xs text-muted-foreground">จำกัดการนำเข้า: สูงสุด 1,000 แถว / 100 คอลัมน์ ต่อครั้ง — ข้อมูลจะถูกบันทึกในคลังข้อมูลของแพลตฟอร์ม</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ------------------------- แถบช่วยเหลือขวา ------------------------- */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">ขั้นตอนการนำเข้า</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-0 text-sm">
              {[
                { n: 1, t: 'เลือกแหล่งข้อมูล', d: 'CSV / JSON / ฐานข้อมูล' },
                { n: 2, t: 'ตั้งชื่อ Data Asset', d: 'เลือกผู้ดำเนินการที่มีสิทธิ์' },
                { n: 3, t: 'ให้ข้อมูลต้นทาง', d: 'ไฟล์ หรือรายละเอียดการเชื่อมต่อ' },
                { n: 4, t: 'ตรวจพรีวิว', d: 'ดูคอลัมน์และตัวอย่างแถวก่อนบันทึก' },
                { n: 5, t: 'กดนำเข้า', d: 'ข้อมูลพร้อมใช้ในคลังข้อมูลทันที' },
              ].map((s) => (
                <div key={s.n} className="flex gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-800">{s.n}</span>
                  <div className="min-w-0">
                    <p className="font-medium leading-tight">{s.t}</p>
                    <p className="text-xs text-muted-foreground">{s.d}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" /> ความปลอดภัยตามหลักระบบ
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 p-4 pt-0 text-xs leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">สิทธิ์ตาม RBAC</strong> — เฉพาะ Data Owner / Data Steward / Data Engineer / System Admin ที่นำเข้าได้
              </p>
              <p>
                <strong className="text-foreground">Audit Trail 100%</strong> — ทุกการนำเข้า แก้ไข และลบ ถูกบันทึกว่าใครทำ เมื่อไร
              </p>
              <p>
                <strong className="text-foreground">PDPA-first</strong> — ข้อมูลส่วนบุคคลในคลังข้อมูลจะถูกปิดบังตามบทบาทผู้ชมโดยอัตโนมัติ
              </p>
              <p>
                <strong className="text-foreground">Deny-by-default SQL</strong> — การนำเข้าจากฐานข้อมูลอ่านได้เฉพาะ SELECT เท่านั้น
              </p>
              <p>
                <strong className="text-foreground">ไม่เก็บรหัสผ่าน</strong> — รหัสผ่านการเชื่อมต่อถูกใช้ครั้งเดียวแล้วทิ้ง ไม่บันทึกลงระบบ
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AssetImport
