# Task ID: 42-b — Frontend "ประเมินความสอดคล้อง" (v0.24.0, Risk-first)

**Agent**: Z.ai Code (frontend agent 42-b)
**สถานะ**: เสร็จสมบูรณ์ (ไม่ commit / ไม่แตะ API ตามสั่ง)

## ไฟล์ที่สร้าง/แก้

| ไฟล์ | ประเภท | บรรทัด |
|---|---|---|
| `src/components/dq/compliance-assessment.tsx` | ใหม่ | 956 |
| `src/lib/views.ts` | แก้ | 227 → 234 |
| `src/app/page.tsx` | แก้ | 177 → 190 |
| `src/components/dq-dashboard.tsx` | แก้ | 1918 → 1966 (+48) |

## สิ่งที่ทำ

### 1) compliance-assessment.tsx (view ใหม่ทั้งหน้า, props `{ active: boolean }`)
- **โครงตาม blueprint**: Header Card (h2 + คำอธิบาย + chips "กฎวัดได้ X (unique ruleId ข้ามมาตรฐาน) / มาตรฐาน 5 / ชุดข้อมูล 7" + badge "ยังไม่เชื่อมต่อข้อมูล" เมื่อ fallback) → Framework selector 5 ปุ่ม (grid 1→2→5, radiogroup/radio + aria-checked, active = ring emerald, แสดง weightedScore + ลดลง% + วัดได้ Y/Z ข้อ — เปลี่ยนกรอบ reset การขยายแถว) → Hero 4 การ์ด (grid 1→2→4, min-w-0 ทุกใบ): ① Inherent rose/AlertTriangle "ก่อนมีกฎ DQ" /25 ② ลดลง X% orange/TrendingDown ③ Residual emerald/ShieldCheck /25 ④ ความสอดคล้อง teal/BadgeCheck weightedScore + เกรด (gradeOfClient เดิม) + "ข้อวัดได้ X/Y · ตรวจแล้ว Z ข้อ"
- **Dataset Select**: 'ทุกชุดข้อมูล (ภาพรวม)' default + 7 ชุดจาก API (เปลี่ยนขอบเขต reset การขยาย)
- **ตารางหลัก** (Card > overflow-x-auto > table min-w-[760px], caption sr-only): ข้อกำหนด (th เป็นหลัก + en ตัวเล็ก + badge น้ำหนัก ×w + badge category + chip "ไม่ผ่าน N ชุดข้อมูล" เมื่อ FAIL) / เกณฑ์ตรวจ (รวม label รายกฎ "email · รูปแบบอีเมล ≥95%" — ทุกชุด = union dedupe ราย ruleId + badge "รวม N เกณฑ์") / คะแนน (ScoreBar + toFixed(1) หรือ '—') / สถานะ (PASS=emerald ผ่าน · FAIL=rose ไม่ผ่าน · NOT_ASSESSED=slate ยังไม่ได้ตรวจ — ตามขอบเขตที่เลือก รายชุดจาก perDataset) / ความเสี่ยง (Inherent→Residual /25 + chip ลดลง −X%)
- **แถวขยายได้**: tr onClick + ปุ่ม chevron (aria-expanded + aria-controls + stopPropagation) → แถวรายละเอียด colspan=5: กฎรายข้อ (label + severity badge 4 ระดับ + เกณฑ์ ≥% + badge ผ่านเกณฑ์/ต่ำกว่าเกณฑ์จาก meetsThreshold (fallback คำนวณจาก passRate×100 ≥ threshold) + ผลล่าสุด % + inherent→residual รายกฎ + รันล่าสุด) + กราฟแท่งประวัติ 14 รอบจาก ruleHistory (div height %, emerald/rose ตาม passRate×100 ≥ threshold, title รอบ i) + "รอบแรก X% → ล่าสุด Y%" + ระบุชื่อชุดข้อมูลที่กฎครอบคลุมเมื่อดูทุกชุด
- **กลุ่มท้ายตาราง**: "ข้อกำหนดระดับกระบวนการ (ตรวจด้วยหลักฐาน — ไม่เข้าคะแนน)" amber เฉพาะกรอบที่มี measurable=false (หมายเหตุ RBAC/PII/Audit ตาม pattern v0.23.0)
- **States**: loading (Loader2 + Skeleton โครง 3 ชั้น aria-busy) / error (Alert destructive + ปุ่มลองใหม่ + FrameworkFallbackNotice โหมดออฟไลน์ radiogroup) / ข้อมูลเปล่าในขอบเขต (dashed empty state) / fallback 200-แต่ไม่มี key (badge 'ยังไม่เชื่อมต่อข้อมูล' + FRAMEWORKS เป็นโครง คะแนน '—' ไม่ crash)
- **Fetch**: `useEffect` เมื่อ `active` → GET /api/dq/compliance, กัน race ด้วย `alive`, เปิดซ้ำ = รีเฟรช, tolerant: !res.ok / json.error / frameworks ไม่ใช่ array ว่าง → fallback
- **a11y**: h2→h3→h4 ตามลำดับ, caption sr-only, radiogroup/radio, aria-expanded/controls, focus-visible ring emerald, dl/dt/dd ใน hero
- **สี**: emerald/amber/rose/orange/slate/teal เท่านั้น · ไทยทั้งหมด

### 2) views.ts
- ViewKey + 'compliance-assessment' · VIEWS entry (icon ClipboardCheck, th/en/desc ตามสเปกเป๊ะ) · NAV_GROUPS ภาพรวม ['dashboard','exec-dashboard','exec-reports','compliance-assessment'] · APP_VERSION v0.24.0

### 3) page.tsx
- import + render block keep-mounted/hidden ตาม pattern เดิม วางหลัง exec-reports · **บั๊กแฝงที่แก้ระหว่างตรวจ**: desc ของ view ใหม่เป็นข้อความยาวที่สุดในระบบ → `truncate` (white-space:nowrap) ใน header ดัน min-content ของ SidebarInset จนล้นจอ 1280px (1535 vs 1280) → เปลี่ยน p เป็น `<span className="line-clamp-1">` ภายใต้ p ที่ไม่มี nowrap — หน้าตาเหมือนเดิมทุกอย่าง (1 บรรทัด + ellipsis) แต่ min-content เล็กลง แก้ทั้งแอป (pIx: ตรวจย้อนหลังว่าเป็นบั๊กแฝงที่จะโดนทุก view ที่ desc ยาว ไม่ใช่เฉพาะหน้าใหม่)

### 4) dq-dashboard.tsx (Section 3 — จุดเดียว)
- แทรก Card compact หลังการ์ดสรุป 3 ใบ ก่อน sub-tabs: "ความเสี่ยงรายมาตรฐาน — ก่อนมีกฎ (Inherent) → หลังมีกฎ (Residual)" — 5 listitem จาก `inherent.byFramework` (ข้อมูล state เดิม) แต่ละแถว: ชื่อ+no truncate · mini bar rose→emerald ซ้อน (role=img + aria-label) · 17.7→8.8/25 · chip "ลดลง −X%" + hint "ดูรายละเอียดรายข้อที่เมนู ภาพรวม → ประเมินความสอดคล้อง" — render เมื่อ `inherent && byFramework.length > 0` เท่านั้น (ไม่พังเมื่อไม่มี key) — ไม่แตะ sub-tabs/radiogroup/ส่วนอื่นเลย

## ผลตรวจ
- `bun run lint` 0 error · `tsc --noEmit` ไฟล์ที่แตะ = ว่าง
- API /api/dq/compliance ของ agent 42-a deploy มาระหว่างทาง → E2E ข้อมูลจริงครบ: เมนู 5 มาตรฐาน (85.7/87.4/87.1/89.3/96.8 + ลดลง 50–64%) · hero 4 ใบ · ตาราง DAMA 9 ข้อ (เกณฑ์ตรวจ "รวม N เกณฑ์" · ผ่าน/ไม่ผ่าน · 15.0→3.0/25 ลดลง −80%) · ขยายมาตรา 4 = กฎ 3 ข้อ + กราฟ 14 รอบ "รอบแรก 70.0% → ล่าสุด 85.0%" · เลือกชุดเฉพาะแล้วข้อที่ไม่มีกฎในชุดแสดง empty state/ยังไม่ได้ตรวจ
- Fallback: route-block API → Alert "โหลดข้อมูลประเมินความสอดคล้องไม่สำเร็จ" + ปุ่มลองใหม่ + radiogroup โหมดออฟไลน์ 5 มาตรฐาน ไม่ crash · unroute → กลับมาข้อมูลจริง
- Strip ใน Section 3: 5 แถวครบ + hint + sub-tabs เดิมไม่เสีย · mobile 375px scrollWidth=375 ทั้ง 2 หน้า · desktop 1280 หลังแก้ header = 1280 ✓ · console error 0 · page error 0 · dev.log clean
