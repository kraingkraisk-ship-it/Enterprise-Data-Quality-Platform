# Work Log — Enterprise Data Quality Platform

> บันทึกการทำงานของทีมพัฒนา / Development work log
> วัตถุประสงค์: ใช้เป็นข้อมูลอ้างอิงสำหรับการ rollback ย้อนหลังในกรณีฉุกเฉิน
> (Purpose: audit trail & rollback reference for every push to GitHub)

- **Repository**: https://github.com/kraingkraisk-ship-it/Enterprise-Data-Quality-Platform.git
- **Default branch**: `main`
- **Stack**: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma (SQLite)

---

## Task ID: 1
**Agent**: Z.ai Code (main orchestrator)
**Task**: Push source code ไปยัง GitHub และจัดทำ work log เพื่อใช้ rollback ได้ในกรณีฉุกเฉิน
(Push source code to GitHub and maintain a work log for rollback purposes)

Work Log:
- ตรวจสอบสถานะ git เดิม: พบ repo ที่มี initial commit `dd78f81` (branch `main`) และยังไม่มี remote
- เตรียม `.gitignore` เพิ่มเติม: ยกเว้นไฟล์ runtime — `/db/*.db`, `/db/*.db-journal`, `/upload/`, `*.pid`
- Untrack `.env` ออกจาก git index (`git rm --cached .env`) เพื่อความปลอดภัยตาม best practice
  - หมายเหตุ: ไฟล์ `.env` เดิมมีเพียง `DATABASE_URL` (ชี้ไปยัง SQLite ในเครื่อง) ไม่มีความลับร้ายแรง
  - หากต้องการย้อนกลับ: ไฟล์ยังอยู่ใน commit `dd78f81` สามารถ restore ได้ด้วย `git checkout dd78f81 -- .env`
- ตรวจสอบ remote ก่อน push (empty repository หรือมีข้อมูลเดิม) เพื่อเลือกกลยุทธ์ push ที่เหมาะสม
- สร้าง commit รวม source code ทั้งหมดของโปรเจกต์ (src/, prisma/, public/, tests/, examples/, ไฟล์ config ต่าง ๆ)
- Push ขึ้น GitHub branch `main` ด้วย token ที่ผู้ใช้ให้มา (ใช้แบบ one-time ไม่บันทึก token ลง disk)
- บันทึก commit SHA ผลลัพธ์ไว้ในหัวข้อ "Rollback Reference" ด้านล่าง

Rollback Reference:
- ก่อน push สถานะโลคัลอยู่ที่ commit: `dd78f81` (Initial commit)
- การ rollback: ดู SHA ล่าสุดในหัวข้อ Stage Summary ด้านล่าง แล้วใช้คำสั่ง
  - `git revert <sha>` (ปลอดภัย, สร้าง commit ย้อนกลับ) หรือ
  - `git reset --hard <sha-to-return-to>` (ระวัง: ล้าง commit ถังหลัง)
- การตรวจสอบประวัติทั้งหมด: `git log --oneline`

Stage Summary:
- สถานะ: (อัปเดตหลัง push สำเร็จ — ดู Task ID: 1-result)

---

## Task ID: 1-result
**Agent**: Z.ai Code (main orchestrator)
**Task**: บันทึกผลการ push ครั้งที่ 1 และข้อมูล rollback (Record of the first push + rollback data)

Work Log:
- Push `main` → GitHub สำเร็จ (`* [new branch] main -> main`) เวลาประมาณ 2025-10-18 (Asia/Bangkok)
- ตรวจสอบยืนยัน: remote `refs/heads/main` = `1d64e372dc862ada2d0bc5a077e6578eb4361c38` ตรงกับ local HEAD ทุกประการ
- ตั้ง upstream tracking: `main` → `origin/main` (สถานะ in sync)
- ลบ token ออกจาก `.git/config` แล้ว (`git remote set-url origin` เป็น clean URL) — token ไม่ถูกบันทึกถาวรบนดิสก์
- ไฟล์ที่ push ทั้งหมด: 85 ไฟล์ (source code, config, worklog)

Stage Summary:
- **Commit ที่ถูก push**: `1d64e37` — "feat: Enterprise Data Quality Platform — initial source code push"
- **Commit ก่อนหน้า (จุด rollback เดิม)**: `dd78f81` — "Initial commit"
- **Remote**: `https://github.com/kraingkraisk-ship-it/Enterprise-Data-Quality-Platform.git` (branch `main`)
- **ขั้นตอน Rollback บนเครื่อง local**:
  ```bash
  # ย้อนกลับไป commit ก่อน push (ล้างทุกอย่างหลังจากนั้น — ใช้ด้วยความระมัดระวัง)
  git reset --hard dd78f81

  # หรือย้อนกลับแบบปลอดภัย (สร้าง commit ใหม่ที่ย้อนการเปลี่ยนแปลง)
  git revert 1d64e37
  ```
- **ขั้นตอน Rollback บน GitHub (remote)**:
  ```bash
  git reset --hard dd78f81
  git push --force origin main   # ต้องมี token/สิทธิ์ push อีกครั้ง
  ```
- **กู้คืน .env (ถ้าต้องการ)**: `git checkout dd78f81 -- .env`
- ⚠️ **คำแนะนำด้านความปลอดภัย**: token ที่แชร์ผ่านแชทควรถูก **revoke/rotate** หลังการใช้งานเสร็จ ที่ GitHub → Settings → Developer settings → Fine-grained personal access tokens

---

## Task ID: 2
**Agent**: Z.ai Code (main orchestrator)
**Task**: ระบุ version ปัจจุบันของ source code และสร้าง git tag เพื่อใช้เป็นจุด rollback ถาวร
(Specify current source code version and create a git tag as a permanent rollback point)

Work Log:
- ตรวจสอบข้อมูล version ปัจจุบันจาก git (SHA, วันที่, จำนวนไฟล์, stack)
- สร้าง annotated tag `v0.1.0-baseline` ชี้ไปยัง commit `9f1daef`
- Push tag ขึ้น GitHub สำเร็จ (`* [new tag] v0.1.0-baseline -> v0.1.0-baseline`)
- ตรวจสอบยืนยันบน remote: `refs/tags/v0.1.0-baseline^{}` = `9f1daef26da3a516a2f4ddb3afb3f92e42a4cbde` ถูกต้อง

Stage Summary:
- **Version ปัจจุบัน (Current Version Reference)**:

| รายการ | ค่า |
|---|---|
| Tag | `v0.1.0-baseline` |
| Full Commit SHA | `9f1daef26da3a516a2f4ddb3afb3f92e42a4cbde` |
| Short SHA | `9f1daef` |
| Commit message | `docs(worklog): record push results and rollback reference` |
| Commit date (UTC) | `2026-10-18T11:52:17Z` (≈ 18:52 Asia/Bangkok) |
| Branch | `main` |
| Remote | `https://github.com/kraingkraisk-ship-it/Enterprise-Data-Quality-Platform.git` |
| จำนวนไฟล์ที่ track | 85 ไฟล์ |
| Stack | Next.js `^16.1.1` + TypeScript + Tailwind CSS 4 + shadcn/ui + Prisma (SQLite) |

- **วิธี Rollback กลับมาที่ version นี้ (โดยใช้ tag — จำง่ายกว่า SHA)**:
  ```bash
  # ดูโค้ดที่ version นี้ (ไม่กระทบ branch หลัก)
  git checkout v0.1.0-baseline

  # ย้อน branch local กลับมาที่ version นี้ทั้งหมด
  git checkout main
  git reset --hard v0.1.0-baseline

  # ย้อน remote (GitHub) กลับมาที่ version นี้ด้วย
  git push --force origin main

  # หรือแบบปลอดภัย (สร้าง commit ใหม่ที่ย้อนการเปลี่ยนแปลง — ไม่ต้อง force push)
  git revert --no-commit 9f1daef..main && git commit -m "revert: back to v0.1.0-baseline"
  ```
- **ตรวจสอบว่ากำลังอยู่ที่ version นี้หรือไม่**: `git describe --tags` → ต้องแสดง `v0.1.0-baseline`

---

## Task ID: 3
**Agent**: Z.ai Code (main orchestrator)
**Task**: Push ด้วย token ใหม่ (token rotation) และตรวจสอบสถานะ sync ระหว่าง local กับ remote
(Push with the rotated token and verify local–remote sync status)

Work Log:
- ผู้ใช้ rotate token ใหม่ตามคำแนะนำด้านความปลอดภัย (token เดิมจาก Task ID: 1 ควรถูก revoke แล้ว)
- ตรวจสอบ remote ด้วย token ใหม่ (`git ls-remote`): สำเร็จ — token ใหม่มีสิทธิ์อ่าน
  - `refs/heads/main` = `df191353b9aa33cf3ee67a84b288b7e73874c86f` (ตรงกับ local HEAD)
  - `refs/tags/v0.1.0-baseline` ยังอยู่บน remote ชี้ไปยัง `9f1daef` ถูกต้อง
- ตรวจสอบ local: working tree สะอาด ไม่มีไฟล์ค้าง commit
- ทดสอบ push ด้วย token ใหม่: ได้ผล `Everything up-to-date` — **ยืนยันว่า token ใหม่มีสิทธิ์เขียน (write) และไม่มี commit ใหม่ต้อง push**
- บันทึกเหตุการณ์นี้ลง worklog และ push ด้วย token ใหม่ (commit นี้แหละคือสิ่งที่ถูก push รอบนี้)

Stage Summary:
- **สถานะ: Local และ Remote อยู่ในสถานะ sync สมบูรณ์** (ก่อน commit นี้: ทั้งคู่ที่ `df19135`)
- **Token ใหม่ใช้งานได้ครบทั้ง read + write** (ยืนยันด้วย ls-remote + push test)
- **จุด rollback ยังคงเดิม**: tag `v0.1.0-baseline` → `9f1daef` (ดูรายละเอียดใน Task ID: 2)
- Token ไม่ถูกบันทึกลง `.git/config` (ใช้แบบ one-time URL เช่นเดิม)
- ⚠️ หาก token นี้รั่วไหล ให้ revoke ทันทีและ rotate เป็น token ใหม่ตามขั้นตอนเดิม

---

## 🔄 กระบวนการทำงานที่บังคับใช้ (Enforced Workflow — ตั้งแต่ Task ID: 4)

> ผู้ใช้กำหนดเมื่อ 2026-10-18 — ทุก Task ถัดไปต้องปฏิบัติตาม

1. **ระบุ version ทุกครั้งที่ update code** — ใช้ Semantic Versioning (เช่น `v0.2.0`) แสดงบนหน้าเว็บ (header/footer) ระบุใน commit message และสร้าง git tag ทุกครั้ง
2. **Push ไปยัง GitHub ทุกครั้งที่ update code** — รวม tag ด้วย และต้อง verify ผลบน remote เสมอ
3. **ถ้าผู้ใช้ลืมแนบ token** — ผู้ช่วยต้อง**เรียกถาม token จากผู้ใช้ก่อน push** ห้ามดำเนินการโดยไม่มี token
4. Token ใช้แบบ one-time URL เท่านั้น ห้ามบันทึกลง `.git/config` หรือไฟล์ใด ๆ และแนะนำให้ rotate หลังใช้งาน

---

## Task ID: 4
**Agent**: Z.ai Code (main orchestrator)
**Version**: `v0.2.0`
**Task**: แก้ไข issue "ไม่มีหน้าจอขึ้นเลย ทดสอบ Web App ไม่ได้" พร้อมบันทึกกระบวนการทำงานใหม่
(Fix blank-screen issue — web app had no UI — and record the new enforced workflow)

Work Log:
- **วินิจฉัยปัญหา**: ตรวจสอบ dev server (ทำงานปกติ HTTP 200, ไม่มี error) และ `src/app/page.tsx`
  → พบว่าหน้าเว็บเป็น scaffold placeholder ของ Z.ai มีเพียงโลโก้เดี่ยวบนหน้าขาว (ยืนยันด้วย agent-browser screenshot)
  → สาเหตุ: UI ของแพลตฟอร์ม Data Quality ยังไม่เคยถูกสร้าง — ผู้ใช้จึงเห็นหน้าว่าง
- **แก้ไข**: สร้างหน้าจอหลักของ Enterprise Data Quality Platform (`src/app/page.tsx`) ประกอบด้วย
  - Header sticky พร้อม nav anchor 5 หมวด + badge version
  - Hero section (ภาษาไทยหลัก + อังกฤษกำกับ) พร้อมสถิติภาพรวม 9/8/23/5
  - การ์ดตัวอย่าง Rule Builder แบบ no-code (ประโยคมาตรฐาน 5 ส่วน)
  - Section มิติคุณภาพข้อมูล 9 มิติ, ฟีเจอร์หลัก 4 รายการ, แหล่งข้อมูล 5 แบบ,
    ขั้นตอนการใช้งาน 5 ขั้น, บทบาทผู้ใช้ 8 บทบาท, ความปลอดภัย+มาตรฐาน 6 รายการ
  - Footer แบบ sticky (mt-auto) พร้อม version และ PDPA Ready
- อัปเดต `layout.tsx`: metadata ใหม่ (title/description ภาษาไทย+อังกฤษ), `lang="th"`, favicon เป็น /logo.svg
- อัปเดต `next.config.ts`: เพิ่ม `allowedDevOrigins: ["*.space-z.ai", "*.z.ai"]` แก้เตือน cross-origin ของ preview
- `bun run lint` ผ่าน ไม่มี error
- **ตรวจสอบด้วย agent-browser ครบถ้วน**:
  - Desktop 1280px: ทุก section render ถูกต้อง, title ใหม่แสดง, nav 5 ลิงก์
  - Mobile 390px: layout ตอบสนองถูกต้อง ไม่มี overflow
  - Nav click "ขั้นตอนการใช้งาน" → scroll ไปตำแหน่ง 2361px สำเร็จ
  - Footer: ติดล่างจอจริง (`footerAtBottom: true`) เมื่อเนื้อหาเกิน 1 จอ
  - ไม่มี console error และไม่มี warning ใน dev.log ล่าสุด
- **บันทึกกระบวนการทำงานใหม่** (Enforced Workflow) ไว้ในไฟล์นี้ตามที่ผู้ใช้กำหนด
- Commit + tag `v0.2.0` + push ขึ้น GitHub ด้วย token ใหม่ (one-time URL) และ verify ผลบน remote

Stage Summary:
- **สาเหตุปัญหา**: หน้าเว็บเป็น scaffold placeholder ไม่มี UI แอปจริง → **แก้แล้ว** ด้วยการสร้างหน้าจอหลัก DQ Platform ครบ 6 sections
- **Version นี้**: `v0.2.0` (แสดงบน header + footer ของเว็บ, ผูก git tag `v0.2.0`)
- ไฟล์ที่แก้: `src/app/page.tsx` (ใหม่ทั้งหมด), `src/app/layout.tsx` (metadata/lang), `next.config.ts` (allowedDevOrigins)
- ผ่านการตรวจสอบ browser ทั้ง desktop/mobile + interaction + lint แล้ว

---

## Task ID: 5
**Agent**: Z.ai Code (main orchestrator)
**Version**: `v0.3.0`
**Task**: พัฒนาโมดูล "บทบาทผู้ใช้และสิทธิ์การเข้าถึง" (RBAC) แบบมีฐานข้อมูลจริง
(Develop the RBAC module with a real database-backed console)

Work Log:
- **Database (Prisma + SQLite)**: ออกแบบ schema 4 models — `User` (role/status), `Dataset` (sourceType/PII), `DatasetAccess` (dataset-level grants VIEW|MANAGE, unique datasetId+roleId), `AuditLog` (action/actor/target/detail) → `db:push` สำเร็จ
- **Seed**: `scripts/seed.ts` สร้างข้อมูลตัวอย่าง 10 users, 6 datasets, 27 grants, 2 audit entries
- **RBAC Config กลาง** (`src/lib/rbac.ts`): คำนิยาม 8 บทบาท (TH/EN), 8 กลุ่มสิทธิ์, permission matrix, helper `hasPermission()` — ใช้ร่วม backend + frontend เป็น single source of truth
- **Backend API (6 เส้น)**:
  - `GET /api/rbac/roles` — role definitions + permission labels
  - `GET/POST /api/rbac/users` — รายชื่อผู้ใช้ / สร้างบัญชี (validate email ซ้ำ, รูปแบบอีเมล, บทบาท)
  - `PATCH /api/rbac/users/[id]` — เปลี่ยนบทบาท/สถานะ + **กฎธุรกิจ: ห้ามเปลี่ยนบทบาท/ระงับ SYS_ADMIN ACTIVE บัญชีสุดท้าย (409)**
  - `GET /api/rbac/datasets` — datasets พร้อม grants
  - `POST /api/rbac/datasets/[id]/access` — GRANT / REVOKE / SET_LEVEL
  - `GET /api/rbac/audit` — audit trail (limit สูงสุด 200)
  - ทุก mutation เขียน AuditLog อัตโนมัติ (actor: sys.admin@company.co.th — demo mode)
- **Frontend RBAC Console** (`src/components/rbac-console.tsx`) ฝังใน section `#roles` ของหน้าแรก 4 แท็บ:
  1. สิทธิ์ตามบทบาท — ตาราง matrix 8×8 (scroll แนวนอน, sticky header/first column, sr-only descriptions)
  2. ผู้ใช้ในระบบ — ตาราง users + เปลี่ยนบทบาทผ่าน Select + ระงับ/เปิดบัญชี + Dialog เพิ่มผู้ใช้ (max-h + scroll)
  3. เข้าถึงชุดข้อมูล — การ์ดราย dataset แสดง grants chips, มอบสิทธิ์ (เลือกบทบาท+ระดับ), ยกเลิกสิทธิ์, ลดระดับสิทธิ์
  4. บันทึกตรวจสอบ — Audit Trail (max-h-96 overflow, badge แยกสีตาม action, เวลาแบบ th-TH)
- **ผลทดสอบด้วย Agent Browser (ผ่านทั้งหมด)**:
  - Matrix: แสดง 8 บทบาท × 8 สิทธิ์ครบ, table semantics ถูกต้อง
  - เปลี่ยนบทบาท นิกร ขายดี: BUSINESS_USER → DATA_OWNER — persist ลง DB จริง ✅
  - ระงับ SYS_ADMIN บัญชีสุดท้าย → **ถูกบล็อก (409)** toast แสดงข้อความกฎธุรกิจ, DB ยัง ACTIVE ✅
  - มอบสิทธิ์ EXECUTIVE ให้ "ลูกค้าองค์กร — Master" (VIEW) → ปรากฏ chip แล้วยกเลิก → chip หาย ✅
  - Audit Trail บันทึกครบ: ASSIGN_ROLE, GRANT_ACCESS, REVOKE_ACCESS พร้อม actor + เวลา ✅
  - ไม่มี console error / page error / error ใน dev.log, lint ผ่าน
- bump `APP_VERSION` → `v0.3.0` (แสดงบน header + footer), commit + tag `v0.3.0` + push (main + tag) ตามกระบวนการทำงานใหม่

Stage Summary:
- **โมดูล RBAC พร้อมใช้**: RBAC Console บนหน้าแรกควบคุมข้อมูลจริงใน SQLite ผ่าน 6 API — ไม่ใช่ mock UI
- โครงสร้างใหม่: `prisma/schema.prisma` (4 models), `scripts/seed.ts`, `src/lib/rbac.ts`, `src/app/api/rbac/**` (6 routes), `src/components/rbac-console.tsx`, แก้ `src/app/page.tsx` (แทนที่ section บทบาทแบบ static)
- Version ปัจจุบัน: `v0.3.0` — rollback point ก่อนหน้า: `v0.2.0`

---

## Task ID: 5-result
**Agent**: Z.ai Code (main orchestrator)
**Version**: `v0.3.0`
**Task**: Push commit v0.3.0 (โมดูล RBAC) ขึ้น GitHub ด้วย token ใหม่ + ตรวจสอบยืนยันบน remote
(Push the v0.3.0 RBAC commit and tag with the fresh token, then verify on remote)

Work Log:
- สถานการณ์: เซสชันก่อนหน้าพัฒนาโมดูล RBAC เสร็จและสร้าง commit + tag `v0.3.0` ใน local ไว้แล้ว แต่ **push ยังไม่สำเร็จ** (token รอบก่อนไม่ทำงาน) — ผู้ใช้ส่ง token ใหม่มา (token ลำดับที่ 4 ที่ใช้ในโปรเจกต์นี้)
- ตรวจสอบสถานะ local ก่อน push:
  - commit ล่าสุด `4aeb834` = "v0.3.0: feat RBAC module — user roles & access permissions console"
  - tag `v0.3.0` สร้างแล้ว (annotated), `git describe --tags` = `v0.3.0`
  - `git status`: `main...origin/main [ahead 1]` → ยืนยันว่ายังไม่ถูก push
  - ไฟล์โมดูล RBAC ครบ: `src/components/rbac-console.tsx`, `src/lib/rbac.ts`, `scripts/seed.ts`, `src/app/api/rbac/**` (6 routes)
- ตรวจสอบ remote ด้วย token ใหม่ (`git ls-remote`): สำเร็จ — token ใหม่มีสิทธิ์อ่าน
  - ก่อน push: `refs/heads/main` = `604b5b8` (ยังอยู่ที่ v0.2.0), ไม่มี `refs/tags/v0.3.0` → ยืนยัน remote ยังขาด v0.3.0
- Push ครั้งเดียวครบทั้ง branch + tag:
  `git push <one-time-url> refs/heads/main:refs/heads/main refs/tags/v0.3.0:refs/tags/v0.3.0`
  - ผลลัพธ์: `604b5b8..4aeb834  main -> main` + `* [new tag] v0.3.0 -> v0.3.0` ✅
- ตรวจสอบยืนยันหลัง push (`git ls-remote` อีกครั้ง):
  - `refs/heads/main` = `4aeb8342630aeca66b85df45cbcb9d29e5c31d89` **ตรงกับ local HEAD ทุกประการ**
  - `refs/tags/v0.3.0` = `b158ffb` (tag object) → `^{}` = `4aeb8342630aeca66b85df45cbcb9d29e5c31d89` ถูกต้อง
- Sync tracking ref: `git fetch <url> main:refs/remotes/origin/main --force` → สถานะ `main...origin/main` in sync (ไม่มี ahead/behind)
- Token ไม่ถูกบันทึกลง `.git/config` (remote.origin.url ยังเป็น clean URL — ตรวจสอบแล้ว)

Stage Summary:
- **สถานะ: Local และ Remote sync สมบูรณ์ที่ version `v0.3.0`** (commit `4aeb834`)
- **Token ใหม่ (ลำดับที่ 4) ใช้งานได้ครบทั้ง read + write** (ยืนยันด้วย ls-remote + push สองครั้ง: main+tag และ worklog ตามลำดับ)
- ข้อมูล version สำหรับ rollback:

| รายการ | ค่า |
|---|---|
| Version | `v0.3.0` |
| Tag object SHA | `b158ffb2ad0a8ea7f913dfd0519d688a6583e5e5` |
| Full Commit SHA | `4aeb8342630aeca66b85df45cbcb9d29e5c31d89` |
| Short SHA | `4aeb834` |
| Commit message | `v0.3.0: feat RBAC module — user roles & access permissions console` |
| Branch / Remote | `main` → GitHub repo เดิม |
| จุด rollback ก่อนหน้า | `v0.2.0` = `604b5b8` |

- **วิธี Rollback (tag-based)**:
  ```bash
  # ดูโค้ดที่ version นี้ (ไม่กระทบ branch หลัก)
  git checkout v0.3.0

  # ย้อนกลับไป v0.2.0 (ก่อนโมดูล RBAC)
  git checkout main
  git reset --hard v0.2.0
  git push --force origin main
  git push origin :refs/tags/v0.3.0   # ลบ tag บน remote ด้วย (ถ้าต้องการ)

  # หรือแบบปลอดภัย (ไม่ force push)
  git revert --no-commit v0.2.0..main && git commit -m "revert: back to v0.2.0"
  ```
- **ตรวจสอบว่าอยู่ที่ version นี้**: `git describe --tags` → ต้องแสดง `v0.3.0`
- ⚠️ ควร rotate/revoke token หลังใช้งานเสร็จตามขั้นตอนเดิม

---

## Task ID: 6
**Agent**: Z.ai Code (main orchestrator)
**Version**: `v0.4.0`
**Task**: พัฒนา Core Features ให้ทำงานจริง (Rule Builder / รันตรวจสอบ & ML Signals / ข้อยกเว้น & อนุมัติ / แดชบอร์ด)
(Develop the 4 core features as a live, database-backed console)

Work Log:
- **Database**: เพิ่ม 5 models — `SampleRow` (sandbox rows), `DqRule` (กฎ 7 เงื่อนไข), `DqRun` (ผลรันรายกฎ), `DqSignal` (สัญญาณรอมนุษย์ทบทวน), `DqException` (คำขอข้อยกเว้น) + relation เพิ่มใน Dataset และ DqRule.exceptions → `db:push` สำเร็จ
- **DQ Engine** (`src/lib/dq.ts`): เงื่อนไข 7 แบบ (NOT_NULL, EMAIL, REGEX, RANGE, IN_LIST, UNIQUE, MAX_AGE_DAYS) ครอบมิติ Completeness/Validity/Accuracy/Consistency/Uniqueness/Timeliness, `buildRuleSentence()` ประกอบประโยคมาตรฐาน 5 ส่วน, `evaluateRule()` ประเมินกฎจริง, `generateMlSignals()` (outlier IQR / near-duplicate / schema drift / volume) — deterministic, `maskRowByRole()`/`maskValueByRole()` ปิดบัง PII ฝั่ง backend
- **Operator Gate** (`src/lib/operator.ts`): ทุก mutation ต้องระบุ operatorEmail → ตรวจบัญชีจริงใน DB + ACTIVE + บทบาทมีสิทธิ์ตาม RBAC (403 พร้อมระบุบทบาทที่มีสิทธิ์) — ทำให้ RBAC บังคับใช้จริง
- **API 9 เส้น**: rules (GET/POST/PATCH toggle+delete), run (GET history/POST รันจริง+สร้างสัญญาณ+คะแนนต่อมิติ), signals (GET/PATCH ทบทวน — CONFIRM|DISMISS พร้อม reviewedBy), exceptions (GET/POST/PATCH อนุมัติ|ปฏิเสธ), dashboard (คะแนนรวม/ต่อ dataset/ต่อมิติ), sample-preview (PII masking ตาม role) — ทุก mutation เขียน AuditLog
- **Seed ใหม่**: ข้อมูลตัวอย่าง sandbox 40 แถว (ลูกค้า 20 + ธุรกรรม 20) มีข้อผิดพลาดแฝงจงใจ (email ผิด/ว่าง, credit_limit เกินช่วง/ติดลบ, phone ผิดรูปแบบ, ชื่อ+email ซ้ำ, วันที่เก่า, currency แปลก, status นอกรายการ, txn_id ซ้ำ) + กฎเริ่มต้น 7 ข้อ + สัญญาณรอทบทวน 2 + คำขอข้อยกเว้น (PENDING 1 / APPROVED 1)
- **Frontend** (`src/components/core-features-console.tsx`) ฝังใน section `#features` ใต้การ์ด 4 ฟีเจอร์ — 4 แท็บ:
  1. Rule Builder — ฟอร์มประกอบกฎ + พารามิเตอร์ dynamic + preview ประโยค live (dark block) + รายการกฎ (toggle/ลบ/ผลรันล่าสุด)
  2. รันตรวจสอบ & สัญญาณ AI — เลือก dataset+ผู้รัน → score รวม + bar ต่อมิติ + ผลรายกฎพร้อมตัวอย่างแถวที่ล้มเหลว (mask PII ตามผู้รัน) + ทบทวนสัญญาณ (ยืนยัน/ปลด พร้อมผู้ทบทวน) + note "ML เป็นเพียงสัญญาณ ต้องมนุษย์ทบทวน ระบบไม่แก้ข้อมูลอัตโนมัติ"
  3. ข้อยกเว้น — ฟอร์มขอ (เหตุผล ≥10 ตัวอักษร + วันหมดอายุ) + อนุมัติ/ปฏิเสธโดยบทบาทที่มีสิทธิ์ + ประวัติ
  4. แดชบอร์ด — stat cards + คะแนนต่อ dataset + มิติอ่อนสุด + bar ต่อมิติ + **ตัวอย่าง PII masking live ตามบทบาท** (ประเมินฝั่ง backend)
- **Bug fix พิเศษ (จาก Agent Browser บน mobile)**: พบ horizontal overflow 973px บนจอ 390px — ต้นตอคือ `span.sr-only` (position:absolute) ใน cell ของตาราง matrix RBAC หลุด clip เพราะ scroll wrapper ไม่ใช่ positioned ancestor → **แก้ด้วยการเพิ่ม `relative` ให้ scroll wrappers** (matrix table, users table, PII preview) → mobile/desktop scrollWidth กลับมาเท่ากับ viewport แล้ว (390/390, 1280/1280)
- **Bug fix**: relation ที่ลืมประกาศ `DqException.rule → DqRule` (PrismaClientValidationError) + `buildRuleSentence` แสดง `[Dataset]` แทนชื่อจริงในผลรัน/audit
- **ผลทดสอบ Agent Browser (ผ่านทั้งหมด)**:
  - สร้างกฎใหม่ผ่านฟอร์ม (segment NOT_NULL) → toast + กฎ 7→8 ใน DB จริง ✅
  - ประโยค live preview: "For ลูกค้าองค์กร — Master, segment must not be empty, otherwise mark as ปานกลาง (MEDIUM)" ✅
  - รันตรวจสอบผ่าน UI → score 92.5/100 + bar 3 มิติ + ผลรายกฎ ผ่าน/ล้มเหลว + failedSamples ✅
  - ทบทวนสัญญาณ: ยืนยันด้วย DQ_ANALYST สำเร็จ (บันทึก reviewer) ✅ / BUSINESS_USER → **403 toast** แสดงบทบาทที่มีสิทธิ์ ✅
  - ข้อยกเว้น: ส่งคำขอผ่านฟอร์ม → PENDING 1 → อนุมัติด้วย DATA_OWNER → PENDING 0 ✅
  - PII preview: BUSINESS_USER เห็น "s•••••@acme.co.th" (masked) / DATA_OWNER เห็น "somsri@acme.co.th" (raw) ✅
  - แดชบอร์ด: 6 สัญญาณรอ / 0 ข้อยกเว้นรอ / 8 กฎ / 1/6 datasets รันแล้ว ✅
  - RBAC Console เดิมยังทำงาน (แท็บ users 8 แถว) ✅
  - Mobile 390px ไม่มี overflow แล้ว, desktop 1280px ปกติ, footer ชิดล่าง, ไม่มี console error, lint ผ่าน ✅
- bump `APP_VERSION` → `v0.4.0` (header + footer), commit + tag `v0.4.0` (push ตามกระบวนการ — ถาม token ก่อนเสมอ)

Stage Summary:
- **Core Features พร้อมใช้**: 4 ฟีเจอร์หลักทำงานจริงบนข้อมูลจริง — Rule Builder สร้างกฎเก็บ DB, รันตรวจสอบได้จริงบน sandbox rows, สัญญาณ AI ต้องมนุษย์ทบทวนเสมอ (403 ถ้าไม่มีสิทธิ์), ข้อยกเว้นต้องมีผู้อนุมัติ, แดชบอร์ด + PII masking ฝั่ง backend
- โครงสร้างใหม่: `prisma/schema.prisma` (+5 models), `scripts/seed.ts` (ขยาย), `src/lib/dq.ts`, `src/lib/operator.ts`, `src/app/api/dq/**` (9 routes), `src/components/core-features-console.tsx`, แก้ `src/app/page.tsx` + `src/components/rbac-console.tsx` (แก้ overflow)
- Version ปัจจุบัน: `v0.4.0` — rollback point ก่อนหน้า: `v0.3.0`





