# Task 41-a — Backend (Regulation + Risk + Seed story)

Agent: Z.ai Code (backend agent)
สถานะ: ✅ เสร็จสมบูรณ์ — ไม่แตะ frontend สักไฟล์

## สิ่งที่เปลี่ยน (4 ไฟล์)

### 1) src/lib/regulation.ts
- `FrameworkDomain` เพิ่ม `weight: number` (required) — ใส่ครบทุก domain ทุกกรอบ
- เพิ่มมิติตามข้อเสนอที่ผู้ใช้อนุมัติ:
  - ISO_25012: ACC2→[COMPLETENESS,TIMELINESS], CPL→[VALIDITY,CONSISTENCY], CRD→[ACCURACY,INTEGRITY], UND→[CONSISTENCY,COMPLETENESS], PRT→[CONSISTENCY], REC→[INTEGRITY,COMPLETENESS], TRC→[INTEGRITY]; คง CFD/EFF เป็น []
  - ISO_8000: 8000-1→[ACCURACY,REASONABLENESS], 8000-61→[TIMELINESS], 8000-110→[VALIDITY,ACCURACY,CONSISTENCY,UNIQUENESS,COMPLETENESS]
  - ISO_11179: 11179-1→[COMPLETENESS], 11179-6→[COMPLETENESS,CURRENTNESS]
  - DAMA_DMBOK / ISO_25024 ไม่เปลี่ยนมิติ
- Weight: DAMA ทุกมาตรา 1.0 · 25012: ACC 1.5 CMP 1.5 CON 1.25 CRD 1.0 CUR 1.25 ACC2 0.75 CPL 1.25 CFD 1.0 EFF 1.0 PRC 1.0 TRC 1.0 UND 0.75 AVA 1.0 PRT 0.5 REC 0.5 · 8000: 0.75/1.0/1.25/0.75/1.5/1.5 · 25024: SYN 1.25 SEM 1.25 CMP 1.5 CON 1.0 CRD 1.0 CUR 1.0 AVA 0.75 UNQ 1.25 RSN 1.0 OTH 1.0 · 11179: 0.5/1.5/1.25/1.0/0.75
- ไม่แตะ DATA_CLASSIFICATIONS / likelihoodOf / riskBandOf เดิม

### 2) src/app/api/dq/analytics/route.ts (เพิ่ม 2 key — ของเดิมครบทุก field)
- `regulation.frameworks[]`: id, no, groupTh, name, fullName, description, totalDomains, measuredDomains, weightedScore (Σ score×w / Σw เฉพาะ domain ที่วัดได้), domains[] (id, th, en, detail, category|null, weight, dimensions[], score|null, rulesCount, perDataset[] {datasetId, score|null, rulesCount}), datasets[] (datasetId, name, rulesCount, score|null, lastRunAt, grade|null {band,label,badgeClass,textClass})
  - score domain = เฉลี่ยคะแนนมิติใน domain (ข้าม null) จาก latest run ต่อ rule×dataset (logic เดิม dimensionScoresOf)
  - rulesCount ระดับกรอบต่อชุด = นับจาก rulesByDatasetByDimension เดิมในชุดมิติ (union) ของกรอบ
- `risks.inherent`: measuredRules/unmeasuredRules (unique ruleId, กฎ enabled ที่ผูกชุดข้อมูล), inherentAvg (เฉลี่ย 5×SEVERITY_WEIGHT), residualAvg (เฉลี่ย likelihoodOf(failRate ล่าสุด).level×SEVERITY_WEIGHT — ใช้ latestRuns ทั้ง PASSED และ FAILED, PASSED→level 1), reductionPct (0–100), byDimension ครบ 9 มิติ (ไม่มีกฎ = 0,0,0,0), byFramework 5 กรอบ (มิติกฎ ∈ union domain.dimensions; กฎ unique ต่อขอบเขต นับซ้ำข้ามกรอบได้), byClassification (id/th/en/no จาก classificationLabel; เฉพาะประเภทที่มีกฎ)
  - กฎที่ผูกหลายชุดข้อมูล: เฉลี่ย residual รายคู่ของกฎก่อน แล้วเฉลี่ยรายกฎต่อขอบเขต (1 กฎ = 1 คะแนนต่อขอบเขต)
  - ทำงานร่วมกับ ?datasetId= filter ได้ (ขอบเขตตาม filter)

### 3) scripts/seed.ts — เรื่องราว "ข้อมูลดีขึ้นตามเวลา"
- เพิ่ม `RUN_START_RATES` (email 0.68, credit_limit 0.72, phone 0.78, txn_id 0.85, customer_id 0.90) + `startRateOf()` (default = final−0.12, clamp ไม่ติดลบและต้อง < final เสมอ)
- Loop RUN_BATCHES (14 รอบ, 210→0 วัน): progress = batchIndex/13 เชิงเส้น → rate = startRate + (final−startRate)×progress → failedRows = totalRows − round(totalRows×rate), status = failedRows===0 ? PASSED : FAILED, passRate คำนวณใหม่
- **รอบล่าสุด (progress=1) ได้ failedRows/passRate/status เท่าการ eval จริงทุกอย่าง** → สัญญาณ/Exception/analytics ปัจจุบันไม่เปลี่ยน
- Audit log RUN_VALIDATION ปรับข้อความบอกว่า seed เล่าเรื่องการปรับปรุงคุณภาพตามเวลา
- กฎสเปก mapping 3 ข้อ (customer_id UNIQUE/REGEX/EXISTS_IN_DATASET) ยังสร้างหลัง loop runs ตามดีไซน์เดิม → ไม่มี run history (เห็นเป็น unmeasuredRules ใน risks.inherent)

### 4) src/lib/views.ts
- APP_VERSION = 'v0.23.0'

## ผลตรวจ (พิสูจน์แล้วทั้งหมด)
- `bun scripts/seed.ts` สำเร็จ: 168 runs (12 คู่ × 14 รอบ) / 14 rules / 11 signals
- สคริปต์ตรวจ (/tmp/dq-verify/check-seed.ts): ทั้ง 12 คู่ first<last ครบ + monotonic ไม่ถดถอย + รอบล่าสุดตรง eval จริง 12/12 (เช่น email 0.70→0.85 trueFailed=3/20 ตรงทุกค่า)
- tsc: ไม่มี error ใน regulation/analytics/seed/views (error ที่เหลือเป็นของไฟล์ frontend ที่อีก agent แก้อยู่ / examples)
- eslint 3 ไฟล์ที่แก้: clean
- curl /api/dq/analytics: HTTP 200 — oldKeys ครบ, frameworks=5, weightedScore ทุกกรอบ > 0, inherent measured=11/unmeasured=3, inherentAvg=17.73, residualAvg=8.82, reductionPct=50.26%, byDimension=9, byFramework=5, byClassification=3

## หมายเหตุสำหรับ agent ถัดไป (frontend)
- key ใหม่ใน response: `data.regulation.frameworks[]` และ `data.risks.inherent` (โครงสร้างตามข้างบน)
- คะแนน "ข้อมูลเดิม" ให้ render เป็น 0 (ไม่มีกฎ = ไม่มีการรับประกันคุณภาพ) — ตัวเลขที่ API คืนคือ "คะแนนที่วัดได้"
- domain ที่ dimensions=[] (เช่น 25012-CFD/EFF, 25024-OTH) จะได้ score=null — ให้ซ่อนจากการคำนวณคะแนนและจัดเป็นหมวดแยกตามสเปก
- จุดเล่าเรื่องที่น่าสนใจ: TIMELINESS reductionPct=0% (กฎ MAX_AGE_HOURS 72 ชม. fail 80% → inherent=residual) · 25012-ACC2 score=60 (avg COMPLETENESS 100 + TIMELINESS 20)
