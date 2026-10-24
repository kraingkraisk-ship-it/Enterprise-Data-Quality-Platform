# Task ID: 41-b — Frontend Regulation + Risk (v0.23.0)

**Agent**: Z.ai Code (frontend)
**วันที่**: 2026-10-24
**สถานะ**: เสร็จสมบูรณ์

## สิ่งที่ทำ

### ไฟล์ที่แก้ (ไฟล์เดียว)
- `src/components/dq-dashboard.tsx` — 1317 → 1918 บรรทัด (+601) แตะเฉพาะส่วนที่ 3 (Regulation), ส่วนที่ 4 (Risk), types และ derived logic ที่เกี่ยวข้อง (ไม่แตะส่วน 1/2/5)

### ส่วนที่ 3 — Regulation (redesign ใหม่ทั้งส่วน)
1. เมนูมาตรฐาน (radiogroup เดิม) เพิ่ม weightedScore (มุมขวาการ์ด, font-mono, scoreColor) + "วัดได้ X/Y ข้อกำหนด" — คลิกกรอบใหม่จะ reset ขอบเขตชุดข้อมูลเป็น "ทุกชุดข้อมูล" (กัน fwDataset ชี้ชุดที่ไม่มีในกรอบใหม่)
2. หัวกรอบที่เลือก: ชื่อ+fullName+description เดิม + badges "ข้อกำหนด X ข้อ · วัดได้ Y ข้อ" + badge เตือนเมื่อ API ยังไม่ส่ง key `regulation`
3. การ์ดสรุป 3 ใบ (dl/dt/dd): "ก่อนตั้งกฎ DQ — 0.0/100 (rose, ShieldOff)" / "หลังตั้งกฎ DQ — weightedScore (emerald, ShieldCheck)" / "คะแนนเพิ่มขึ้น +X.X คะแนน (emerald, TrendingUp)"
4. sub-tabs (regTab: 'datasets' | 'clauses', role=tablist/tab + aria-controls + tabpanel):
   - **มุมมองชุดข้อมูล (default)**: ตาราง fw.datasets — ชุดข้อมูล · กฎครอบคลุม · ก่อนตั้งกฎ (0.0) · หลังตั้งกฎ (ScoreBar + toFixed(1) + grade badge จาก API หรือ gradeOfClient) · เพิ่มขึ้น (+X.X chip emerald / ±0.0 / —) · รันล่าสุด — empty state เมื่อไม่มีชุด
   - **รายละเอียดข้อกำหนด**: (ก) Select ขอบเขตชุดข้อมูล (reuse state fwDataset; ตัวเลือกจาก fw.datasets ก่อน ถ้าไม่มี fallback data.perDataset) (ข) รายการ domain ที่วัดได้: th (en) + category + badge "น้ำหนัก ×W" (fmtWeight) + detail + DimensionBadge + กฎครอบคลุม + แถว "ก่อน 0.0 → หลัง X.X" + ScoreBar + chip delta — คะแนนจาก domain.perDataset เมื่อเลือกชุด / domain.score เมื่อทุกชุด (regDomainScore) (ค) กล่อง "ข้อกำหนดระดับกระบวนการ (ไม่เข้าการคำนวณคะแนน)" (amber) รวม domain ที่ dimensions: [] + หมายเหตุ RBAC/PII/Audit
5. ลบของเก่า: `fw`, `scopeDims` (useMemo), `domainStatus()`, `fwSummary` — ตรวจ grep ก่อนลบว่าไม่มีที่อื่นใช้

### ส่วนที่ 4 — Risk (เพิ่มใหม่ คงของเดิม)
1. **Hero** (การ์ด 3 ใบ + chips): Inherent inherentAvg/25 (rose, AlertTriangle) → "ลดลง X%" (TrendingDown, emerald) → Residual residualAvg/25 (emerald, ShieldCheck) + chips "วัดแล้ว N กฎ · ยังไม่วัด M กฎ" + badge "รอข้อมูล..." เมื่อ inherent เป็น null — แสดง '—' แทนค่าเมื่อไม่มีข้อมูล
2. **ตารางรายขอบเขต 3 switcher** (riskScope: 'dimension' | 'framework' | 'classification', role=radiogroup): คอลัมน์ ขอบเขต (th + sub en/no) · กฎ · Inherent · Residual (สีตามระดับ rose/amber/emerald) · ลดลง (−X.X, −Y%) · mini bar ซ้อน 2 ชั้น (rose=inherent, emerald=residual เทียบสเกล 25, role=img + aria-label) — แหล่ง inherent.byDimension/byFramework/byClassification เรียง residualAvg มาก→น้อย, เน้นแถวแรก bg-rose-50 ถ้า residualAvg ≥ 8 + คำอธิบายสูตรท้ายการ์ด
3. **Matrix toggle** (matrixView: 'residual' | 'inherent', role=radiogroup): Inherent → ทุกกฎนับ likelihood=5 (cell count = จำนวนกฎ-ชุดข้อมูลใน severity นั้นจาก latestRuns, เฉพาะแถวโอกาส 5) + ปรับ CardDescription + แทนที่แถบ byDimension ด้วยหมายเหตุ rose; Residual → คงเดิมทุกอย่าง
4. คงเดิม: การ์ดนับ band 5 ใบ, แผนที่ความเสี่ยง, รายการความเสี่ยงหลัก top-10, หมายเหตุท้ายการ์ด

### Types ใหม่ (type-safe ไม่มี any)
`RegulationGradeView`, `RegulationDomainPerDataset`, `RegulationDomainView`, `RegulationDatasetRow`, `RegulationFrameworkView`, `RiskInherentScopeRow`, `RiskInherentSummary` + extend `AnalyticsData` (regulation?: …, risks.inherent?: … — optional เพื่อไม่ crash ถ้า API ยังไม่เปิด key) + `DashUser.status?`, `RiskItem.ruleId?` (แก้ tsc error เดิม 2 จุด)

### คุณภาพ
- a11y: radiogroup/tab/panel ครบ role+aria, dt/dd คู่ค่าใน hero, caption sr-only ในตาราง, h3/h4 ใน Card, focus-visible ring ทุกปุ่ม
- mobile 375px: page overflow = 0 ทั้ง 2 ส่วนทุก state — **แก้ bug เดิมเพิ่ม**: การ์ด matrix/top-10 ใน grid `lg:grid-cols-[0.95fr_1.05fr]` ล้นจอ (min-width:auto ของ grid item ดึง min-content ของตาราง 420px) → เพิ่ม `min-w-0` ที่ Card ทั้งสอง + switcher/min-w-0 ใน header
- สี: emerald/amber/rose/orange/slate/teal เท่านั้น (ไม่มี blue/indigo)
- เลข: toFixed(1) คะแนน/ค่าเฉลี่ย, % จำนวนเต็ม (Math.round)

## ผลตรวจ
- `bunx tsc --noEmit | grep dq-dashboard` = ว่าง ✓ (error ที่เหลือเป็นของไฟล์อื่น — mappings-server.ts, dq/* จาก agent 41-a ที่ยังแก้อยู่ + skills/examples เดิม)
- `bun run lint` = 0 error ✓
- agent-browser E2E: Regulation — เมนู 5 กรอบแสดงคะแนนจริง (85.7/87.4/87.1/89.3/96.8) ✓ ตารางชุดข้อมูล 0.0 → 94.4 (+94.4, ดี) ✓ เลือกชุดเฉพาะได้ (perDataset rulesCount/score เปลี่ยนตาม) ✓ กล่องกระบวนการแสดงเฉพาะกรอบที่มี dimensions [] ✓ badge น้ำหนัก ×1.5/×1.3/×1/×0.8/×0.5 ✓ — Risk — hero 17.7/25 → ลดลง 50% → 8.8/25, chips 11/3 กฎ ✓ สลับ 3 ขอบเขตได้ข้อมูลตรง ✓ เน้นแถว AML/KYC (residual 9.8) bg-rose-50 ✓ matrix Inherent เปลี่ยนเซลล์+คำอธิบาย ✓
- mobile 375px: scrollWidth = 375 ทุก state ✓ ตารางเลื่อนในตัว (720px ใน wrapper 299px) ✓
- console error = 0 · page error = 0 · dev.log ปกติ

## หมายเหตุ
- API มี key ใหม่แล้ว (agent 41-a deploy ทันระหว่างทำ) — ตรวจ fallback โดยโครงสร้าง optional access อยู่ครบ (ถ้า key หายจะแสดง '—' + badge แจ้งเตือน ไม่ crash)
- ห้ามแตะ src/app/api/**, src/lib/**, scripts/** — ยึดตามสั่ง
