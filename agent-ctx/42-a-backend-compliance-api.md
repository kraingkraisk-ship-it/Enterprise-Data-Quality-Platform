# Task 42-a — Compliance Assessment API (/api/dq/compliance)

Agent: full-stack-developer (backend)
Date: v0.24.0-dev

## สิ่งที่ทำ
- สร้างไฟล์เดียว: `src/app/api/dq/compliance/route.ts` (GET only, try/catch → 500 แบบ analytics, log `GET /api/dq/compliance`)
- ไม่แตะไฟล์อื่นใดทั้งสิ้น (page.tsx/dq-dashboard.tsx/views.ts/compliance-assessment.tsx เป็นงานคู่ขนานของ 42-b)

## Conventions ที่คัดลอกจาก analytics (ตรงเป๊ะ)
- helpers: engineOf / nameOf / dimensionOf (มิติจาก condition template เสมอ ไม่ใช่ snapshot DqRun), severityWOf (SEVERITY_WEIGHT ?? 3), failRateOf, avgOf
- latestMap key `${ruleId}|${datasetId}` จาก runsWindow (orderBy createdAt desc, take 4000, include rule)
- inherentStatsOf: 1 กฎ = 1 คะแนน — inherent = 5×sevW, residual = เฉลี่ย likelihoodOf(failRate).level×sevW รายคู่ของกฎก่อน แล้วเฉลี่ยข้ามกฎ; reductionPct = max(0,(1−residual/inherent)×100)
- คะแนนรายมิติ (v0.23.0): เฉลี่ย passRate×100 ของกฎในมิตินั้น (global + รายชุดข้อมูล) → คะแนนข้อ = เฉลี่ยข้ามมิติในข้อ → weightedScore = Σ(score×weight)/Σweight เฉพาะข้อวัดได้ที่มี score

## Logic เฉพาะ v0.24.0 (ตาม contract ที่ผู้ใช้อนุมัติ)
- สถานะรายชุดข้อมูลตัดสินด้วย threshold ของกฎแต่ละตัว: กฎวัดได้ทุกตัว passRate×100 ≥ threshold → PASS / มีตัวใดต่ำกว่า → FAIL / ไม่มีกฎวัดได้ → NOT_ASSESSED (แยก rulesCount>0 = มีกฎยังไม่รัน vs =0 ยังไม่มีกฎ)
- สถานะรวมข้อ: FAIL ชนะเสมอ → PASS → NOT_ASSESSED; assessed = pass+fail > 0
- clause perDataset ครบ 7 ชุด ACTIVE เสมอ ตามลำดับ datasets; ข้อระดับกระบวนการ (dimensions []) → rules=[] / null ทั้งแถว / NOT_ASSESSED
- ClauseRuleView: inherent = 5×sevW มีค่าเสมอแม้ไม่เคยรัน, latestPassRate/latestRunAt/failRate/meetsThreshold/residual = null เมื่อไม่เคยรัน, meetsThreshold = passRate×100 ≥ threshold
- ruleHistory: ทุกรอบของกฎที่วัดได้ (มี latest run), points เรียงเก่า→ใหม่, label = `${column} · ${conditionName(ไทย)}`

## ผลตรวจจริง (curl ทั้งสอง API เทียบกัน)
- โครงสร้าง: datasets=7, frameworks=5, clauses ครบ (DAMA 9 / 25012 15 / 8000 6 / 25024 10 / 11179 5), perDataset=7 เรียงตาม datasets ทุกข้อ, pass+fail+na=7 เสมอ
- ข้อไม่วัดได้: 25012 = [25012-CFD, 25012-EFF], 25024 = [25024-OTH], DAMA 9/9 measurable ✓
- HERO ตรง analytics risks.inherent.byFramework (diff = 0 ทุกกรอบ): DAMA 17.7273→8.8182 (−50.26%) / 25012 16.8750→8.1250 (−51.85%) / 8000 18.5000→9.1000 (−50.81%) / 25024 17.7273→8.8182 (−50.26%) / 11179 17.5000→6.2500 (−64.29%)
- หมายเหตุ rulesCount hero = "กฎที่วัดได้" ตาม contract (DAMA 11 / 25012 8 / 8000 10 / 25024 11 / 11179 4) ต่างจาก analytics rulesCount ที่นับกฎ enabled ทั้งหมดในขอบเขต (14/10/13/14/5) — ตัวเลขเฉลี่ยเหมือนกันเพราะคำนวณเฉพาะกฎที่มี run
- weightedScore ตรง analytics regulation.frameworks diff = 0 ทุกกรอบ: 85.7407 / 87.3742 / 87.1173 / 89.3333 / 96.7500
- สถานะสมเหตุผล: DAMA PASS 4 / FAIL 5 (TIMELINESS score 20 < 95 → FAIL), มีกฎยังไม่รัน 5 จุด (customer_id UNIQUE/REGEX/EXISTS_IN_DATASET × clause UNIQUENESS/INTEGRITY/VALIDITY/TRC/REC) → NOT_ASSESSED ถูกกลุ่ม
- ruleHistory: 11 กฎ / 168 points รวม / เรียงเวลาถูกต้อง
- lint: `bun run lint` ผ่าน 0 error · dev server compile route ใหม่สำเร็จ GET 200 (15ms) · dev.log ไม่มี error

## หมายเหตุสำหรับ 42-b
- Contract ครบทุก field ตามสเปก ไม่มี grade/badge (frontend ใช้ gradeOf จาก dama.ts เองได้ถ้าต้องการ)
- ข้อ NOT_ASSESSED แบบ "มีกฎแต่ยังไม่รัน" (rulesCount>0, measuredRules=0) ใช้แสดงเป็นกลุ่ม "รอรันตรวจ" ได้; ข้อ dimensions [] ใช้กลุ่ม "ตรวจด้วยหลักฐาน"
