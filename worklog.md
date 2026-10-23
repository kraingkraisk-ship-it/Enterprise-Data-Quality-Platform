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






---
## Task ID: 9
**Agent**: Z.ai Code (main)
**Version**: v0.4.0 (restore — ไม่มีการเปลี่ยนเวอร์ชัน, ไม่มีการแก้ source code)
**Task**: ผู้ใช้ขอ "Run version ที่ทำคู่มือให้ ของวันที่ 15 ตุลาคม 2569" — คู่มือฉบับ v1.0 ถูกอัปโหลดที่ `upload/dq-platform-user-guide.pdf|.html` → mapping: คู่มือ v1.0 (ฟีเจอร์ครบ 8 บทบาท/9 มิติ/10 เทมเพลต/5 แดชบอร์ด) = โค้ด **v0.4.0** → restore และรันให้ทดสอบ

Work Log:
- ก่อนหน้า (งานวินิจฉัย "หน้าจอสีขาว" — ไม่มี commit): พบ 2 สาเหตุซ้อนกัน ① dev server ดับ (sandbox rebuild ~11:49 สตาร์ท server ตอน boot เท่านั้น ไม่มี supervisor รีสตาร์ท) ② ตอนนั้น HEAD = 1d64e37 (v0.1.0-initial-source) ซึ่ง page.tsx เป็น placeholder โลโก้เดียวบนพื้นขาว (by design ของ version '1')
- บทเรียน sandbox: สตาร์ท server ด้วย `nohup ... &` หรือ `setsid ... &` เปล่าๆ ถูกเก็บทิ้งหลังจบ Bash session → ใช้ `(setsid nohup bun run dev > /dev/null 2>&1 < /dev/null &)` (double-detach ใน subshell) รอดข้าม session ยืนยันแล้ว
- Pre-flight: tags ครบ 8 ตัวในเครื่อง, v0.4.0 → commit 567f586 (มี core-features-console.tsx, rbac-console.tsx, api/dq+rbac, seed.ts)
- `git reset --hard v0.4.0` → HEAD = 567f586, tree สะอาด (untracked: upload/, db/, dev.log ไม่ถูกแตะ)
- `bun install` (no changes) → `bun run db:push` (schema sync อยู่แล้ว — db file คงอยู่จากยุค v0.4.0) → `bunx tsx scripts/seed.ts` สำเร็จ (users 10, datasets 6, grants 27, sampleRows 40, rules 7, signals 2, exceptions 2)
- pkill server เก่า → สตาร์ทใหม่แบบ persistent → HTTP 200 (next-server pid 4580)
- **ทดสอบ Agent Browser ผ่านทั้งหมด**:
  - หน้าแรก render เต็ม: hero + nav 5 หมวด + badge v0.4.0 + Rule Grammar "For [Dataset], [Column] must [Condition] using [Parameters] when [Optional filter], otherwise mark as [Severity]" ตรงคู่มือบทที่ 5 ✅
  - แท็บ Rule Builder: ฟอร์มครบ + ผู้ดำเนินการ "สมชาย วิชาการดี — เจ้าของข้อมูล" (seed) + รายการกฎ 7 ข้อ ✅
  - แท็บรันตรวจสอบ & สัญญาณ AI: ผู้รัน "มาลี รักษาข้อมูล" (RUN_VALIDATION) / ผู้ทบทวน (REVIEW_SIGNALS) — ปุ่มรัน disabled จนเลือกครบ = RBAC gating ทำงาน ✅
  - แท็บแดชบอร์ด: "สวมบทบาท" + 6 datasets พร้อมป้าย (มี/ไม่มี PII) ✅
  - PII masking live: "ค••••••••", "ร••••@acme.co.th", "081••••••" — ตรงคู่มือบทที่ 10.2 ✅
  - **รัน validation จริง**: toast "รันตรวจสอบสำเร็จ — ตรวจ 4 กฎ จาก 20 แถว — สัญญาณใหม่ 5 รายการ (รอมนุษย์ทบทวน)" + badge สัญญาณ 2→7 + ผลรายกฎ ผ่าน/ล้มเหลว 3/20 + คะแนนรวม ✅
  - ไม่มี console error / page error ✅
- หมายเหตุ push: remote main ชี้ 1d64e37 ซึ่ง**เป็นบรรพบุรุษของ 567f586** → push แบบ fast-forward ได้ (ไม่ต้อง force) — รอ token ตาม workflow

Stage Summary:
- แพลตฟอร์มกลับมารันฉบับเต็ม **v0.4.0** = ฉบับที่คู่มือ "เวอร์ชัน 1.0 · 15 ตุลาคม 2569" อธิบายครบทุกฟีเจอร์ — ไม่มีการแก้ source code (tree = v0.4.0 เป๊ะ)
- Rollback Reference: สถานะก่อน restore นี้ = 1d64e37 (tag `v0.1.0-initial-source`) — กลับได้ด้วย `git reset --hard v0.1.0-initial-source`
- สถานะ push: **รอ token** จากผู้ใช้เพื่อ push commit worklog นี้ (fast-forward, sync remote main กลับสู่แนว v0.4.0)

---

## Task ID: 10
**Agent**: Z.ai Code (main orchestrator)
**Task**: พัฒนา v0.5.0 — ปรับปรุง Rule Builder ตาม 3 ความต้องการ: (1) แสดงตัวอย่างข้อมูลและเลือกคอลัมน์จากชุดข้อมูลจริง (2) กฎหนึ่งข้อใช้ร่วมกับหลายชุดข้อมูล (3) เงื่อนไข (must) สร้างเองและจัดเก็บเป็นส่วนกลางของระบบ

Work Log:
- เริ่มจากสถานะ v0.4.0 (`567f586` + worklog commit `2b74029`) ตรวจสอบโครงสร้าง schema/โค้ดเดิมทั้งหมด
- **Schema (prisma/schema.prisma)**: สร้าง model `ConditionTemplate` (คลังเงื่อนไขส่วนกลาง: key/name/sentence/dimension/engineType/params JSON/isSystem/enabled/createdBy) และ model `RuleDataset` (many-to-many กฎ ↔ ชุดข้อมูล, @@unique([ruleId, datasetId])) — ตัด `datasetId` ออกจาก `DqRule` เปลี่ยน `Dataset.rules` ให้ชี้ `RuleDataset[]` — push ด้วย `bun run db:push`
- **Engine (src/lib/dq.ts)**: `buildRuleSentence` รองรับ `datasetNames[]` (กฎหลายชุดข้อมูล) + `conditionSentence`/`engineType` (จาก template) — `evaluateRule` สลับมาใช้ `engineType` แทน condition enum ตายตัว — เพิ่ม `isDimensionKey`, `parseTemplateParams`, `ENGINE_DESCRIPTIONS`, `ENGINE_REQUIRED_PARAM_KEYS`, `generateTemplateKey` (รหัส CUSTOM_xxxx ไม่ซ้ำ)
- **API ใหม่**: `GET/POST /api/dq/conditions` (คลังเงื่อนไข + สร้างใหม่, ใช้สิทธิ์ MANAGE_RULES, ตรวจพารามิเตอร์ครบตามที่เอนจินบังคับ) — `PATCH/DELETE /api/dq/conditions/[id]` (เปิด/ปิด/ลบ — ห้ามลบของระบบ ห้ามลบถ้ามีกฎใช้อ้างอิง 409) — `GET /api/dq/dataset-preview?datasetIds=...` (ตัวอย่างข้อมูลหลายชุด + สรุปคอลัมน์ union พร้อม availableIn/missingIn + ปิดบัง PII ฝั่ง backend ตามบทบาท)
- **API ปรับปรุง**: `POST /api/dq/rules` รับ `datasetIds[]` + ตรวจ condition ต้องมาจากคลัง + ตรวจคอลัมน์มีจริงใน sample ของทุก dataset — `GET /api/dq/rules` ส่ง `datasetIds/datasetNames/conditionName/engineType` + ประโยคจาก template — `POST /api/dq/run` หากฎผ่าน `datasets: { some: { datasetId } }` มิติจาก `template.dimension` ส่ง `conditionName`/`skipped` — `dashboard` ใช้ nested include ผ่าน RuleDataset — `exceptions` ตรวจกฎ-ชุดข้อมูลผ่าน join + ruleLabel ใช้ชื่อ template
- **Seed**: เพิ่มเงื่อนไขมาตรฐาน 7 รายการ (isSystem) + ตัวอย่างที่ผู้ใช้สร้าง 4 รายการ (TH_PHONE/NON_NEGATIVE/SUPPORTED_CURRENCY/FRESH_DATA) — กฎ 8 ข้อ โดยกฎ phone (CUSTOM_TH_PHONE) ใช้ร่วม 2 ชุดข้อมูล (ลูกค้า + พนักงาน HR) = 9 ลิงก์
- **UI (core-features-console.tsx ใหม่ทั้งไฟล์)**: แท็บ Rule Builder — เลือกชุดข้อมูลแบบ checkbox หลายชุด (เลือกทั้งหมด/ล้าง/นับจำนวน) + ตารางตัวอย่างข้อมูล 5 แถว (สลับดูได้เมื่อเลือกหลายชุด, PII masked ตามบทบาทผู้ดำเนินการ) + dropdown คอลัมน์จากข้อมูลจริง (union + เตือนคอลัมน์ที่ไม่พบในบางชุด, ไม่มี sample → พิมพ์เอง) + เงื่อนไขแบ่งกลุ่ม "มาตรฐานของระบบ / ส่วนกลางที่สร้างเอง" + params ไดนามิกจาก template + ประโยค live preview — แท็บใหม่ "คลังเงื่อนไข (must)" — ฟอร์มสร้างเงื่อนไข (ชื่อไทย/อังกฤษ, ประโยค must, มิติ 9 แบบ, เอนจิน 7 แบบพร้อมคำอธิบาย, พารามิเตอร์เติมอัตโนมัติตามเอนจิน แก้ label/placeholder/เพิ่ม-ลบแถวได้) + รายการทั้งหมดพร้อม badge ของระบบ/ผู้ใช้, จำนวนกฎที่ใช้, ปุ่มเปิด-ปิด/ลบ (ลบ disabled เมื่อมีกฎใช้) — แท็บอื่นปรับให้แสดง conditionName และ badge ชุดข้อมูลหลายตัว
- **ทดสอบด้วย agent-browser จริง**: เลือกชุดข้อมูล → ตารางตัวอย่างโผล่ → เลือกคอลัมน์ email → เงื่อนไข EMAIL → ประโยคถูกต้อง → บันทึกสำเร็จ; เลือก 2 ชุดข้อมูล → ข้อความ "ใช้ตรวจทั้ง 2 ชุดข้อมูล" → เงื่อนไขส่วนกลาง "หมายเลขโทรศัพท์ไทย 10 หลัก" + กรอก pattern → สร้างกฎร่วมสำเร็จ รายการแสดง 2 dataset badges; สร้างเงื่อนไขใหม่ "รหัสประชาชนไทย 13 หลัก" ผ่านฟอร์ม (11 → 12 รายการ) และปรากฏใน dropdown; รันตรวจสอบ 6 กฎ บน 20 แถว มิติ/ชื่อเงื่อนไขถูกต้อง; แท็บข้อยกเว้นแสดงกฎร่วมด้วยชื่อ template; มือถือ 390px layout ปกติ; แก้ dev server ใช้ Prisma client เก่า (restart) และแก้ UX params ไม่เติมอัตโนมัติตอนเปิดฟอร์ม
- เพิ่ม APP_VERSION เป็น v0.5.0, ตรวจ `bun run lint` สะอาด, re-seed ข้อมูลสาธิต

Stage Summary:
- **v0.5.0 ครบ 3 ความต้องการ**: (1) Dataset preview + เลือกคอลัมน์จากข้อมูลจริง (2) กฎใช้ร่วมหลายชุดข้อมูลผ่านตาราง RuleDataset (3) คลังเงื่อนไขส่วนกลาง — สร้าง/ใช้/ปิด/ลบได้ พร้อม guard ตามหลัก RBAC + audit log ทุกเหตุการณ์
- Rollback Reference: ก่อนงานนี้ local อยู่ที่ `2b74029` (= v0.4.0 `567f586` + worklog) — กู้คืนด้วย `git reset --hard 2b74029 && bun run db:push && bunx tsx scripts/seed.ts`
- Commit นี้: v0.5.0 (tag `v0.5.0`) — รอ push ขึ้น GitHub เมื่อผู้ใช้แนบ token (one-time URL ตาม workflow)

---
## Task ID: 11
**Agent**: Z.ai Code (main orchestrator)
**Task**: Push v0.5.0 ขึ้น GitHub ด้วย token ที่ผู้ใช้แนบ (one-time URL ตาม workflow) + verify remote

Work Log:
- สถานะก่อน push: local main = `d0c979e` (v0.5.0) นำ remote (1d64e37) อยู่ 9 commits, tag `v0.5.0` ยังไม่อยู่บน remote, dev server รัน v0.5.0 (HTTP 200) อยู่แล้ว
- Push ด้วย one-time token URL (`https://<token>@github.com/...` ตรงในคำสั่ง push — ไม่แก้ origin, ไม่บันทึกลง git config ทุกรูปแบบ) พร้อม redact token ออกจาก output ทุกขั้น
- `git push <url> main` → `1d64e37..d0c979e main -> main` (fast-forward ตามคาด, EXIT=0)
- `git push <url> tag v0.5.0` → `* [new tag] v0.5.0 -> v0.5.0` (EXIT=0)
- Verify remote ด้วย `git ls-remote origin` (public read ไม่ต้องใช้ token): `refs/heads/main` = `d0c979e` และ `refs/tags/v0.5.0` = `d0c979e` — ตรงกับ local เป๊ะทุก hash
- ตรวจ token ไม่ตกค้าง: `git config --list | rg -i "github_pat|token"` = ไม่พบ, `git remote get-url origin` = URL ปกติไม่มี token
- `git fetch origin` อัปเดต tracking ref → `main...origin/main` ไม่มี ahead/behind = sync สมบูรณ์

Stage Summary:
- **Remote main ปัจจุบัน = `d0c979e` (v0.5.0)** — ครอบคลุม 9 commits: v0.2.0 (แก้หน้าขาว) → v0.3.0 (RBAC) → v0.4.0 (Core Features ตรงคู่มือ) → worklog Task 9 (restore v0.4.0) → **v0.5.0 (Rule Builder 3 requirement)** + worklog commit ระหว่างทาง
- Tags บน remote ครบ 9 ตัว รวม `v0.5.0` — rollback point ล่าสุดก่อนหน้า: `v0.4.0` (567f586)
- Token ถูกใช้เฉพาะใน push command (one-time URL) ไม่มีการบันทึกลงไฟล์/config ใดๆ
- Commit นี้ (worklog Task 11) จะถูก push ตามด้วยเพื่อให้ remote สะท้อนบันทึกฉบับเต็ม

---
## Task ID: 12
**Agent**: Z.ai Code (main orchestrator)
**Version**: v0.6.0 (feat — Enterprise UX/UI: left sidebar navigation shell)
**Task**: ผู้ใช้ขอ "ออกแบบหน้า UX/UI ให้ดูทันสมัย ระดับ enterprise ต้องการ menu อยู่ทางด้านซ้ายมือ" — ปรับ layout ทั้งแอปเป็น App Shell แบบ sidebar โดยคงฟังก์ชัน v0.5.0 ทั้งหมด

Work Log:
- **กู้คืนสภาพแวดล้อมก่อนพัฒนา (sandbox rebuild ระหว่าง session)**: พบ local git ถูกย้อนกลับเป็นสแนปช็อตเก่า (HEAD=1565367 ก่อน v0.5.0, tag หาย 5 ตัว, v0.4.0 ชี้ hash ต่างจากเดิม) → ยืนยัน remote ยังครบ (origin/main=5cbd0d4, tag v0.5.0=d0c979e) → `git fetch origin --tags --prune` + `git reset --hard origin/main` กู้คืนโค้ด v0.5.0 เต็ม → db:push + re-seed (rules 8, ruleDatasetLinks 9) → รีสตาร์ท dev server แบบ double-detach → HTTP 200 + API คลังเงื่อนไขทำงาน
- **ไฟล์ใหม่ 3 ไฟล์**: (1) `src/lib/views.ts` — View registry ศูนย์กลาง: APP_VERSION, ViewKey (dashboard/rules/conditions/run/exceptions/rbac/about), VIEWS metadata (ไทย/อังกฤษ/คำอธิบาย/ไอคอน), NAV_GROUPS 3 กลุ่ม, isCoreView() (2) `src/components/app-sidebar.tsx` — sidebar ซ้ายด้วย shadcn/ui sidebar primitives: brand block, กลุ่มเมนู ภาพรวม/คุณภาพข้อมูล/การกำกับดูแล, live badges (สัญญาณรอทบทวน/ข้อยกเว้นรออนุมัติ/จำนวนเงื่อนไข — ดึงทุก 45 วิ + ตอนสลับหน้า), sidebar footer (สถานะระบบ + version + PDPA), SidebarRail, ปิด drawer เองเมื่อคลิกบนมือถือ, aria-current (3) `src/components/platform-overview.tsx` — เนื้อหาแนะนำเดิม (hero, 9 มิติ, ฟีเจอร์, workflow 5 ขั้น, security, sources, standards) ย้ายมาเป็น view "เกี่ยวกับแพลตฟอร์ม" + CTA นำทางเข้าหน้าจริง
- **Rewrite `src/app/page.tsx`** เป็น App Shell: SidebarProvider → AppSidebar + SidebarInset (header sticky / main / footer mt-auto) — header มี SidebarTrigger + ชื่อหน้า+คำอธิบายตาม view + ป้ายภาษาอังกฤษ + version badge, skip link "ข้ามไปยังเนื้อหาหลัก" (WCAG), scroll-to-top + focus main เมื่อสลับหน้า, สลับ view ด้วย state เดียว — RBAC + CoreConsole คง mounted ตลอด (สลับด้วย .hidden) เพื่อไม่ให้สถานะฟอร์ม/ข้อมูลหาย, footer dark เดิมติดล่าง (mt-auto + min-h-svh)
- **แก้ `core-features-console.tsx` แบบ minimal**: เปลี่ยน Tabs จาก uncontrolled เป็น controlled ด้วย props {activeView, onViewChange} จาก sidebar, ลบ TabsList (เมนูซ้ายแทนที่), ลบ icon LayoutDashboard/imports ที่ไม่ใช้ — TabsContent ทั้ง 5 บล็อกและ logic ภายในไม่แตะต้อง
- **Lint**: แก้ react-hooks/set-state-in-effect (ย้าย initial fetch เป็น IIFE ใน effect + helper fetchNavCountsInto สำหรับ interval) → ผ่านสะอาด
- **ทดสอบ agent-browser ครบ**: desktop 1440px — sidebar + badges live (11 เงื่อนไข/2 สัญญาณ/1 ข้อยกเว้น), สลับครบ 7 view; **golden path Rule Builder**: เลือก dataset → ตาราง preview 5 แถว (PII masked) → dropdown คอลัมน์จากข้อมูลจริง 7 ตัว → เงื่อนไขจากคลัง → ประโยคถูกต้อง → บันทึก → toast "สร้างกฎใหม่สำเร็จ" + กฎ 9 ข้อ (ยืนยันผ่าน API) + form reset; RBAC permission matrix 8×8; มือถือ 390px — hamburger → drawer overlay → คลิกแดชบอร์ด → ปิดเอง + layout ปรับตัว; footer ติดล่างจอทั้งหน้าสั้นและยาว; ไม่มี page error / console error
- หมายเหตุ: agent-browser `select` command ใช้กับ Radix combobox ไม่ได้ (ต้อง click เปิดแล้ว click option) — เป็นข้อจำกัดของเครื่องมือ ไม่ใช่ bug ของแอป

Stage Summary:
- **v0.6.0 = UX ระดับ enterprise**: เมนูซ้าย 3 กลุ่ม (ภาพรวม/คุณภาพข้อมูล/การกำกับดูแล) + header sticky แสดงบริบทหน้า + live badges + footer sticky + skip link + focus management (WCAG 2.2 AA) + มือถือเป็น drawer
- ฟังก์ชัน v0.5.0 ครบถ้วนไม่สูญหาย — ตรวจด้วย golden path จริงบนเบราว์เซอร์
- Rollback Reference: ก่อนงานนี้ = `5cbd0d4` (v0.5.0) — กู้คืนด้วย `git reset --hard 5cbd0d4 && bun run db:push && bunx tsx scripts/seed.ts`
- Version: v0.6.0 (minor bump — ฟีเจอร์ใหม่ด้าน UX, ไม่มี breaking change ต่อ API)

---
## Task ID: 13
**Agent**: Z.ai Code (main orchestrator)
**Version**: v0.6.0 (push + remote verification — no code change)
**Task**: Push v0.6.0 ขึ้น GitHub ด้วย token ใหม่ที่ผู้ใช้แนบ (one-time URL ตาม workflow) + verify remote

Work Log:
- สถานะก่อน push: local main = `65a5ac6` (v0.6.0 + worklog Task 12 รวมใน commit เดียวกัน), tag `v0.6.0` ชี้ `65a5ac6` — พบว่า remote ได้รับ v0.6.0 ไปแล้วจาก session ก่อนหน้า (tracking ref + ls-remote ตรงกัน) ผู้ใช้ส่ง token ใหม่พร้อมข้อความ "ช่วย push ที" — รัน push จริงเพื่อยืนยันแบบ definitive
- Pre-flight ผ่าน: `git show --stat 65a5ac6` ครบ 6 ไฟล์ (page.tsx rewrite, app-sidebar.tsx ใหม่, platform-overview.tsx ใหม่, views.ts ใหม่, core-features-console.tsx ปรับ, worklog.md), `git config --list | rg -i "github_pat|token"` = clean, dev server HTTP 200
- Push ด้วย one-time token URL ตรงในคำสั่ง (ไม่แก้ origin, ไม่บันทึกลง git config ทุกรูปแบบ) + redact token ออกจาก output ทุกขั้น: `git push <url> main` → **Everything up-to-date** (EXIT=0), `git push <url> tag v0.6.0` → **Everything up-to-date** (EXIT=0) — ยืนยันว่า remote มี v0.6.0 ครบแล้วจริง
- Verify ด้วย `git ls-remote origin` (public read ไม่ใช้ token): refs/heads/main = `65a5ac6` และ refs/tags/v0.6.0 = `65a5ac6` — ตรงกับ local HEAD เป๊ะทุก hash
- บันทึก worklog Task 13 (ส่วนนี้) → commit → push ด้วย token เดิม → verify รอบสุดท้าย + `git fetch origin` sync tracking ref + ตรวจ config ปิดท้าย

Stage Summary:
- **Remote main = `65a5ac6` (v0.6.0 Enterprise UX/UI) + tag `v0.6.0` ครบสมบูรณ์บน GitHub** — sync กับ local 100%
- v0.6.0 สรุป: sidebar ซ้าย 3 กลุ่มเมนู (ภาพรวม/คุณภาพข้อมูล/การกำกับดูแล) + live badges, sticky header/footer, mobile drawer, skip link + focus management (WCAG 2.2 AA), ฟังก์ชัน v0.5.0 ครบถ้วน (dataset preview + column picker, กฎใช้ร่วมหลายชุดข้อมูล, คลังเงื่อนไขส่วนกลาง)
- Rollback point ก่อนหน้า: `v0.5.0` (d0c979e)
- Token ถูกใช้เฉพาะใน push command (one-time URL) ไม่มีบันทึกลงไฟล์/config ใดๆ — config ตรวจ clean ทุกครั้ง

---
## Task ID: 14
**Agent**: Z.ai Code (main orchestrator)
**Version**: v0.7.0 (feat — DQ Dimensions ตามมาตรฐาน DAMA-DMBOK 9 มิติ + Dimension Picker UX ใหม่)
**Task**: ผู้ใช้ขอให้ "Data Quality Rule check อ้างอิง 9 มิติ ตาม DAMA-DMBOK (Accuracy, Completeness, Consistency, Validity, Uniqueness, Integrity, Timeliness, Currentness, Reasonableness) พร้อมออกแบบหน้าตั้งค่าให้ผู้ใช้งานใช้ง่ายและเข้าใจง่าย"

Work Log:
- **มิติใหม่ตาม DAMA-DMBOK เป๊ะ (src/lib/dq.ts)**: เปลี่ยน DimensionKey 9 ค่า — ตัด VOLUME/SCHEMA_CONFORMANCE เพิ่ม CURRENTNESS/REASONABLENESS เรียงตามที่ผู้ใช้กำหนด — สร้าง `DimensionMeta` (th/en/คำถามช่วยเลือก/คำอธิบาย/ตัวอย่างการตรวจ/เอนจินแนะนำ/สี badge/ไอคอน) — DIMENSION_LABELS กลายเป็นอนุพันธ์ของ DIMENSION_META (แหล่งเดียว) — จุด mapping ใหม่: RANGE→REASONABLENESS, MAX_AGE_DAYS→CURRENTNESS, ML schema drift→CONSISTENCY, ML outlier→REASONABLENESS, ML volume→COMPLETENESS
- **Seed**: ปรับมิติเท็มเพลตเดิม 4 รายการ + เพิ่มเงื่อนไขตัวอย่าง 3 รายการให้คลังครอบคลุมครบ 9 มิติ (CUSTOM_SEGMENT_STD/ACCURACY, CUSTOM_BRANCH_REF/INTEGRITY, CUSTOM_DAILY_REFRESH/TIMELINESS) + กฎใหม่ segment (ACCURACY) = เงื่อนไข 14 รายการ กฎ 9 ข้อ + สัญญาณ AI ตัวอย่างปรับมิติ (REASONABLENESS/COMPLETENESS) — re-seed สำเร็จ
- **Component ใหม่ (src/components/dimension-picker.tsx)**: DimensionPicker — radio group การ์ด 9 ใบ (ไอคอน lucide + ชื่อไทย/อังกฤษ + เลือกแล้วขอบเขียว + เครื่องหมายถูก, keyboard accessible, responsive 3 คอลัมน์→1 คอลัมน์บนมือถือ) / DimensionHint — กล่องคำอธิบายมิติที่เลือก (คำถาม + ตัวอย่าง + เอนจินแนะนำ) / DimensionBadge — ป้ายมิติมีสี + tooltip ใช้ในรายการเงื่อนไข/ผลรัน/สัญญาณ AI (fallback ปลอดภัยเมื่อมิติไม่รู้จัก)
- **Core Console**: แทน dropdown มิติในฟอร์มสร้างเงื่อนไขด้วย DimensionPicker + DimensionHint เต็มความกว้าง — badge มิติทุกจุดเปลี่ยนเป็น DimensionBadge (คลังเงื่อนไข / ผลรัน / สัญญาณ AI) — เพิ่ม field `dimension` ใน type ผลรันฝั่ง client
- **Platform Overview**: หมวด 9 มิติ derive จาก DIMENSION_META (ไอคอน/สี/คำอธิบายเดียวกับทั้งแอป) + หัวข้อเน้น "ตามมาตรฐาน DAMA-DMBOK" พร้อมรายชื่อมิติ EN ครบ — เก็บกวาด lucide import ที่เลิกใช้ 9 ตัว
- **views.ts**: APP_VERSION → v0.7.0 + คำอธิบายหน้า about ระบุ DAMA-DMBOK
- **ตรวจสอบจริงด้วย agent-browser (ทองสุดท้ายผ่านหมด)**: (1) picker แสดง 9 มิติ radio cards ตรงลำดับผู้ใช้ (2) คลิก Reasonableness → hint เปลี่ยนทันที (คำถาม/ตัวอย่างวงเงิน 0–1,000,000/เอนจิน RANGE REGEX) (3) สร้างเงื่อนไข "อายุลูกค้าสมเหตุสมผล" ผ่าน picker สำเร็จ — API ยืนยัน dimension=REASONABLENESS (4) คลังครบ 9/9 มิติ 15 รายการ (5) รันตรวจ dataset ลูกค้า+ธุรกรรม — ผลรันแสดง badge ความสมเหตุสมผล/ความเป็นปัจจุบัน/ความสอดคล้อง/ความไม่ซ้ำซ้อน + tooltip คำอธิบาย (6) สัญญาณ AI ปริมาณธุรกรรม = COMPLETENESS (7) แดชบอร์ดคะแนนเฉลี่ยตามมิติใหม่ (8) Rule Builder สร้างกฎด้วยเงื่อนไขใหม่: "For ลูกค้าองค์กร — Master, credit_limit must be a plausible customer age in years using [0 – 120]…" บันทึกสำเร็จ (9) มือถือ 390px — drawer + picker 1 คอลัมน์ (10) ไม่มี console/page error, lint สะอาด
- หมายเหตุกระบวนการ: MultiEdit กับไฟล์ seed.ts เกิด partial-apply (tool แจ้ง fail แต่ edit ก่อนหน้าถูก apply) — แก้ด้วยสคริปต์ python assert ทุกจุดจนครบ + ตรวจด้วย rg

Stage Summary:
- **v0.7.0 = ระบบมิติคุณภาพข้อมูลอ้างอิง DAMA-DMBOK 9 มิติครบถ้วน** — ทุกเงื่อนไข/กฎ/ผลรัน/สัญญาณ/แดชบอร์ด/หน้าแนะนำ ใช้ชุดมิติเดียวกันจากแหล่งเดียว (DIMENSION_META)
- **UX ตั้งค่าใหม่**: เลือกมิติด้วยการ์ดไอคอน + คำถามช่วยตัดสินใจ + ตัวอย่าง + เอนจินแนะนำ — ลดการเดาความหมาย ผู้ไม่ใช่ IT ก็เข้าใจได้
- Rollback Reference: ก่อนงานนี้ = `bd8cfaf` (v0.6.0 + worklog Task 13) — กู้คืนด้วย `git reset --hard bd8cfaf && bun run db:push && bun scripts/seed.ts`
- Version: v0.7.0 (minor bump — เปลี่ยนชุดมิติเป็นมาตรฐานใหม่ + ฟีเจอร์ picker; API shape ไม่เปลี่ยน)

---

## Task ID: 14-result
**Agent**: Z.ai Code (main orchestrator)
**Task**: Push v0.7.0 ขึ้น GitHub + remote verification (บันทึกผล push ครั้งแรกของ v0.7.0)

Work Log:
- ตรวจสถานะก่อน push: local HEAD = `03801bf` (v0.7.0, commit ค้างจาก session ก่อน), tag `v0.7.0` ชี้ตรง HEAD, remote main ยังอยู่ที่ `bd8cfaf` — working tree สะอาด
- ตรวจคุณภาพก่อน push: `bun run lint` สะอาด + dev.log ไม่มี error (API ทุกเส้น 200) + agent-browser smoke test — หน้าแดชบอร์ดขึ้น v0.7.0, คลังเงื่อนไขมี Dimension Picker แสดงครบ 9 การ์ดมิติ ตรงลำดับ DAMA-DMBOK ที่ผู้ใช้กำหนด (Accuracy → Completeness → Consistency → Validity → Uniqueness → Integrity → Timeliness → Currentness → Reasonableness), ไม่มี page/console error
- Push ด้วย token ใหม่จากผู้ใช้ (one-time URL ตรงในคำสั่ง push, ไม่บันทึกลง git config) สำเร็จ EXIT=0:
  - `bd8cfaf..03801bf  main -> main`
  - `* [new tag]  v0.7.0 -> v0.7.0` (tag ถูกสร้างครั้งแรกบน remote)
- Verify remote ด้วย `git ls-remote origin main refs/tags/v0.7.0`: ทั้ง `refs/heads/main` และ `refs/tags/v0.7.0` = `03801bf5c530dd06e58f30f70ce4d5c9ca4f0c8f` ตรง local HEAD/แท็กทุกประการ

Stage Summary:
- **v0.7.0 อยู่บน GitHub remote สมบูรณ์** (main + tag) — remote = local = `03801bf`
- Rollback points บน remote: `v0.7.0` (03801bf, 9 มิติ DAMA-DMBOK) ← ย้อนกลับได้ที่ `v0.6.0` (65a5ac6) / `v0.5.0` (d0c979e) / `v0.4.0` (567f586)
- Token ใช้เฉพาะใน push command (one-time URL) ไม่มีบันทึกลงไฟล์/config ใดๆ — ผู้ใช้ควร revoke หลังใช้งาน
- คำสั่ง rollback กลับไป v0.6.0 บนเครื่อง local: `git reset --hard 65a5ac6 && bun run db:push && bun scripts/seed.ts`

---
## Task ID: 15
**Agent**: Z.ai Code (main orchestrator)
**Version**: v0.8.0 (feat — เอนจินประเมินผลครอบคลุม 9/9 มิติ DAMA-DMBOK + Engine Picker UX ใหม่)
**Task**: ผู้ใช้ขอให้ "เอนจินประเมินผลกำหนด Rule ให้เป็นไปตาม 9 มิติของ DAMA-DMBOK และทำให้ใช้งาน/เข้าใจง่าย"

Work Log:
- **เอนจินใหม่ 3 ตัว (src/lib/dq.ts)** ให้ทุกมิติมีเอนจินของตัวเอง — รวม 10 เอนจิน: (1) REFERENCE_MATCH→ACCURACY ตรงค่ามาตรฐานระบบต้นทาง (2) MAX_AGE_HOURS→TIMELINESS อายุข้อมูลหน่วยชั่วโมงตาม SLA (3) EXISTS_IN_DATASET→INTEGRITY Referential Integrity ข้ามชุดข้อมูลจริง — เพิ่มชนิดพารามิเตอร์ 'dataset'/'dataset-column' + TEMPLATE_PARAM_TYPES + DIMENSION_ENGINES (กลุ่มเอนจินต่อมิติ) + evaluateRule รับ EvaluationContext (refValues) + formatParamValue แสดง "exists in {ชื่อทะเบียน}.{คอลัมน์}"
- **EnginePicker (src/components/engine-picker.tsx ใหม่)**: EngineBadge (ไอคอน+tooltip) / EnginePicker (radio การ์ด 10 เอนจิน จัดกลุ่มตาม 9 มิติ — กลุ่มมิติที่เลือกไฮไลต์ + ป้าย "มิติที่เลือก") / EngineHint (อธิบายวิธีตรวจ + พารามิเตอร์ + มิติที่ผูก)
- **Guided flow ฟอร์มสร้างเงื่อนไข**: ขั้นที่ 1 เลือกมิติ (DimensionPicker) → ระบบสลับไปเอนจินแนะนำแรกของมิตินั้น + เติมนิยามพารามิเตอร์อัตโนมัติ → ขั้นที่ 2 เลือกเอนจินจากการ์ดจัดกลุ่มมิติ — เพิ่ม type select (ข้อความ/ตัวเลข/เลือกชุดข้อมูล/เลือกคอลัมน์อ้างอิง) ต่อแถวพารามิเตอร์ + coverage strip "ครอบคลุมมิติ X/9" ในรายการคลัง + EngineBadge ทุกการ์ดเงื่อนไข
- **Rule Builder**: พารามิเตอร์ชนิด dataset → dropdown ชุดข้อมูลทั้งระบบ / dataset-column → dropdown คอลัมน์จริงของชุดข้อมูลอ้างอิง (โหลดผ่าน dataset-preview API พร้อม cache + ล้างค่าคอลัมน์เมื่อเปลี่ยนทะเบียนอ้างอิง) + EngineBadge ในแถบข้อมูลเงื่อนไข + ประโยคพรีวิวแสดงชื่อทะเบียนอ้างอิงจริง
- **API**: /api/dq/run รองรับ EXISTS_IN_DATASET (โหลดค่าอ้างอิงจากทะเบียน + cache + พารามิเตอร์ไม่ครบ→skip อย่างชัดเจน) และ fallback มิติจาก CONDITIONS / /api/dq/rules validateParamsForTemplate เพิ่ม 3 เอนจิน + GET/POST ส่ง refDatasetName ให้ประโยค / /api/dq/conditions รับชนิดพารามิเตอร์ใหม่ 4 แบบ
- **Seed v0.8.0**: เท็มเพลตระบบเพิ่ม 3 (REFERENCE_MATCH/MAX_AGE_HOURS/EXISTS_IN_DATASET) = มาตรฐาน 10 + ผู้ใช้สร้าง 7 = 17; ชุดข้อมูลใหม่ "ทะเบียนบัญชีธนาคาร" (18 แถว จงใจไม่มี ACC-77019/77020); กฎใหม่ 2 (TIMELINESS txn_date SLA 72 ชม. + INTEGRITY account_no อ้างทะเบียนบัญชี) + CUSTOM_SEGMENT_STD สลับเป็น REFERENCE_MATCH — re-seed สำเร็จ (17 templates / 11 rules / 7 datasets / 58 rows)
- **ตรวจจริงด้วย agent-browser + API (ผ่านหมด)**: (1) run API — TIMELINESS fail 16/20, INTEGRITY fail 2/20 (ACC-77019/77020 ตามที่จงใจ), ACCURACY pass 0 fail, skipped=0 (2) ประโยคกฎ "For รายการธุรกรรมรายวัน, account_no must exist in the reference dataset column using exists in ทะเบียนบัญชีธนาคาร.account_no" (3) EnginePicker 10 เอนจิน 9 กลุ่มมิติ (4) guided flow คลิก Accuracy → เอนจินสลับ REFERENCE_MATCH + hint ทันที (5) Rule Builder เลือกทะเบียนบัญชีธนาคาร → dropdown คอลัมน์จริง (account_no/account_name/status/opened_at) → พรีวิวประโยคถูกต้อง (6) แท็บรันตรวจแสดง badge ความทันเวลา/ความเชื่อมโยงถูกต้อง (7) มือถือ 390px ไม่มี horizontal overflow (แก้ grid blowout ด้วย min-w-0 + break-words) (8) ไม่มี console/page error (แก้บั๊ก <dIcon> casing) — lint สะอาด

Stage Summary:
- **v0.8.0 = เอนจินประเมินผลครอบคลุม 9/9 มิติ DAMA-DMBOK ครบถ้วน** — มิติไหนก็มีเอนจินตรวจของตัวเอง: ACCURACY=REFERENCE_MATCH, COMPLETENESS=NOT_NULL, CONSISTENCY=IN_LIST, VALIDITY=EMAIL/REGEX, UNIQUENESS=UNIQUE, INTEGRITY=EXISTS_IN_DATASET, TIMELINESS=MAX_AGE_HOURS, CURRENTNESS=MAX_AGE_DAYS, REASONABLENESS=RANGE
- **UX ใหม่**: การ์ดเอนจินจัดกลุ่มตามมิติ + guided flow มิติ→เอนจิน→พารามิเตอร์อัตโนมัติ + coverage strip 9 มิติ — ผู้ใช้ไม่ต้องเดาว่ามิติไหนใช้เอนจินอะไร
- Rollback point: ก่อนงานนี้ = `a71edf5` (v0.7.0 + worklog Task 14-result) — กู้คืน `git reset --hard a71edf5 && bun run db:push && bun scripts/seed.ts`
- Version: v0.8.0 (minor bump — ฟีเจอร์เอนจินใหม่ 3 ตัว + guided UX; schema ไม่เปลี่ยน)

---
## Task ID: 16
**Agent**: Z.ai Code (main orchestrator)
**Version**: v0.9.0 (feat — ชั้น "มาตราการประเมิน" 9 มาตรา DAMA-DMBOK + คำตัดสินภาษาคน + scorecard UX)
**Task**: ผู้ใช้ขอให้ "เอนจินประเมินผลประเมิน Rule ให้เป็นไปตามมาตราตาม 9 มิติของ DAMA-DMBOK และทำให้ใช้งาน/เข้าใจง่าย"

Work Log:
- **พบ commit+tag v0.8.0 (bcfd1b2) ค้างในเครื่อง** จาก session ก่อน (Task 15 — เอนจินครอบคลุม 9 มิติ + EnginePicker) ยังไม่ได้ push → ตรวจสภาพ working tree สะอาด → สร้างงานใหม่ต่อบนฐานนั้นเป็น v0.9.0 และจะ push ทั้ง main + tag v0.8.0 + tag v0.9.0 พร้อมกัน
- **src/lib/dama.ts (ไฟล์ใหม่ — แหล่งเดียวของ "มาตรา")**: มาตราที่ 1–9 ตามลำดับมาตรฐานผู้ใช้กำหนด (1 Accuracy 2 Completeness 3 Consistency 4 Validity 5 Uniqueness 6 Integrity 7 Timeliness 8 Currentness 9 Reasonableness) แต่ละมาตรามี statement (ข้อกำหนด) + measure (มาตราการวัด) + formula (สูตรอ่านง่าย) + advice (คำแนะนำเมื่อไม่ผ่าน) / เกณฑ์เกรดเดียวกันทั้งระบบ GRADE_DEFS: ≥95 ดีเยี่ยม (emerald), ≥85 ดี (teal), ≥70 ต้องปรับปรุง (amber), <70 วิกฤต (rose) + gradeOf() / ENGINE_FAILURE_REASONS + ENGINE_FIX_HINTS (เหตุผลล้มเหลว + คำแนะนำรายเอนจิน 10 เอนจิน) / buildRuleVerdict() ประกอบคำตัดสินภาษาไทย / buildRunSummary() สรุปทั้งรัน / DAMA_CLAUSES + DimensionResultView — pure logic ใช้ร่วม backend/frontend ไม่มี circular import (dama → dq เท่านั้น)
- **/api/dq/run ประเมินตามมาตรา**: ทุกกฎได้ verdict (ผ่าน/ไม่ผ่านมาตราที่ N เพราะอะไร) + advice เฉพาะเมื่อล้มเหลว / สะสม rulesCount + failedRules รายมิติ / dimensionScores คืนครบทั้ง 9 มาตรา (score=null เมื่อไม่มีกฎ = "ยังไม่ได้ประเมิน") พร้อม grade + advice เมื่อ FAIR/POOR / คืน overallGrade + summary ประโยคสรุปภาษาไทย — ไม่ทำลาย response เดิม (เพิ่ม field เท่านั้น)
- **UI ผลประเมิน (Tab รันตรวจสอบ)**: แถบสรุปใหม่ = คะแนนรวม + Badge เกรด + ประโยคสรุปภาษาคน / บัตรคะแนนรายมาตรา 9 ใบ เรียงมาตรา 1–9 (ไอคอนมิติ + เกรด badge + bar สีเกรด + จำนวนกฎ/ล้มเหลว + คำแนะนำเมื่อต้องปรับปรุง, มาตราที่ไม่มีกฎแสดง dashed "ยังไม่ได้ประเมิน") / details ขยาย "ข้อกำหนดและวิธีคำนวณของมาตราทั้ง 9" (statement + measure + formula) / แถวรายกฎเพิ่ม badge "มาตรา N · ชื่อมิติ" + verdict เขียว/แดง + กล่องคำแนะนำสีเกษตร "เป็นข้อแนะนำ — การแก้ไขข้อมูลต้องดำเนินการโดยมนุษย์" / APP_VERSION v0.8.0→v0.9.0
- **ตรวจจริง (ผ่านหมด)**: (1) bun run lint สะอาด (2) API รันจริง "ลูกค้าองค์กร — Master": overall 94.4 เกรด "ดี", 9 มาตราครบ, verdict "ไม่ผ่านมาตราที่ 4 …เพราะรูปแบบอีเมลไม่ถูกต้อง…" + advice ถูกต้อง, PII masked ตามบทบาท (3) agent-browser golden path: เลือก dataset → รัน → สรุป+เกรด+ประโยคสรุปแสดง, การ์ด 9 มาตราครบตามลำดับ, ขยายมาตราฉบับเต็มครบ 9 พร้อมสูตร, verdict+คำแนะนำรายกฎแสดงครบ, ไม่มี page/console error (error rbTemplate ใน dev.log เป็นของ session เก่ากลางการ Fast Refresh — ปัจจุบัน log ท้ายสะอาด 200 ทั้งหมด) (4) มือถือ 390px: การ์ดเรียง 1 คอลัมน์ สรุป stack แนวตั้ง ไม่มี overflow

Stage Summary:
- **v0.9.0 = เอนจินประเมินผลอ้างอิง "มาตรา" DAMA-DMBOK อย่างเป็นระบบ** — ทุกผลลัพธ์ตอบครบ: ผ่าน/ไม่ผ่านมาตราที่เท่าไร เพราะอะไร คะแนนเท่าไร เกรดอะไร และควรทำอย่างไรต่อ (โดยมนุษย์เท่านั้น)
- เกณฑ์เกรดรวมศูนย์ที่เดียว (GRADE_DEFS) ใช้ทั้งรายมาตราและคะแนนรวม — เปลี่ยนเกณฑ์แก้ที่เดียวทั้งระบบ
- ผู้ใช้เรียนรู้นิยามมาตราได้ในหน้าผลรัน (มาตราฉบับเต็ม + สูตร) — ลดการเดาความหมายมิติ
- Rollback point: ก่อนงานนี้ = `bcfd1b2` (v0.8.0) — กู้คืน `git reset --hard bcfd1b2 && bun run db:push && bun scripts/seed.ts`
- Push ครั้งนี้ส่งทั้ง main (a71edf5 → v0.9.0) + 2 tags: v0.8.0 (bcfd1b2, ค้างจาก session ก่อน) และ v0.9.0 (fc52ed2 นี้)
---
## Task ID: 17
**Agent**: Z.ai Code (main orchestrator)
**Version**: v0.10.0 (feat — แดชบอร์ด 5 ส่วน: ภาพรวม DQ / รายละเอียดการตรวจ / Regulation / Risk / Data Classification)
**Task**: ผู้ใช้ขอแดชบอร์ดแยก 5 ส่วน (ภาพรวมทั้งหมดของ Data Quality, รายละเอียดการตรวจ DQ, Regulation อ้างอิงมาตรฐาน 5 กรอบแตกย่อยได้+เลือก data source ได้, Risk มุม DQ Impact, Data Classification จำแนกข้อมูล 11 ประเภท และ mapping กับมาตรฐาน)

Work Log:
- **สำรวจก่อนเริ่ม**: พบว่า session ก่อนหน้าทำ v0.8.0 (bcfd1b2, เอนจินครบ 9 มิติ) และ v0.9.0 (fc52ed2, มาตรา 9 มาตรา + verdict) ค้างในเครื่องพร้อม tag แต่ยังไม่ได้ push → งานนี้ต่อบนฐานนั้นและจะ push พร้อมกันทั้ง main + tag v0.8.0 + v0.9.0 + v0.10.0
- **src/lib/regulation.ts (ใหม่ — คลังความรู้มาตรฐาน Single Source of Truth)**: (1) FRAMEWORKS 5 กรอบ: 3.1 DAMA-DMBOK (9 ส่วนย่อยจากมาตราใน dama.ts), 3.2 ISO/IEC 25012 (15 คุณลักษณะ แบ่ง Inherent/System Dependent/Both), 3.3 ISO 8000 (Part 1/2/8/61/110/120), 3.4 ISO/IEC 25024 (9 กลุ่มการวัด), 3.5 ISO/IEC 11179 (Part 1/3/4/5/6) — ทุกส่วนย่อยแมปกับมิติ DQ ของระบบเพื่อคำนวณ "สถานะในระบบ" (2) DATA_CLASSIFICATIONS 11 ประเภท (5.1–5.11) ตามที่ผู้ใช้กำหนดเป๊ะ: Data Governance (ธปท./DAMA/DCAM), BCBS 239, Thailand PDPA, PCI DSS, SWIFT CSCF, ปปง./FATF, TFRS/IFRS+กฎหมายบัญชี+SOX, กฎหมายข้อมูลเครดิต+PDPA, ธปท.+ISO 22301, ธปท.+ISO 27001+NIST CSF, หลักเกณฑ์ ธปท.+Third-party Risk+Cloud Security Controls — พร้อมมิติที่เน้นตรวจ+ผลกระทบธุรกิจ (3) Risk logic: likelihoodOf (1–5 จากอัตราล้มเหลว), SEVERITY_WEIGHT (2–5 จาก severity ของกฎ), riskBandOf (CRITICAL≥15/HIGH≥8/MEDIUM≥4/LOW), DIMENSION_IMPACTS (ผลกระทบธุรกิจรายมิติ), impactsOf (รวมผลกระทบมิติ+ประเภทข้อมูล), coverageStatusOf (ความครอบคลุมมาตรฐานในระบบ)
- **prisma/schema.prisma**: Dataset เพิ่ม `classification String @default("UNCLASSIFIED")` + db:push สำเร็จ (Prisma Client v6.19.2)
- **API /api/dq/analytics (ใหม่)**: คำนวณครบ 5 ส่วนจากผลรันล่าสุดของทุกคู่กฎ×ชุดข้อมูล (latest-run map) — overall (คะแนนรวม+เกรด+มาตรา 1–9 ครบ 9 มิติ+totals), perDataset (คะแนน+เกรด+classification+dimensionScores ครบ 9), latestRuns (60 รายการ พร้อม verdict ตามมาตรา+advice+riskScore), risks (items เรียงตาม riskScore+counts 4 ระดับ+byDimension), classification (11 ประเภท + สถานะความครอบคลุมรายมาตรฐานจากกฎ+คะแนนจริง + unclassified list)
- **API PATCH /api/dq/classification (ใหม่)**: กำหนดประเภทข้อมูล — ผ่าน resolveOperator สิทธิ์ MANAGE_DATASETS (DATA_OWNER/DATA_STEWARD/DATA_ENGINEER/SYS_ADMIN) + validate key + AuditLog action SET_CLASSIFICATION ทุกครั้ง
- **scripts/seed.ts**: DATASETS เพิ่ม classification (ลูกค้าองค์กร→5.3, ธุรกรรมรายวัน→5.6, แคตตาล็อก→5.1, คำร้องเรียน→5.3, อัตราแลกเปลี่ยน→5.7, ทะเบียนบัญชี→5.4, ข้อมูลพนักงาน HR→ยังไม่จำแนก ให้ผู้ใช้ลอง flow เอง) + **ประวัติผลรัน 3 รอบ (6 วัน/2 วัน/ล่าสุด) ด้วยเอนจินประเมินผลจริง** (evaluateRule จาก lib/dq.ts รวม EXISTS_IN_DATASET กับ refValues) = 36 DqRun + สัญญาณ RULE_VIOLATION รอบล่าสุด 9 รายการ + AuditLog บันทึก seed — แดชบอร์ดมีข้อมูลจริงตั้งแต่เปิดหน้าแรก
- **UI src/components/dq-dashboard.tsx (ใหม่ ~1,300 บรรทัด)**: แถบเลือก 5 ส่วน (role=tablist, aria-selected) — ส่วน 1 ภาพรวม (การ์ดคะแนนรวม 85.7/100 เกรด ดี + ครอบคลุมมาตรา 9/9 + KPI 4 ใบ + แท่งมาตรา 1–9 พร้อม "ยังไม่ได้ประเมิน" + คะแนนต่อชุดข้อมูลพร้อมป้าย classification + PII masking demo ย้ายมาไว้ส่วนนี้), ส่วน 2 รายละเอียดการตรวจ (filter ชุดข้อมูล+สถานะ + รายการผลรันพร้อม verdict/มาตรา/ความเสี่ยง/คำแนะนำ), ส่วน 3 Regulation (การ์ด 5 กรอบ + Data Source selector ทุกชุดข้อมูล/รายชุด + สรุป "ระบบมีเกณฑ์ตรวจ X/Y ส่วน" + drill-down ส่วนย่อยพร้อมคะแนน/เกรด/กฎครอบคลุม), ส่วน 4 Risk (KPI 4 ระดับ + Risk Matrix 5×4 นับจากข้อมูลจริง + แท่งรายมิติ + รายการความเสี่ยงหลักพร้อมผลกระทบธุรกิจ+คำแนะนำ), ส่วน 5 Data Classification (การ์ด 11 ประเภท + รายละเอียด mapping มาตรฐานรายมาตรฐานพร้อมสถานะครอบคลุม + เลือกผู้ดำเนินการตาม RBAC + editor จำแนกประเภท inline ทั้งชุดที่จำแนกแล้วและยังไม่จำแนก)
- **core-features-console.tsx**: TabsContent dashboard → เรนเดอร์ DqDashboard (ส่ง datasets/users/reloadTick/onRefetch) ลบ PII demo เดิม+state ที่ย้ายไป, ApiDataset เพิ่ม classification; **views.ts**: APP_VERSION v0.10.0 + desc แดชบอร์ด 5 ส่วน
- **แก้ lint/UX**: CardTitle ปิดผิด tag, setState-in-effect → ใช้ key remount, ชื่ออังกฤษซ้ำใน th ของ FRAMEWORKS (regex ตัด 28 จุด), lint สะอาด
- **ตรวจจริงผ่านหมด (agent-browser + API + DB)**: (1) ส่วน 1: คะแนนรวม 85.7 เกรด ดี, มาตรา 1–9 ครบ, KPI ถูกต้อง (2) ส่วน 2: verdict "ไม่ผ่านมาตราที่ 4 …เพราะรูปแบบอีเมลไม่ถูกต้อง", ป้ายความเสี่ยง 12 (สูง), filter สถานะ=ไม่ผ่าน ทำงาน (3) ส่วน 3: 5 กรอบสลับได้, ISO/IEC 25012 แตก 15 ส่วนย่อย "ระบบมีเกณฑ์ตรวจ 9/15" + Data Source selector (4) ส่วน 4: Matrix 5×4 นับถูก (CRITICAL 1 ที่ โอกาส5×MEDIUM, HIGH 6, MEDIUM 2) + ความเสี่ยงหลัก "สูงมาก · 15 ความทันเวลา รายการธุรกรรมรายวัน txn_date ล้มเหลว 16/20 (80%)" (5) ส่วน 5: การ์ด 11 ประเภท + **flow จำแนกจริง: เลือก ข้อมูลพนักงาน HR → 5.6 AML/KYC → บันทึก → PATCH 200 → การ์ด 5.6 เป็น 2 ชุด คะแนน 90 → AuditLog บันทึกถูกต้อง** แล้ว re-seed คืนสถานะ canonical (6) มือถือ 390px: selector stack 2 คอลัมน์ ไม่มี overflow, footer ติดล่างถูกต้อง (7) errors ว่าง ไม่มี page/console error
- **dev server**: พบว่าตายก่อนเริ่มทดสอบ (no process) → สตาร์ทใหม่ด้วย double-detach `(setsid nohup bun run dev …)` รอดข้ามคำสั่ง ทุก API 200

Stage Summary:
- **v0.10.0 = แดชบอร์ด 5 ส่วนครบตามโจทย์** — ภาพรวม / รายละเอียดการตรวจ / Regulation (5 กรอบ แตกย่อยได้ + เลือก data source ได้ + อ้างอิงข้อมูลจริงในระบบ) / Risk (DQ Impact: โอกาส×ผลกระทบ + แผนที่ความเสี่ยง + ผลกระทบธุรกิจ) / Data Classification (11 ประเภท แมปมาตรฐานครบตามที่ผู้ใช้กำหนด + กำหนดประเภทในระบบได้ พร้อม Audit Trail)
- ทุกสถานะบนแดชบอร์ดคำนวณจากผลรันตรวจล่าสุดจริง (ไม่ใช่ mock) — seed สร้างประวัติ 3 รอบด้วยเอนจินจริง
- Rollback point: ก่อนงานนี้ = `8663dba` (v0.9.0 + worklog Task 16)
- **รอ push**: main (8663dba → v0.10.0) + 3 tags ที่ยังไม่ได้ขึ้น remote: v0.8.0 (bcfd1b2), v0.9.0 (fc52ed2), v0.10.0 (งานนี้) — ต้องขอ token ใหม่จากผู้ใช้ก่อน push (token เดิมถูก redact ตาม workflow)

---

## Task ID: 17-result
**Agent**: Z.ai Code (main orchestrator)
**Task**: Push v0.10.0 ขึ้น GitHub + remote verification (บันทึกผล push ด้วย token ใหม่จากผู้ใช้)

Work Log:
- ตรวจสถานะก่อน push: local main = `7d3366f` (v0.10.0 แดชบอร์ด 5 ส่วน, commit จาก session ก่อน), tag `v0.10.0` มีอยู่แล้วชี้ `7d3366f` ถูกต้อง (session ก่อนสร้างไว้ — ตรวจซ้ำด้วย `git rev-parse v0.10.0^{commit}`), remote main อยู่ที่ `8663dba`, remote มี tag v0.8.0 (bcfd1b2) + v0.9.0 (8663dba) แล้ว — working tree สะอาด, branch ahead 1
- Pre-flight คุณภาพผ่านทั้งหมด: (1) `bun run lint` สะอาด (2) dev server HTTP 200 + dev.log ท้ายไฟล์ไม่มี error (มีแค่ prisma query ปกติ) (3) agent-browser smoke test — หน้าแดชบอร์ด v0.10.0 แสดงแท็บ 5 ส่วนครบ (ภาพรวม/รายละเอียดการตรวจ/Regulation/Risk/Data Classification), ส่วน 1 คะแนนรวม 85.7/100 เกรด "ดี" มาตรา 9/9 DAMA-DMBOK, ส่วน 2 verdict "ไม่ผ่าน 9" พร้อมคำตัดสินตามมาตรา, ส่วน 3 กรอบ DAMA-DMBOK + ISO/IEC 25012 + ISO 8000 + ISO/IEC 25024, ส่วน 4 Risk Matrix (โอกาส×ผลกระทบ) + ระดับสูงมาก, ส่วน 5 การ์ด 11 ประเภท (Enterprise Data Governance → 5.11) — **ไม่มี page error และไม่มี console error**
- Push ด้วย token ใหม่จากผู้ใช้ (one-time URL ตรงในคำสั่ง push, ไม่บันทึกลง git config, redact ทุก output ด้วย sed) สำเร็จ EXIT=0 ทั้งคู่:
  - `8663dba..7d3366f  main -> main`
  - `* [new tag]  v0.10.0 -> v0.10.0`
- Verify ด้วย `git ls-remote origin main refs/tags/v0.10.0 refs/tags/v0.9.0 refs/tags/v0.8.0` (public read ไม่ใช้ token): refs/heads/main = `7d3366f0f037ba26ee8db224cc8d3ac3bd48b547` ตรง local HEAD เป๊ะ, v0.10.0 = `7d3366f0…` ตรง, v0.9.0 = `8663dba9…` ตรง, v0.8.0 = `bcfd1b2d…` ตรง — ครบทุก hash

Stage Summary:
- **v0.10.0 อยู่บน GitHub remote สมบูรณ์** (main + tag) — remote = local = `7d3366f`, sync 100%
- ครบทุก tags บน remote: `v0.10.0` (7d3366f แดชบอร์ด 5 ส่วน) ← rollback ย้อนได้ที่ `v0.9.0` (8663dba มาตรา 9 มาตรา) / `v0.8.0` (bcfd1b2 เอนจิน 9 มิติ) / `v0.7.0` (03801bf มิติ 9 มิติ + Dimension Picker) / `v0.6.0` (65a5ac6) / `v0.5.0` (d0c979e) / `v0.4.0` (567f586)
- คำสั่ง rollback กลับไป v0.9.0 บนเครื่อง local: `git reset --hard 8663dba && bun run db:push && bun scripts/seed.ts`
- Token ใช้เฉพาะใน push command (one-time URL) ไม่มีบันทึกลงไฟล์/config ใดๆ — ผู้ใช้ควร revoke/rotate token หลังใช้งาน (GitHub → Settings → Developer settings → Fine-grained personal access tokens)

---

## Task ID: 18
**Agent**: Z.ai Code (main orchestrator)
**Version**: v0.11.0 (feat — เมนูใหญ่ Data Asset: นำเข้าข้อมูล CSV/JSON/Database + คลังข้อมูล Data Inventory)
**Task**: ผู้ใช้ขอเพิ่มเมนูใหญ่ "Data Asset" โดยมีเมนูย่อย (1) import ข้อมูล csv file, json file, database ตั้งชื่อได้ (2) data inventory แสดงข้อมูลที่ import เข้ามา

Work Log:
- **Prisma schema**: เพิ่ม 3 model — `DataAsset` (ชื่อ/คำอธิบาย/sourceType CSV|JSON|DATABASE/sourceInfo ไม่เก็บรหัสผ่าน/piiEnabled PDPA-first/rowCount/columnCount/importedBy), `DataAssetColumn` (ชื่อ+ชนิดอนุมาน+ลำดับ), `DataAssetRecord` (payload JSON รายแถว + rowNo) — `bun run db:push` สำเร็จ ติดตั้ง driver `mysql2` + `pg` สำหรับนำเข้าจากฐานข้อมูลจริง
- **src/lib/asset.ts (ไลบรารีใหม่)**: parseCsv (ตรวจตัวคั่นอัตโนมัติ , ; Tab |, เครื่องหมายคำพูด "" escape, LF/CRLF, BOM, กันหัวคอลัมน์ซ้ำ), parseJsonData (รองรับ array/วัตถุเดียว/อาร์เรย์ในคีย์ + flatten วัตถุซ้อน a.b), inferColumnType (INTEGER/NUMBER/BOOLEAN/DATE/DATETIME/TEXT เข้มงวด), checkReadOnlySql + checkIdentifier (deny-by-default — อนุญาตเฉพาะ SELECT/WITH คำสั่งเดียว บล็อก 20+ คีย์เวิร์ดอันตราย), buildDbSourceInfo (ไม่เก็บรหัสผ่าน), ASSET_LIMITS (1,000 แถว / 100 คอลัมน์ / 8MB / timeout 8s)
- **API ใหม่ 4 เส้น**: `POST /api/assets/import` (3 แหล่ง, ธุรกรรมเดียว asset+columns+records, AuditLog IMPORT_DATA_ASSET, RBAC MANAGE_DATASETS), `POST /api/assets/test-connection` (MySQL/PostgreSQL คืนเวอร์ชันเซิร์ฟเวอร์+รายชื่อตาราง กดเลือกเติมช่องได้), `GET /api/assets` (รายการ+สรุป), `GET|PATCH /api/assets/[id]` (detail แบ่งหน้า 25 แถว/หน้า + ค้นหา + maskRowByRole ตามบทบาท / RENAME+TOGGLE_PII+DELETE พร้อม AuditLog ทุก action)
- **UI ใหม่ 2 หน้า**: `asset-import.tsx` — การ์ดเลือกแหล่ง 3 ใบ → ตั้งชื่อ+คำอธิบาย+เลือกผู้ดำเนินการ (เฉพาะบทบาทที่มีสิทธิ์) → ฟอร์มรายแหล่ง (CSV/JSON: เลือกไฟล์หรือวางเนื้อหา + พรีวิวฝั่ง client ใช้ parser ตัวเดียวกับ backend; Database: dbType/host/port auto/database/user/password + table หรือ SQL mode + ปุ่มทดสอบการเชื่อมต่อ + คลิกชื่อตารางเติมช่อง) → กดนำเข้า → แถบสำเร็จ + ปุ่มไปคลังข้อมูล / `asset-inventory.tsx` — การ์ดสรุป 5 ใบ + การ์ด asset (badge ชนิด+PII) + Dialog รายละเอียด 3 แท็บ (ข้อมูลแบ่งหน้า+ค้นหา / โครงสร้างคอลัมน์+ชนิดอนุมาน / รายละเอียดแหล่งข้อมูล JSON) + เลือกบทบาทผู้ชมดู PII masking สด + เปลี่ยนชื่อ/สลับ PII/ลบ (ยืนยัน AlertDialog)
- **views.ts**: กลุ่มเมนูใหม่ "Data Asset" (ภาพรวม → Data Asset → คุณภาพข้อมูล → การกำกับดูแล) + มุมมอง asset-import/asset-inventory + APP_VERSION v0.11.0 — **page.tsx**: คง mounted แบบ hidden เหมือน RBAC (ฟอร์มไม่หาย) + AssetInventory รับ prop `active` รีเฟรชรายการทุกครั้งที่เปิดหน้า (แก้บั๊ก stale list หลัง import)
- **Seed**: DataAsset ตัวอย่าง 2 รายการ — ทะเบียนลูกค้าสาขาภาคเหนือ (CSV, 8 แถว, มี PII: ชื่อ/email/phone เพื่อสาธิต masking) + รายงานอัตราแลกเปลี่ยนรายวัน (JSON, 8 แถว) + AuditLog IMPORT_DATA_ASSET
- **ตรวจจริงผ่านหมด (API + agent-browser)**: (1) API import CSV 3 แถว/4 คอลัมน์ ✅ (2) API import JSON วัตถุซ้อน flatten เป็นคอลัมน์ meta.dept ✅ (3) SQL guard ปฏิเสธ DROP TABLE ✅ (4) RBAC ปฏิเสธ BUSINESS_USER ✅ (5) UI import CSV ผ่านพรีวิว→นำเข้า→แถบสำเร็จ→ปุ่มไปคลัง ✅ (6) Inventory แสดง 3 asset + สรุปถูกต้อง ✅ (แก้บั๊ก active-reload ก่อน) (7) Dialog: ตารางข้อมูล+แบ่งหน้า, PII masking ผู้ใช้งานทั่วไป เห็น "อ•••••••••• / a••••••••••@example.co.th / 053-•••-•••" แต่ branch/balance/kyc_date ชัด ✅ (8) โครงสร้างคอลัมน์ อนุมาน balance=ตัวเลข kyc_date=วันที่ ✅ (9) ค้นหา "เชียงใหม่" ได้ 2 แถว ✅ (10) เปลี่ยนชื่อผ่าน UI ✅ (11) ลบผ่าน AlertDialog ✅ คืน 2 asset (12) มือถือ 390px ไม่มี horizontal overflow + drawer เปิดเมนูได้ (13) ฟอร์ม Database ครบทุกช่อง + ทดสอบการเชื่อมต่อ host ไม่ตอบสนอง → error "connect ETIMEDOUT" ชัดเจนไม่ค้าง (14) โหมด SQL แสดงคำเตือน deny-by-default (15) ไม่มี page error / console error, lint สะอาด
- หมายเหตุเทคนิค: dev server ต้องรีสตาร์ทหลัง db:push (Prisma Client ในหน่วยความจำเก่า → db.dataAsset undefined) — รีสตาร์ทด้วย double-detach ตามปกติ

Stage Summary:
- **v0.11.0 = เมนูใหญ่ "Data Asset" ครบตามโจทย์** — (1) นำเข้าข้อมูล: CSV / JSON / Database (MySQL/PostgreSQL) ตั้งชื่อได้ + พรีวิวก่อนบันทึก (2) คลังข้อมูล: แสดงข้อมูลที่ import ทั้งหมด สำรวจได้ทุกมิติ (ตาราง+แบ่งหน้า+ค้นหา+โครงสร้าง+ที่มา)
- ความปลอดภัยตามหลักระบบ: RBAC (เฉพาะ 4 บทบาทจัดการ) + Audit Trail 100% (import/rename/toggle/delete) + PDPA masking ตามบทบาท + deny-by-default SQL (SELECT เท่านั้น) + ไม่เก็บรหัสผ่านการเชื่อมต่อ + จำกัดขนาด
- Rollback point: ก่อนงานนี้ = `4f3cf86` (v0.10.0 + worklog Task 17-result) — กู้คืน `git reset --hard 4f3cf86 && bun run db:push && bun scripts/seed.ts`
- **รอ push**: main (4f3cf86 → v0.11.0) + tag v0.11.0 — ต้องขอ token จากผู้ใช้ก่อน push (token เดิมถูก redact ตาม workflow)

---

## Task ID: 18-result
**Agent**: Z.ai Code (main orchestrator)
**Task**: Push v0.11.0 (เมนู Data Asset) ขึ้น GitHub + remote verification (บันทึกผล push ด้วย token ใหม่จากผู้ใช้)

Work Log:
- ตรวจสถานะก่อน push: local main = `c6c8198` (v0.11.0 เมนู Data Asset, commit + tag จาก session ก่อนที่ context หมด), tag `v0.11.0` มีอยู่แล้วชี้ `c6c8198` ถูกต้อง (`git rev-parse v0.11.0^{commit}`), remote main อยู่ที่ `4f3cf86`, remote มี tags ถึง v0.10.0 (7d3366f) — working tree สะอาด, branch ahead 1
- Pre-flight คุณภาพผ่านทั้งหมด: (1) `bun run lint` สะอาด (2) dev server HTTP 200 + dev.log ท้ายไฟล์มีแค่ prisma query ปกติ (3) agent-browser smoke test งาน Data Asset — เมนูใหม่ "นำเข้าข้อมูล" + "คลังข้อมูล" แสดงในกลุ่ม Data Asset, หน้านำเข้ามีการ์ดเลือกแหล่ง 3 ใบ (ไฟล์ CSV / ไฟล์ JSON / ฐานข้อมูล MySQL/PostgreSQL) + ขั้นตอน "2 · ตั้งชื่อ Data Asset" + ปุ่มนำเข้า disabled จนกรอกครบ, หน้าคลังข้อมูลแสดง seed 2 asset (ทะเบียนลูกค้าสาขาภาคเหนือ CSV + รายงานอัตราแลกเปลี่ยนรายวัน JSON), Dialog รายละเอียดเปิดได้พร้อมแท็บ 3 อัน (ข้อมูล 8 แถว / โครงสร้างคอลัมน์ 7 / รายละเอียดแหล่งข้อมูล) — **ไม่มี page error และไม่มี console error**
- Push ด้วย token ใหม่จากผู้ใช้ (one-time URL ตรงในคำสั่ง push, ไม่บันทึกลง git config, redact ทุก output ด้วย sed) สำเร็จ EXIT=0 ทั้งคู่:
  - `4f3cf86..c6c8198  main -> main`
  - `* [new tag]  v0.11.0 -> v0.11.0`
- Verify ด้วย `git ls-remote origin` (public read ไม่ใช้ token): refs/heads/main = `c6c81988994568b5ed7aecc4d94483273895c231` ตรง local HEAD เป๊ะ, refs/tags/v0.11.0 = `e9631dae…` (annotated tag object) และ dereference `refs/tags/v0.11.0^{}` = `c6c81988…` ตรง commit เป๊ะ, v0.10.0 = `7d3366f0…` ตรง — ครบทุก hash

Stage Summary:
- **v0.11.0 อยู่บน GitHub remote สมบูรณ์** (main + tag) — remote = local = `c6c8198`, sync 100%
- ครบทุก tags บน remote: `v0.11.0` (c6c8198 เมนู Data Asset: นำเข้า CSV/JSON/Database + คลังข้อมูล) ← rollback ย้อนได้ที่ `v0.10.0` (7d3366f แดชบอร์ด 5 ส่วน) / `v0.9.0` (8663dba) / `v0.8.0` (bcfd1b2) / `v0.7.0` (03801bf) / `v0.6.0` (65a5ac6) / `v0.5.0` (d0c979e) / `v0.4.0` (567f586)
- คำสั่ง rollback กลับไป v0.10.0 บนเครื่อง local: `git reset --hard 7d3366f && bun run db:push && bun scripts/seed.ts`
- Token ใช้เฉพาะใน push command (one-time URL) ไม่มีบันทึกลงไฟล์/config ใดๆ — ผู้ใช้ควร revoke/rotate token หลังใช้งาน (GitHub → Settings → Developer settings → Fine-grained personal access tokens)

---

## Task ID: 19-plan
**Agent**: Z.ai Code (main orchestrator)
**Task**: วางแผนปรับโครงสร้างเมนู Data Quality เป็น 11 รายการ (DQ Dashboard / DQ Scorecard / DQ Rule Library / Data Profiling / Validation Results / Failed Records / DQ Issues / Root Cause Analysis / Remediation Plans / Monitoring / Alerts) — ผู้ใช้ขอ "วางแผนก่อน ยังไม่รีบทำ"

Work Log:
- สำรวจโค้ดปัจจุบันครบ: views.ts (CoreViewKey 5 มุมมอง: rules/conditions/run/exceptions/dashboard), app-sidebar (NAV_GROUPS 4 กลุ่ม + live badges), page.tsx (shell + hidden-mounted switching), core-features-console.tsx (2,030 บรรทัด — Tabs 1:1 กับ core views), schema.prisma (Dataset/SampleRow/DqRule/RuleDataset/ConditionTemplate/DqRun/DqSignal/DqException + DataAsset*), run engine (evaluateRule มี failedIndexes ระดับแถวแต่เก็บเฉพาะ aggregate DqRun + failedSamples 3 แถว transient)
- Gap สำคัญที่ค้นพบ: (1) ไม่มีการ persist ผลล้มเหลวระดับแถว → Failed Records/RCA/Remediation ต้องมีก่อน (2) ไม่มีแนวคิด "รอบการตรวจ" (batch) → drill-down ยาก (3) ไม่มี profiling (4) Signal/Exception กระจัดกระจาย ไม่มี Issue register ที่มี lifecycle (5) ไม่มี scheduler/alert
- ออกแบบแผน 4 เฟส (v0.12–v0.15) + data model ใหม่ 11 models + API ใหม่ ~15 เส้น + หลัก UX enterprise — รายละเอียดเต็มอยู่ในข้อความนำเสนอผู้ใช้ (แผนฉบับนี้ย่อ)

Stage Summary:
- **แผน 4 เฟส**: v0.12.0 = โครงเมนูใหม่ + ผลตรวจระดับแถว (DqValidationBatch + DqFailureRecord + Scorecard + Validation Results + Failed Records + Rule Library รวม rules/conditions) / v0.13.0 = Data Profiling (adapter Dataset+DataAsset) + DQ Issues (register + lifecycle + exceptions เป็นแท็บ) / v0.14.0 = RCA (5-Why + evidence) + Remediation Plans (plan+task+ตรวจซ้ำ) / v0.15.0 = Monitoring (scheduler in-app + run-now) + Alerts (alert rules + inbox)
- การตัดสินใจหลัก: (1) persist snapshot แถวที่ล้มเหลว cap 200/กฎ/รอบ + mask ตอนอ่านตามบทบาท (PDPA) (2) แนะนำเมนูแบบ "โตทีละขั้น" — แสดงเฉพาะรายการที่ใช้งานได้จริงทุกเวอร์ชัน (ไม่มีเมนูตาย) (3) DqSignal คงอยู่เป็น raw signal layer, DqIssue เป็น register ที่มี lifecycle, confirm signal → เปิด issue อัตโนมัติ (4) หลักเดิมคงครบ: READ-ONLY, RBAC+Audit ทุก action, ML เป็นสัญญาณ, deny-by-default
- คำถามรอยืนยันจากผู้ใช้ 4 ข้อ: (1) เมนูโตทีละขั้น vs แสดง 11 แล้วขึ้น "กำลังพัฒนา" (2) ตกลง cap 200 แถว snapshot ไหม (3) รอบ Monitoring ที่ต้องการ (4) Exceptions ย้ายเป็นแท็บใน DQ Issues โดยคง flow อนุมัติ
- **สถานะ: รอผู้ใช้อนุมัติแผน/ตอบคำถาม → ยังไม่เขียนโค้ด** (commit นี้เป็น docs-only, push พร้อม v0.12.0 หรือเมื่อผู้ใช้ส่ง token)

---

## Task ID: 20
**Agent**: Z.ai Code (main orchestrator)
**Version**: v0.12.0 (feat — โครงสร้างเมนู Data Quality แบบ enterprise เฟส 1 + ผลตรวจระดับแถว)
**Task**: ผู้ใช้อนุมัติแผน Task 19-plan (แก้ 4 ข้อ: เฉพาะเมนูที่ใช้ได้จริง / ตกลง cap 200 แถว / ตัด Monitoring / ตกลง exceptions เป็นแท็บ) → ลงมือเฟส 1 ของ 3: โครงเมนูใหม่ + DQ Scorecard + Validation Results (batch) + Failed Records

Work Log:
- **Schema**: เพิ่ม `DqValidationBatch` (รอบการตรวจ 1 รอบครอบผลทุกกฎ: triggeredBy/createdBy/ผ่าน-ล้มเหลว-ข้าม/คะแนนรวม) + `DqFailureRecord` (แถวล้มเหลวรายแถว: snapshot rowData JSON + reason + status NEW|FIXED|IGNORED + @@unique([runId,rowNo])) + `DqRun.batchId` (string ธรรมดาไม่ผูก FK เพราะแถวเก่า = "") — db:push สำเร็จ, พบ db ว่างจาก push → seed ใหม่ (users 10, datasets 7, rules 11, runs 36, assets 2)
- **Run engine อัปเกรด** (`POST /api/dq/run`): สร้าง batch ก่อนรัน → ทุกกฎเก็บ DqRun.batchId + persist แถวล้มเหลว (cap `MAX_FAILURE_ROWS_PER_RULE = 200`, reason จาก ENGINE_FAILURE_REASONS, snapshot ดิบ mask ตอนอ่าน) → อัปเดตสรุป batch + คืน batchId
- **API ใหม่ 5 เส้น**: `GET /api/dq/scorecard` (เมทริกซ์ ชุดข้อมูล × 9 มิติ + เกรด + KPI + trend รายวัน 30 วัน + มิติอ่อน/แข็งสุด), `GET /api/dq/validations` + `[id]` (รายการรอบ + drill-down สร้าง verdict/sentence ใหม่จากข้อมูลที่เก็บ), `GET /api/dq/failures` (กรอง dataset/status/severity/dimension/search + หน้า 25 + mask ตามบทบาทผู้ชม — ไม่ระบุ = BUSINESS_USER เข้มสุด), `PATCH /api/dq/failures/[id]` (RBAC REVIEW_SIGNALS + AuditLog UPDATE_FAILURE_STATUS)
- **UI ใหม่**: `dq/scorecard.tsx` (KPI 4 ใบ + เมทริกซ์ตารางสีตามเกรด + expand แถว = การ์ด 9 มิติ + Sparkline SVG แนวโน้ม + ปุ่มไปผลการตรวจ), `dq/failed-records.tsx` (คำเตือนหลักการ + KPI สถานะ + กรอง/ค้นหา/เลือกผู้ชม + ตาราง + Dialog รายละเอียด mask + ปุ่มแก้แล้ว/ยกเว้น/ย้อน), `dq/batch-history.tsx` (ตารางรอบล่าสุด + กรองชุดข้อมูล + Dialog drill-down รายกฎพร้อม verdict + ปุ่มไป Failed Records)
- **โครงเมนู** (`views.ts` v0.12.0): ViewKey เพิ่ม scorecard/rule-library/validation-results/failed-records; NAV_GROUPS กลุ่มคุณภาพข้อมูล = บัตรคะแนน DQ · คลังกฎตรวจสอบ · ผลการตรวจสอบ · ข้อมูลที่ไม่ผ่าน · ข้อยกเว้น (transitional จน v0.13); dashboard เปลี่ยนชื่อ "DQ แดชบอร์ด"; run เปลี่ยนชื่อ "ผลการตรวจสอบ"; isConsoleView() ช่วย page.tsx
- **CoreFeaturesConsole**: เพิ่ม prop `mode: 'full'|'library'` — library mode ใช้ local tab state + TabsList แท็บ "กฎตรวจสอบทั้งหมด"/"คลังเงื่อนไข (must)" (รวมเมนูเดิม 2 รายการเป็น "คลังกฎตรวจสอบ" โดยไม่ย้ายโค้ด 2,030 บรรทัด — ลดความเสี่ยง); แท็บ run แทรก BatchHistory; sidebar badge: validation-results=สัญญาณรอ, rule-library=จำนวนเงื่อนไข, failed-records=ยังไม่แก้ (แดง)
- **ตรวจจริงผ่านหมด**: API (scorecard KPI ถูก/avgScore 91.5, run สร้าง batch cmvimrs1u…, failures 7 แถว mask ธ••••••• ส่วน steward เห็นเต็ม, PATCH steward สำเร็จ + BUSINESS_USER 403 + AuditLog ครบ, drill-down verdict "ไม่ผ่านมาตราที่ 4…") + agent-browser (เมนู 5 รายการ, Scorecard expand การ์ดรายมิติ+trend, library สลับ 2 แท็บ, Validation Results batch table + dialog + ปุ่ม cross-link, Failed Records dialog masking + เปลี่ยนสถานะผ่าน UI สำเร็จ, DQ แดชบอร์ด 5 ส่วนเดิมครบ, ข้อยกเว้นเดิมปกติ, มือถือ 390px ไม่ overflow + drawer เปิดได้) — ไม่มี page/console error, lint สะอาด
- **การตัดสินใจหลัก**: (1) โครงสร้าง 10 เมนูเป้าหมาย (ตัด Monitoring ตามผู้ใช้ — trend ย้ายไป Scorecard) (2) เมนูโตทีละเวอร์ชัน ไม่มีเมนูตาย (3) DqRun.batchId เป็น string ธรรมดา (กัน FK กับแถวเก่า) (4) snapshot ดิบ + mask ตอนอ่าน (PDPA) (5) exceptions คงเมนูแยกชั่วคราวจน v0.13 รวมเป็นแท็บใน DQ Issues

Stage Summary:
- **v0.12.0 = เฟส 1/3 ของโครงสร้าง Data Quality enterprise เสร็จสมบูรณ์**: เมนูใหม่ 5 รายการใช้ได้จริง (DQ แดชบอร์ด / บัตรคะแนน / คลังกฎ / ผลการตรวจ / ข้อมูลที่ไม่ผ่าน) + รากฐานผลตรวจระดับแถว (batch + failure snapshot) ที่เฟส 2-3 (Profiling, Issues, RCA, Remediation, Alerts) จะต่อยอด
- เหลือตามแผน: v0.13.0 = Data Profiling + DQ Issues (exceptions เป็นแท็บ) · v0.14.0 = RCA + Remediation + Alerts (สัญญาณ AI ย้ายไป Alerts)
- Rollback point: ก่อนงานนี้ = `fda8a98` (v0.11.0 + worklog 17/18-result + 19-plan) — กู้คืน `git reset --hard fda8a98 && bun run db:push && bun scripts/seed.ts`
- **รอ push**: main + tag v0.12.0 — ต้องขอ token จากผู้ใช้ก่อน push ตาม workflow

---
## Task ID: 20-result
Agent: Z.ai Code (main session)
Task: เก็บกวาดประวัติ git + push v0.12.0 (main + tag) ขึ้น GitHub ด้วย token ที่ผู้ใช้ให้ ตาม enforced workflow

Work Log:
- กลับมาในเซสชันใหม่: พบ v0.12.0 พัฒนา+ตรวจเสร็จแล้ว (commit 320cdd5 + lightweight tag) ค้าง push — แต่มี commit ขยะ 35b9870 (ชื่อ UUID, mode-only พลิก 644→755 ~118 ไฟล์ จากเครื่องมือภายนอก) แทรกในประวัติ
- กันพลาด: สร้าง recovery branch backup/v0.12.0-pre-push → 320cdd5 + เก็บ commit message เดิมไว้
- ตรวจชุดไฟล์ที่ควรเป็น executable จริงจาก fda8a98 = 13 ไฟล์ (.zscripts/*.sh, tests/*.sh, download/README.md, worklog.md)
- ทำความสะอาดประวัติ: chmod 644 ไฟล์ tracked ทั้งหมด → คืน 755 เฉพาะ 13 ไฟล์ตาม fda8a98 → reset --soft fda8a98 → add -A → recommit เป็น commit เดียว 368e61e (ข้อความเดิมครบถ้วน) → ลบ lightweight tag แล้วสร้าง annotated tag v0.12.0 แทน (เทียบเคียง v0.4.0–v0.11.0)
- ยืนยันเนื้อหา: diff backup(320cdd5) vs HEAD = 113 files, 0 insertions, 0 deletions (mode-only) — โค้ดไม่เปลี่ยนแม้แต่ไบต์เดียว · โหมดสุดท้าย 121×644 + 13×755 ถูกต้อง
- Pre-flight ใหม่ทั้งชุด: lint สะอาด · HTTP 200 · API ใหม่ 3 เส้นคืนข้อมูลจริง (scorecard avgScore 91.46 / validations batch / failures 7 แถว) · agent-browser คลิกจริงบัตรคะแนน DQ + ข้อมูลที่ไม่ผ่าน ทำงานครบ ไม่มี page error, console สะอาด
- Push: git push <one-time URL ฝัง token> main v0.12.0 → 6e114a7..368e61e main + new tag (output redact ด้วย sed ทุกบรรทัด, token ไม่ถูกบันทึกลง git config)
- Verify remote: ls-remote → refs/heads/main = 368e61e ตรง local · refs/tags/v0.12.0 = f536f07 (annotated object) → ^{} = 368e61e ตรงเป๊ะ
- ปิดท้าย: fetch + status in-sync (ไม่มี ahead/behind) · git config --list | rg -i "github_pat|token" = CONFIG CLEAN · ลบ backup branch แล้ว

Stage Summary:
- **v0.12.0 อยู่บน remote ครบถ้วน**: main = 368e61e + tag v0.12.0 (annotated) — ประวัติสะอาด (ไม่มี commit UUID), file modes ถูกต้องตามต้นฉบับ, sync 100%
- ควร revoke token นี้หลังเซสชันตามแนวทางเดิม (แนะนำไว้แล้วใน Task 18-result)
- สถานะถัดไป: v0.13.0 = Data Profiling + DQ Issues (exceptions ย้ายเป็นแท็บ) · v0.14.0 = RCA + Remediation + Alerts

---
## Task ID: 21
Agent: Z.ai Code (main session)
Task: v0.13.0 — เฟส 2/3 เมนู Data Quality: Data Profiling + DQ Issues (ผู้ใช้ส่ง token = อนุมัติดำเนินการต่อตามแผน)

Work Log:
- **Schema**: เพิ่ม DqProfileRun (รอบโปรไฟล์: rows/columns/avgCompleteness/avgUniqueness/piiColumnCount) + DqProfileColumn (สถิติรายคอลัมน์: null%/distinct%/min-max-mean/topValues JSON/piiSuspected) + DqIssue (code ISS-xxxx unique, source MANUAL|SIGNAL|FAILURE|EXCEPTION, status OPEN|IN_PROGRESS|RESOLVED|CLOSED, lifecycle timestamps) + Dataset relations → db:push สำเร็จ
- **RBAC**: เพิ่มสิทธิ์ MANAGE_ISSUES ("จัดการปัญหาคุณภาพข้อมูล") ให้ DATA_OWNER / DATA_STEWARD / DQ_ANALYST / DATA_ENGINEER / SYS_ADMIN — ปิดโดย APPROVE_EXCEPTIONS (แยกผู้แก้กับผู้ปิด)
- **Lib ใหม่**: `lib/profiling.ts` (เอนจินสถิติรายคอลัมน์ + heuristic ตรวจ PII จากชื่อคอลัมน์/รูปแบบค่า + PROFILE_MAX_ROWS 2000 + DATA_TYPE_LABELS) · `lib/issues.ts` (ISSUE_SOURCE_LABELS / STATUS_META / TRANSITIONS deny-by-default / nextIssueCode)
- **API ใหม่ 4 เส้น**: POST/GET `/api/dq/profile` (รันต้อง RUN_VALIDATION, ประวัติ 12 รอบ) · GET `/api/dq/profile/[id]` (mask ตามบทบาท) · GET/POST `/api/dq/issues` (กรองครบ + stats + กันซ้ำด้วย source+sourceId) · PATCH `/api/dq/issues/[id]` (START/RESOLVE(note บังคับ)/CLOSE(REVIEW ผ่าน APPROVE_EXCEPTIONS)/REOPEN/ASSIGN + AuditLog ทุก action)
- **signals/[id]**: CONFIRM → เปิด DQ Issue อัตโนมัติใน `$transaction` เดียว (atomic — กันสถานะค้าง)
- **UI**: แตก ExceptionsPanel (self-contained) ออกจาก console (2,056→1,838 บรรทัด) · `dq/profiling.tsx` (KPI + ตารางรายคอลัมน์ + top values mask + ประวัติ + เลือกผู้ชม) · `dq/issues.tsx` (แท็บทะเบียนปัญหา/ข้อยกเว้น + KPI 4 สถานะ + กรอง 5 ช่อง + dialog lifecycle พร้อมเลือกผู้ดำเนินการ + มอบหมาย) · failed-records เพิ่มปุ่ม "เปิดเป็น Issue" · views/sidebar/page wiring + badge สด openIssues (แดง)
- **Seed เสริม**: โปรไฟล์ 2 ชุดข้อมูล + ปัญหาตัวอย่าง (ISS-0001 MANUAL, ISS-0003 RESOLVED; ISS-0002 ข้ามเมื่อไม่มีสัญญาณยืนยัน) — guard count=0

Stage Summary:
- **บั๊กที่จับได้และแก้ระหว่างตรวจ**: (1) nextIssueCode ใช้ count+1 ชนรหัสเมื่อมีช่องว่าง → เปลี่ยนเป็น max+1 (2) signal CONFIRM ไม่ atomic → ครอบ $transaction (3) **PII leak**: minValue/maxValue คอลัมน์ข้อความไม่ถูก mask (เห็นอีเมลเต็มใน strict viewer) → mask ครบทุกสถิติ (4) Prisma client cache เก่าหลัง schema เปลี่ยน → รีสตาร์ท dev server
- ตรวจผ่าน: lint สะอาด · API smoke ครบ (lifecycle START→RESOLVE→CLOSE, RBAC 403 BUSINESS_USER, duplicate guard, auto-issue ISS-0005, empty dataset guidance) · agent-browser ครบ (profiling ตาราง+mask email `s••••@acme.co.th`+รันผ่าน UI, issues แท็บ 2 อัน+START ผ่าน UI+ExceptionsPanel, เปิด ISS-0006 จากแถว #18 ผ่าน UI, scorecard/failed-records เดิมปกติ, มือถือ 390px ไม่ overflow, ZERO page errors — หมายเหตุ: error เดิมที่เจอคือ browser HTTP cache เซสชันเกิน เปิดเซสชันใหม่สะอาด)
- สถานะเมนู Data Quality: **6 รายการใช้งานจริง** (บัตรคะแนน / คลังกฎ / โปรไฟล์ข้อมูล / ผลการตรวจ / ข้อมูลที่ไม่ผ่าน / ปัญหาคุณภาพข้อมูล[รวมข้อยกเว้น])

---
## Task ID: 21-result
Agent: Z.ai Code (main session)
Task: Push v0.13.0 (main + annotated tag) ด้วย token ที่ผู้ใช้ให้ (one-time URL, redact ทุก output)

Work Log:
- Commit `6969df7` + annotated tag v0.13.0 (tag object `369fe12`) → push สำเร็จ `8dc4e99..6969df7 main` + new tag (sed redact, ไม่บันทึกลง git config)
- Verify: ls-remote → refs/heads/main = 6969df7 ตรง local · v0.13.0^{} = 6969df7 ตรงเป๊ะ
- fetch + status in-sync (ไม่มี ahead/behind) · git config --list | rg -i "github_pat|token" = CONFIG CLEAN

Stage Summary:
- **v0.13.0 อยู่บน remote ครบถ้วน** (main + annotated tag) · sync 100% · config CLEAN
- แนะนำ revoke token นี้หลังเซสชัน (แนวทางเดิมทุกครั้ง)
- เหลือตามแผน: **v0.14.0 = RCA (5-Why) + Remediation Plan/Task (ในหน้า DQ Issues) + Alerts (สัญญาณ AI ย้ายไป Alerts) — เฟสสุดท้าย ครบ 8 เมนู**

---
## Task ID: 22
Agent: Z.ai Code (main session)
Task: v0.14.0 — Data Domain & Sub Data Domain ในคลังข้อมูล (ผู้ใช้ขอให้แบ่ง data domain / sub data domain ได้)

Work Log:
- **Schema**: เพิ่ม DataDomain (self-referencing "DomainTree": parentId null = โดเมนหลัก, มี parentId = โดเมนย่อย — ห้ามลึกกว่า 2 ระดับ) + DataAsset.domainId (onDelete: SetNull) + index → db:push สำเร็จ
- **Lib ใหม่**: `lib/domains.ts` — DOMAIN_COLORS 9 สี (dot/chip/swatch literal classes), DOMAIN_MAX_DEPTH=2, buildDomainTree/rollupAssetCount/domainPath, NO_DOMAIN sentinel สำหรับ Radix Select
- **API ใหม่ 2 เส้น**: GET /api/domains (flat + assetCount จาก groupBy) · POST /api/domains (ตรวจ RBAC MANAGE_DATASETS, พ่อต้องเป็นโดเมนหลัก, กันชื่อซ้ำในระดับเดียว 409) · PATCH /api/domains/[id] (UPDATE/DELETE — ลบได้เฉพาะว่าง ไม่มีลูกและไม่มี asset มิฉะนั้น 409) + AuditLog ทุก action
- **Assets API**: GET /api/assets + GET /api/assets/[id] คืน domain {id,name,color,parentId,parentName} · PATCH เพิ่ม action SET_DOMAIN (domainId ว่าง = นำออกจากโดเมน) · POST /api/assets/import รับ domainId (ตรวจมีอยู่จริง, audit ระบุโดเมน)
- **UI คลังข้อมูล**: การ์ดสรุปเพิ่ม "โดเมนข้อมูล N หลัก + M ย่อย" (grid 6 การ์ด) · แถวชิปกรองโดเมน (ทั้งหมด/โดเมนหลัก[rollup]/โดเมนย่อย└/ไม่ระบุ — aria-pressed) · badge โดเมนบนการ์ด asset (path แม่/ลูก) · dialog "จัดการโดเมน" (ต้นไม้ + เพิ่มหลัก/เพิ่มย่อย/แก้ไข/ลบเงื่อนไข + เลือกสี 9 แบบ) · dialog "จัดโดเมน" ราย asset (เลือกหลัก → ย่อย cascade, prefill ค่าปัจจุบัน) · แท็บรายละเอียดเพิ่มแถวโดเมน · empty state แยกกรณี "กรองแล้วว่าง"
- **UI นำเข้า**: ขั้นที่ 2 เพิ่มเลือกโดเมนหลัก/โดเมนย่อย (ไม่บังคับ — แสดงเมื่อมีโดเมนในระบบ)
- **Seed**: โดเมนตัวอย่าง 3 หลัก (ลูกค้า/การเงิน/การปฏิบัติตามกฎเกณฑ์) + 5 ย่อย · asset ตัวอย่างผูก "ลูกค้าบุคคลธรรมดา" และ "อัตราแลกเปลี่ยน" · audit seed บันทึก CREATE_DATA_DOMAIN
- **บั๊กที่จับได้**: ไฟล์ `api/domains/route.ts` หาย (Write แรกโฟลเดอร์ยังไม่มี) ทำ GET คืน 404 — พบจาก dev.log แล้วเขียนใหม่ ผ่านทันที
- **Pre-flight**: lint สะอาด · API lifecycle ครบ (สร้างหลัก/ย่อย, ซ้ำ 409, sub-of-sub 400, RBAC DQ_ANALYST 403, ลบมีลูก/มี asset 409, SET_DOMAIN + audit) · agent-browser ครบ: ชิปกรอง rollup ถูกต้อง, เปิด dialog จัดการโดเมนสร้าง "การขาย"+"ยอดขายรายวัน" ผ่าน UI แล้วลบครบ flow (ปุ่มลบ disable เมื่อมีลูก), จัดโดเมน asset ลูกค้า → การเงิน/บัญชีและเงินฝาก → คืน ลูกค้า/ลูกค้าบุคคลธรรมดา (prefill ถูกต้องทั้ง 2 ครั้ง), แท็บรายละเอียดแสดง path, มือถือ 390px ไม่ overflow, ZERO page errors
- Commit `98f9ef8` + annotated tag v0.14.0 (deref ตรง 98f9ef8) — **ยังไม่ push (รอ token one-time จากผู้ใช้ตาม workflow)**

Stage Summary:
- คลังข้อมูลจัดหมวดหมู่เป็น Data Domain → Sub Data Domain ได้ครบวงจร: สร้าง/แก้/ลบ (เงื่อนไขเข้ม) / กรอง / ผูก asset ทั้งตอน import และหลังนำเข้า — ทุก action ผ่าน RBAC + Audit Trail
- สถานะข้อมูลหลังทดสอบ: โดเมนคงเหลือ 8 = seed, asset ผูกถูกต้อง (FX → การเงิน/อัตราแลกเปลี่ยน, ลูกค้า CSV → ลูกค้า/ลูกค้าบุคคลธรรมดา)
- แผนเดิมเลื่อนเบอร์: RCA + Remediation + Alerts = **v0.15.0** (เฟสสุดท้ายครบ 8 เมนู)
- Push pending: รอผู้ใช้ส่ง token (one-time URL + redact ตามกติกา)

---
## Task ID: 22-result
Agent: Z.ai Code (main session)
Task: Push v0.14.0 (main + annotated tag) ด้วย token ที่ผู้ใช้ส่ง (one-time URL, redact ทุก output)

Work Log:
- Push `git push <one-time URL ฝัง token> main v0.14.0` → สำเร็จ `63ecdeb..9c0ff65 main` + new tag (output ผ่าน sed redact ทุกบรรทัด, ไม่บันทึก token ลง git config)
- Verify ls-remote: refs/heads/main = 9c0ff65 ตรง local · refs/tags/v0.14.0 = 7301a14 (annotated object) → ^{} = 98f9ef8 ตรงเป๊ะ (commit ฟีเจอร์)
- fetch + status in-sync (ไม่มี ahead/behind) · git config --list | rg -i "github_pat|token" = CONFIG CLEAN

Stage Summary:
- **v0.14.0 อยู่บน remote ครบถ้วน**: main = 9c0ff65 (รวม worklog Task 22) + tag v0.14.0 (annotated, ชี้ 98f9ef8) — sync 100%
- แนะนำ revoke token นี้หลังเซสชัน (แนวทางเดิมทุกครั้ง)
- สถานะถัดไป: **v0.15.0 = RCA (5-Why) + Remediation Plan/Task (ในหน้า DQ Issues) + Alerts (สัญญาณ AI ย้ายไป Alerts) — เฟสสุดท้าย ครบ 8 เมนู**

---

## Task ID: 23
**Agent**: Z.ai Code (main orchestrator)
**Version**: v0.15.0 (feat — เมนู Data Domain แยกอิสระจากคลังข้อมูล + จัดหมวดรายคอลัมน์)
**Task**: ผู้ใช้ขอ (ข้อความเดิม) "ฉันต้องการแยก menu Data Domain แยกออกจากคลังข้อมูล โดยให้อยู่ภายใต้ data asset ซึ่งการทำ Data Domain / Sub Data Domain สามารถตั้งค่าได้ โดยการเลือกข้อมูลจากคลังข้อมูล และเลือกข้อมูลแต่ละ column ระบุ sub data domain" — 3 ข้อ: (1) เมนู Data Domain แยกเป็นเมนูอิสระ ไม่ฝังในคลังข้อมูล (2) อยู่ภายใต้กลุ่ม Data Asset ใน sidebar (3) ตั้งค่าได้โดยเลือกข้อมูลจากคลังแล้วระบุ sub data domain ให้แต่ละ column

Work Log:
- **เริ่มเซสชันใหม่**: พบ local ค้างที่ v0.11.0 (sandbox ถูก rollback) ขณะ remote มี v0.12.0–v0.14.0 แล้ว → fetch + reset --hard origin/main (2e73dad) ก่อนพัฒนา กัน regression · แก้ filemode พลิกซ้ำด้วย `git config core.filemode false` (จบปัญหา 114 ไฟล์ mode-flip ถาวร)
- **Prisma schema**: เพิ่ม `DataDomainColumnAssignment` (assetId + columnName → domainId, @@unique([assetId, columnName]) กันซ้ำ, assignedBy, FK Cascade ทั้ง asset/domain, ตรวจใน API ว่าคอลัมน์ต้องมีจริงใน DataAssetColumn — deny-by-default) + relation บน DataDomain/DataAsset — db:push สำเร็จ
- **API ใหม่ 1 เส้น**: `GET /api/domains/assignments?assetId=` (คืน columnName→domainId + domainPath "หลัก / ย่อย") และ `PUT` (บันทึกทั้งชุด: ตรวจสิทธิ์ MANAGE_DATASETS + ตรวจคอลัมน์/โดเมนมีจริงทุกรายการ + จำกัด 200 items + transaction upsert/delete + Audit Trail `ASSIGN_DOMAIN_COLUMNS` สรุป assigned/changed/cleared) · `GET /api/domains` เพิ่ม columnCount รายโดเมน (groupBy) · `PATCH /api/domains/[id]` DELETE guard ขยาย: ลบไม่ได้ถ้ามี columnAssignments ผูกอยู่
- **UI ใหม่ `data-domain-console.tsx`**: (แผงซ้าย) โครงสร้างโดเมน — สร้างโดเมนหลัก/เพิ่มโดเมนย่อย/แก้ไข/ลบ (ฟอร์มชื่อไทย+อังกฤษ+คำอธิบาย+9 สี, ลบได้เฉพาะว่าง พร้อมเหตุผลเมื่อกดลบไม่ได้, badge "n ข้อมูล · n คอลัมน์") · (แผงขวา) จัดหมวดรายคอลัมน์ — Data Asset picker จากคลังข้อมูล → โหลดคอลัมน์ + ค่าจัดหมวดเดิม → ตารางรายคอลัมน์ dropdown เลือกโดเมน/โดเมนย่อยแบบย่อหน้า (└) → dirty indicator "มี n รายการรอบันทึก" → บันทึกรอบเดียวทั้งชุด · มี Select โดเมนระดับชุดข้อมูล (SET_DOMAIN เดิม) · สถิติ 4 ใบ + เลือกผู้ดำเนินการ (4 บทบาท MANAGE_DATASETS)
- **views.ts**: AssetViewKey + view key `asset-domain` (icon FolderTree, th "Data Domain") + NAV_GROUPS กลุ่ม Data Asset = นำเข้าข้อมูล · คลังข้อมูล · **Data Domain** + APP_VERSION v0.15.0 · **page.tsx**: mount แบบ keep-mounted + ส่ง `onGoDomains` ให้ AssetInventory · **asset-inventory.tsx** (1,193→807 บรรทัด): ย้าย UI จัดการโดเมนออกทั้งหมด (Dialog จัดการ/ฟอร์ม/ลบ/จัดโดเมนราย asset) — คง domain filter chips + badge บนการ์ด + โดเมนในแท็บข้อมูล + ปุ่ม "จัดการ Data Domain" ไปหน้าใหม่
- **Seed**: จัดหมวดตัวอย่าง 12 คอลัมน์ (ทะเบียนลูกค้า 7 คอลัมน์ → ลูกค้าบุคคลธรรมดา/บัญชีและเงินฝาก/KYC-AML · อัตราแลกเปลี่ยน 5 คอลัมน์ → อัตราแลกเปลี่ยน) + AuditLog ASSIGN_DOMAIN_COLUMNS ราย asset
- **ตรวจจริงผ่านหมด (API + agent-browser)**: (1) GET domains มี columnCount ✅ (2) GET assignments คืน 7 รายการพร้อม path ✅ (3) PUT สำเร็จ assigned=1 cleared=1 + Audit ✅ (4) deny คอลัมน์แปลกปลอม "hack_col" → 400 ✅ (5) RBAC BUSINESS_USER → 403 ✅ (6) UI: เมนู Data Domain ในกลุ่ม Data Asset, สถิติ 3/5/2-of-2/12, ต้นไม้ + ปุ่มลบ disabled ถูกต้องตามเงื่อนไข ✅ (7) เลือก asset CSV → ตาราง 7 คอลัมน์ + ค่าเดิมครบ ✅ (8) เปลี่ยน branch→KYC/AML + บันทึก → toast + reload แสดงค่าใหม่ + API ยืนยัน ✅ (9) สร้างโดเมน "พนักงาน/Employees" ผ่านฟอร์ม → ปรากฏในต้นไม้ + ลบผ่าน AlertDialog ได้ ✅ (10) inventory: ปุ่ม "จัดการ Data Domain" ไปหน้าใหม่ + chips กรองตามโดเมนยังทำงาน ✅ (11) แก้บั๊ก Select uncontrolled→controlled (asset picker value={assetId}) console สะอาด ✅ (12) แก้บั๊ก mobile 390px overflow (601px → truncate ใน min-content + min-w-0 + overflow-x-hidden) → NO-OVERFLOW ทั้งหน้า Data Domain และคลังข้อมูล ✅ (13) lint สะอาด, dev.log ไม่มี error
- หมายเหตุ: reset --hard ก่อนงาน = sandbox คืน state เก่าเอง — ตั้ง core.filemode=false แล้ว ครั้งหน้าจะไม่เจอปัญหา mode ซ้ำ

Stage Summary:
- **v0.15.0 = Data Domain เป็นเมนูอิสระภายใต้กลุ่ม Data Asset ครบตามโจทย์ 3 ข้อ** — (1) แยกออกจากคลังข้อมูลสมบูรณ์ (inventory เหลือแค่กรอง/แสดงผล) (2) อยู่ลำดับที่ 3 ของกลุ่ม Data Asset (3) ตั้งค่าแบบรายคอลัมน์: เลือกข้อมูลจากคลัง → ระบุ sub data domain ทีละคอลัมน์ → บันทึกรอบเดียว
- ความปลอดภัยตามหลักระบบ: RBAC MANAGE_DATASETS + Audit Trail 100% (CREATE/UPDATE/DELETE_DATA_DOMAIN, SET_DATA_ASSET_DOMAIN, ASSIGN_DOMAIN_COLUMNS) + deny-by-default (คอลัมน์/โดเมนต้องมีจริง, ลบได้เฉพาะโดเมนว่าง, 2 ระดับเท่านั้น) + ไม่แตะข้อมูลต้นทาง (จัดหมวดเป็น metadata ล้วน)
- Rollback point: ก่อนงานนี้ = `2e73dad` (v0.14.0 + worklog Task 22-result) — กู้คืน `git reset --hard 2e73dad && bun run db:push && bun scripts/seed.ts`
- **Push แล้ว**: main (2e73dad → 85c430f) + annotated tag v0.15.0 — push ด้วย token ผู้ใช้ (one-time URL, redact ทุก output, ไม่เข้า git config), ตรวจ ls-remote ตรงเป๊ะ, config CLEAN — ผู้ใช้ควร revoke/rotate token หลังใช้งาน

---
Task ID: 24
Agent: Z.ai Code (main session)
Task: v0.16.0 — ชุดข้อมูล DQ ในโดเมน (ผู้ใช้เลือกแนวทาง C ของข้อ 2: "ทำการสร้าง Dataset เพิ่มใน Data Domain ก่อน และค่อยทำ Dashboard ทีหลัง")

Work Log:
- ตอบคำถามกลับก่อนเขียนโค้ด (ผู้ใช้สั่ง "อย่าเพิ่งทำ ถามข้อมูลได้") — เสนอตัวเลือก A/B/C ของข้อ 2/6/7 + คำถามเพิ่ม 6 ข้อ ผู้ใช้ตอบครบ
- Schema: Dataset.domainId (FK DataDomain, onDelete SetNull) + @@index([domainId]) + relation DataDomain.datasets — db:push สำเร็จ
- API ใหม่: GET /api/dq/datasets (รายการ dataset + domain path + ruleCount/sampleCount/lastBatch) · POST (สร้าง dataset + parser CSV/TSV รองรับ quote/tab จาก Excel, จำกัด 60 คอลัมน์/200 แถว, sanitize header, $transaction สร้าง SampleRow) · PATCH /api/dq/datasets/[id] SET_DOMAIN (409 เมื่อค่าเดิม) — RBAC MANAGE_DATASETS + AuditLog CREATE_DATASET/SET_DATASET_DOMAIN
- GET /api/domains เพิ่ม datasetCount (groupBy) · PATCH /api/domains/[id] DELETE guard ขยายตรวจ datasets ด้วย (409 ระบุ "ชุดข้อมูล DQ สังกัดอยู่ n ชุด")
- lib/domains.ts: DomainItem เพิ่ม datasetCount
- UI data-domain-console.tsx: แผงใหม่ "ชุดข้อมูล DQ ในโดเมน" (ตาราง + เลือกโดเมนรายแถวบันทึกทันที + PII badge) + Dialog สร้างชุดข้อมูล (ชื่อ/แหล่งข้อมูล/โดเมน/CSV paste) + การ์ดสรุปเพิ่มเป็น 5 ใบ + badge ต้นไม้ "n ข้อมูล · n ชุดข้อมูล · n คอลัมน์" (ซ่อนคอลัมน์บนมือถือ) + blockedReason เพิ่มกรณีมี dataset
- Seed: จัดโดเมน 5 dataset (ลูกค้าบุคคลธรรมดา ×2, บัญชีและเงินฝาก ×2, อัตราแลกเปลี่ยน ×1; แคตตาล็อกสินค้า/พนักงาน HR ไม่ระบุ) + AuditLog
- ตรวจผ่าน: lint สะอาด · API lifecycle (สร้าง CSV 3 แถว ✅, dup 409, RBAC 403, SET_DOMAIN ✅, same-domain 409, delete guard 409, audit ครบ) · agent-browser: สร้าง dataset ผ่าน dialog + จัดโดเมนผ่าน dropdown + persistence ยืนยันทาง API · mobile 390px NO-OVERFLOW · ZERO page errors
- Commit 62ebb2b + annotated tag v0.16.0

Stage Summary:
- รากฐาน "คะแนนรายโดเมน" พร้อม: Dataset (โมดูล DQ) ผูกเข้า DataDomain ได้ทั้งตอนสร้างและหลังนำเข้า — เป็นครั้งแรกที่ระบบมี flow สร้าง Dataset จริง (ก่อนหน้ามีแต่ seed)
- กติกาความปลอดภัยคงเดิม: deny-by-default (โดเมนต้องมีจริง/ชื่อซ้ำ/CSV รูปแบบผิด/ลบโดเมนที่มี dataset ไม่ได้) + RBAC + Audit Trail 100%
- Push pending: รอ token จากผู้ใช้ (one-time URL + sed redact ตามกติกา)

---
Task ID: 25
Agent: Z.ai Code (main session)
Task: v0.17.0 — Executive Dashboard (7 ส่วนตามโจทย์) + Executive Reports (เมนูพิมพ์/PDF แยก) + Rule Threshold + Issue SLA — ตามคำตอบผู้ใช้ (ข้อ 6=A, ข้อ 7=B, เมนูใหม่, จำกัดสิทธิ์, แนวโน้ม 30/90/180/365, Critical เลือกได้, ไม่เคยรัน=0, export แยกเมนู)

Work Log:
- Schema: DqRule.threshold Float default 95 · DqIssue.dueAt DateTime? · db:push
- RBAC: เพิ่มสิทธิ์ VIEW_EXEC_DASHBOARD ("ดูแดชบอร์ดผู้บริหาร") ให้ DATA_OWNER / DATA_STEWARD / DQ_ANALYST / COMPLIANCE_OFFICER / EXECUTIVE / SYS_ADMIN — ปิด BUSINESS_USER + DATA_ENGINEER
- API ใหม่ GET /api/executive/summary (viewer + days + issuesMode): คะแนนรวม (batch/run ล่าสุด · ไม่เคยรัน=0) · byDomain จาก Dataset.domainId + bucket ไม่ระบุ · rules passed/failed จาก latest run · Critical Issues (open|all) · trend 30/90/180/365 (เกิน 90 วัน = weekly bucket วันจันทร์) · belowThreshold (gap เรียงมากสุดก่อน) · slaOverdue (dueAt ที่ผู้ใช้ตั้ง, OPEN/IN_PROGRESS) — 403 ถ้า viewer ไม่มีสิทธิ์ (deny-by-default)
- ปรับจาก batch → DqRun: seed ไม่สร้าง DqValidationBatch จึงคำนวณจาก DqRun วิธีเดียวกับ Scorecard (latest run รายกฎ×ชุดข้อมูล)
- API เดิมขยาย: rules POST รับ threshold + GET คืน threshold · rules/[id] PATCH เพิ่ม SET_THRESHOLD (0–100, audit SET_RULE_THRESHOLD) · issues GET คืน dueAt · issues/[id] PATCH เพิ่ม SET_DUE (ตั้ง/ล้าง, ห้ามบน RESOLVED/CLOSED 409, audit SET_ISSUE_DUE)
- UI ใหม่ dq/executive-dashboard.tsx: KPI 4 ใบ (Overall พร้อมเกรด+never-run, กฎผ่าน/ไม่ผ่านแบบแท่ง, Critical + toggle ยังไม่ปิด/ประวัติ, SLA) + recharts AreaChart แนวโน้ม + ปุ่ม 30/90/180/365 + แท่งคะแนนรายโดเมน (สีตามโดเมน, เรียงแย่สุดก่อน, bucket ไม่ระบุ) + ตารางกฎต่ำกว่าเกณฑ์ + ตารางเกิน SLA + รายการ Critical — RBAC gate card เมื่อ 403
- UI ใหม่ dq/executive-reports.tsx (เมนูแยกตามที่ผู้ใช้ขอ): เลย์เอาต์รายงานพิมพ์ 5 ส่วน (สรุปผู้บริหาร/แนวโน้ม/รายโดเมน/ต่ำกว่าเกณฑ์/เกิน SLA) + ปุ่ม window.print() + print:hidden ซ่อน sidebar/header/footer/ปุ่มทั้งหมด
- views.ts: ExecViewKey 'exec-dashboard' (Crown) + 'exec-reports' (Printer) ในกลุ่ม ภาพรวม · APP_VERSION v0.17.0 · page.tsx wiring keep-mounted + print:hidden บน header/footer · app-sidebar print:hidden
- Rule Builder (core-features-console): ช่อง "ค่าผ่านขั้นต่ำ (%)" (number 0–100 step .5, default 95) + POST threshold + badge "ผลรันล่าสุด n% · ต่ำกว่าเกณฑ์ x%" (แดง) / "เกณฑ์ผ่าน n%" (ยังไม่รัน)
- Issues page: แสดง "วันครบกำหนด (SLA)" ใน dl + badge "เกินกำหนด n วัน" ในตารางและ dialog + กล่องตั้งวันครบกำหนด (date input + saveDue → SET_DUE)
- Seed: threshold รายกฎ (customer_id/segment=100, phone=90, ที่เหลือ 95) · ISS-0001 → CRITICAL + dueAt เกินกำหนด 10 วัน · ISS-0002 dueAt อีก 5 วัน · RUN_BATCHES ขยาย 14 รอบ (210→0 วัน) ให้แนวโน้ม 365 วันมี 12 จุดรายสัปดาห์
- บั๊กที่จับได้: JSX ขาดวงเล็บปิด ("ผ่าน {passRate ?? '—}%") ทำ parsing error — แก้แล้ว · issues GET คอมมาซ้ำ (, ,) — แก้แล้ว
- ตรวจผ่าน: lint สะอาด · RBAC 403 BUSINESS_USER (ข้อความไทยระบุบทบาทที่อนุญาต) + DATA_ENGINEER 403 · SET_DUE ตั้ง/ล้าง/403 · SET_THRESHOLD ตั้ง/150→400 · agent-browser: แดชบอร์ดครบ 7 วิดเจ็ต (39.0 วิกฤต, 3/9 กฎ, Critical 1, SLA 1, โดเมน 4 กลุ่ม, กฎต่ำกว่าเกณฑ์ 6 รายการ) + สลับ 365 วัน → weekly 12 จุด + โหมดประวัติ · Reports ครบ 5 ส่วน + ปุ่มพิมพ์ · คลังกฎ badge ต่ำกว่าเกณฑ์ · Issues ตั้ง due date ผ่าน UI สำเร็จ (toast + ค่าใหม่ + badge หาย) · mobile 390px NO-OVERFLOW ทั้ง 2 หน้า · ZERO console/page errors
- Commit eef2099 + annotated tag v0.17.0

Stage Summary:
- **ครบโจทย์ผู้บริหาร 7 ข้อ + เมนู Export/Print แยก**: Overall DQ Score (ไม่เคยรัน=0 ตามที่ผู้ใช้กำหนด) · คะแนนราย Data Domain (จากการผูก Dataset→Domain ของ v0.16.0) · กฎผ่าน/ไม่ผ่าน · Critical Issues (สลับยังไม่ปิด/ประวัติ) · แนวโน้มเลือก 30/90/180/365 (รายวัน→รายสัปดาห์อัตโนมัติ) · กฎต่ำกว่า threshold (ตั้งรายกฎได้) · ปัญหาเกิน SLA (dueAt ตั้งรายปัญหาได้)
- สิทธิ์: เมนูแสดงทุกคนแต่ API บังคับ VIEW_EXEC_DASHBOARD (6 บทบาท) — BUSINESS_USER/ENGINEER เจอ gate 403 พร้อมคำอธิบาย
- คำนวณจาก DqRun (วิธีเดียวกับ Scorecard) — แนวโน้มเป็นค่าจริงจากเอนจินประเมินผล ไม่ใช่ข้อมูลจำลอง
- Push pending ทั้ง v0.16.0 + v0.17.0: รอ token จากผู้ใช้ (push main + 2 tags ครั้งเดียวได้)

---
Task ID: 26
Agent: Z.ai Code (main session)
Task: Push v0.16.0 + v0.17.0 ขึ้น GitHub (main + 2 annotated tags) ด้วย GitHub PAT ที่ผู้ใช้ให้มา — ปิดงานค้างจาก Task 25

Work Log:
- รับ GitHub PAT ใหม่จากผู้ใช้ (fine-grained) — ใช้แบบ one-time ผ่าน push URL เท่านั้น ไม่บันทึกลง disk / ไม่แตะ .git/config / ไม่เข้าไฟล์ใด ๆ ทั้งสิ้น
- `git push <url> main refs/tags/v0.16.0 refs/tags/v0.17.0` → สำเร็จ: `afa50ba..68f3c80 main`, `* [new tag] v0.16.0`, `* [new tag] v0.17.0`
- ตรวจสอบ remote ด้วย `git ls-remote` เทียบ SHA ระดับ commit ทั้ง 3 จุด:
  - `refs/heads/main` = `68f3c80facfd0d32096b2fa64ef0635af0034d2e` ✓ ตรงกับ local main
  - `refs/tags/v0.16.0^{}` = `62ebb2b088bde7352ffe558dd95fda0b2f29a0a9` ✓ ตรงกับ local
  - `refs/tags/v0.17.0^{}` = `eef209938b4de94e02da8cdb8345eb8797bbfef1` ✓ ตรงกับ local
- commit `docs(worklog)` รายการนี้ แล้ว push ตามด้วย token เดียวกัน เพื่อให้ remote = local 100%
- แจ้งเตือนผู้ใช้เรื่องความปลอดภัย: token ถูกวางลงในแชต ควร revoke/rotate หลังใช้งานเสร็จ (ระบบไม่มีการจัดเก็บ token ไว้เลย)

Stage Summary:
- GitHub ตอนนี้มีครบ: main ถึง `68f3c80` + tag `v0.16.0` (Dataset ในโดเมน) + tag `v0.17.0` (Executive Dashboard/Reports + threshold + SLA)
- สถานะ sync: remote = local 100% (sync เต็มรูปแบบหลัง push commit เอกสารรายการนี้)
- งานค้าง "รอ token" จาก Task 25 ปิดสมบูรณ์ — ไม่มี artifact ใดค้างบน local เท่านั้น

---
Task ID: 27
Agent: Z.ai Code (main session)
Task: ออกแบบโครงสร้างใหม่ "Data Domain > Sub Data Domain > Data Element > Meta Data" + การผูก DQ Rule กับ Data Element (เฉพาะออกแบบ — ยังไม่ implement ตามคำสั่งผู้ใช้)

Work Log:
- สำรวจฐานปัจจุบัน v0.17.0: DataDomain (2 ระดับ, parentId) · DataDomainColumnAssignment (column→domain, v0.15.0) · Dataset.domainId + สร้าง Dataset ในโดเมน (v0.16.0) · DqRule {column, condition, parameters, severity, threshold} + RuleDataset M2M · รันตรวจต่อ dataset → DqRun/DqValidationBatch/DqFailureRecord
- ร่างโครงสร้าง 4 ระดับ + นิยาม Data Element 2 ทางเลือก (A: element เชิงตรรกะ map หลายคอลัมน์ข้ามชุดข้อมูล — แนะนำ / B: 1 element = 1 คอลัมน์)
- ร่าง Meta Data: กลุ่มนิยาม (รหัส/ชื่อ TH-EN/นิยามธุรกิจ/ตัวอย่าง) · โครงสร้าง (dataType/format/ช่วงค่า/ค่าอนุญาต) · ธรรมาภิบาล (เจ้าของ/PII/การจำแนก/สถานะ lifecycle) · ที่มา (จาก mapping อัตโนมัติ) + custom fields
- ร่างการผูกกฎ: DqRule.dataElementId (nullable ช่วงเปลี่ยนผ่าน) · Rule Builder เลือก Domain→Sub→Element · บังคับ mapping ≥1 คอลัมน์ก่อนรัน · DqRun.dataElementId เพื่อ rollup คะแนนระดับ element→sub→domain
- ร่าง flow รันระดับโดเมน: เลือกโดเมน → ตาราง element×กฎ (เลือกได้) → รัน → batch ต่อ dataset + groupRunId ร่วม → สรุประดับ element/sub/domain
- ระบุแผน migration: v0.15.0 column assignments → สร้าง element + mapping อัตโนมัติ (เสนอให้ผู้ใช้เลือก migrate หรือคงไว้คู่ขนาน) · Executive Dashboard byDomain ยังทำงานจาก Dataset.domainId เดิมได้ทันที
- จัดทำ 7 คำถามเปิดให้ผู้ใช้ตัดสินใจก่อนเริ่ม Phase 1 (นิยาม element / ระดับแขวน / ชุด metadata / migration v0.15.0 / semantics การรัน / เมนู / สิทธิ์)
- นำเสนอแผน 5 Phase ในแชต — รอการอนุมัติ ยังไม่แก้โค้ด/schema ใด ๆ

Stage Summary:
- แผนออกแบบครบถ้วนนำเสนอผู้ใช้แล้ว (โครงสร้าง 4 ระดับ + rule↔element + flow + migration + RBAC/audit + 5 phases)
- สถานะ: รอคำตอบ 7 คำถามจากผู้ใช้ก่อนเริ่มพัฒนา — โค้ด/schema ยังไม่ถูกแตะ (v0.17.0 ยังเป็นเวอร์ชันปัจจุบัน)
- หมายเหตุ: commit นี้เป็นเอกสารการวางแผนเท่านั้น จะถูก push พร้อมรอบถัดไป

---
Task ID: 28
Agent: Z.ai Code (main session)
Task: v0.18.0 Phase 1 — Schema DataElement 4 ระดับ + migration แปลงข้อมูลเดิม + API ครบวงจร (ตามคำตอบผู้ใช้ 1ก/2ใต้ย่อย/3 ISO 11179/4แปลงเลย/5rollup/6ขยายเดิม/7ไม่เพิ่มสิทธิ์)

Work Log:
- Schema: DataElement (code EL-#### อัตโนมัติ, subDomainId บังคับใต้โดเมนย่อย, meta ตาม ISO/IEC 11179: definition/examples/formatPattern/valueDomain/maxLength/unit/ownerId/pii/classification/status DRAFT-ACTIVE-DEPRECATED/customFields JSON) + DataElementColumnMapping (element↔asset.columnName, unique กันซ้ำ) + DqRule.dataElementId (nullable, SetNull) + DqRun.dataElementId (snapshot string ไม่ใช่ FK — คงประวัติแม้ลบ element) + DqValidationBatch.groupRunId (จัดกลุ่มรอบรันโดเมน) — db:push สำเร็จ
- Migration แปลงข้อมูลเดิมตามที่ผู้ใช้ตัดสินใจ ("แปลงเป็น Data Element เลย"): scripts/migrate-elements.ts แปลง DataDomainColumnAssignment → element + mapping (ข้ามที่ชี้โดเมนหลักตรง ๆ, meta สมบูรณ์จากคลัง ELEMENT_CATALOG, idempotent) — ผลจริง: สร้าง 12 element + 12 mapping, ข้าม 0
- src/lib/elements.ts: constants/labels + ElementItem types + ELEMENT_CATALOG (ISO 11179 ครบ 11 รายการ) + nextElementCode + rollupByElement (ถ่วงน้ำหนักแถว) + aggregateRollups — ใช้ร่วม seed/API/migration
- seed.ts: สร้าง element จากคลัง + fallback จาก assignment ที่ยังไม่แมป + ผูกกฎตัวอย่าง 4 ข้อ (customer_id→รหัสลูกค้า, email→อีเมล, phone→เบอร์โทรศัพท์, currency→สกุลเงิน) + audit
- APIs ใหม่ (ทั้งหมด deny-by-default + Audit Trail + MANAGE_DATASETS/RUN_VALIDATION ตาม RBAC เดิม — ไม่เพิ่มสิทธิ์ใหม่):
  - /api/elements GET (flat + counts + subDomain info) + POST (บังคับใต้โดเมนย่อย, กันชื่อซ้ำรายโดเมนย่อย, EL-#### อัตโนมัติ)
  - /api/elements/[id] GET (meta ครบ + mappings + rules ผูก) + PATCH UPDATE/DELETE (ลบไม่ได้ถ้ามีกฎผูก 409, ห้ามย้ายโดเมนย่อย)
  - /api/elements/[id]/mappings GET + PUT replace-all ใน transaction (ตรวจคอลัมน์มีจริงใน asset ปฏิเสธแปลกปลอม, MAP_ELEMENT_COLUMNS)
  - /api/dq/rules GET คืน dataElement{path} · POST รับ dataElementId (ตรวจมีจริง) · [id] PATCH เพิ่ม SET_ELEMENT (ผูก/ปลด, SET_RULE_ELEMENT)
  - /api/dq/run-domain POST (โดเมนหลักเท่านั้น → element ACTIVE → กฎที่ผูก → รันราย dataset + batch แบบ groupRunId เดียวกัน + DqRun.dataElementId + failure snapshot + สัญญาณ RULE_VIOLATION กันซ้ำ) และ GET (ผลรอบล่าสุด rebuild rollup) — คะแนน rollup element(ถ่วงแถว)→sub→domain
  - /api/domains GET เพิ่ม elementCount · [id] DELETE guard เพิ่ม elements
- เตือนผู้ใช้: บั๊ก Prisma Client เก่าหลัง db:push (db.dataElement undefined) — แก้ด้วยการรีสตาร์ท dev server

Stage Summary:
- ฐานข้อมูลจริงแปลงเสร็จ: 12 Data Element มี meta ISO/IEC 11179 ครบ + แมปคอลัมน์จริง 12 รายการ
- ผูกกฎจริง 4 ข้อผ่าน API SET_ELEMENT + รันจริง POST /api/dq/run-domain: โดเมน "ลูกค้า" → 4 ผลรัน 5 element → รหัสลูกค้า 100 / อีเมล 85 / เบอร์โทรศัพท์ 90 → rollup โดเมน 91.7 (ถ่วงแถว) ถูกต้อง
- กติกาใหม่ครบ: element ใต้โดเมนย่อยเท่านั้น · ลบ element ต้องไม่มีกฎผูก · ลบโดเมนต้องไม่มี element

---
Task ID: 29
Agent: Z.ai Code (main session)
Task: v0.18.0 Phase 2-4 — UI ครบวงจร: หน้า Data Domain 4 ระดับ + Rule Builder ผูก element + รันตามโดเมน + rollup (subagent ไม่ถูกใช้ — งานผูกกับ API shape ที่เพิ่งเขียนแน่นเกินส่งต่อ บันทึกการตัดสินใจ)

Work Log:
- data-domain-console.tsx เขียนใหม่ (1,850 บรรทัด): ต้นไม้โดเมนคลิกเลือกได้ (highlight + elementCount badge + deletable เช็ค element) · แท็บ 3 ใบ: Data Element (ใหม่) / จัดหมวดคอลัมน์ (v0.15.0 คงเดิม) / ชุดข้อมูล DQ (v0.16.0 คงเดิม) · ลิสต์ element รายโดเมนย่อย (โดเมนหลัก = อ่านอย่างเดียวรวมทุกย่อย) · Dialog รายละเอียด Meta Data ครบ (นิยาม/ตัวอย่าง/ประเภท/รูปแบบ/value domain/ความยาว/owner/classification/PII/custom) + mapping editor (เลือก asset → checkbox คอลัมน์ → PUT replace-all) + กฎที่ผูก + ปุ่มแก้ไข/ลบ · ฟอร์มสร้าง/แก้ไข element (ทุกฟิลด์ meta + Switch PII + Select status/classification/owner) · DialogTitle ครบทุกสถานะ (แก้ accessibility warning ของ Radix)
- core-features-console.tsx (Rule Builder): กล่อง "Data Element (What)" cascade 3 ชั้น โดเมนหลัก→ย่อย→element (ไม่บังคับ) + chip meta เมื่อเลือก (รหัส/ประเภท/รูปแบบ/ค่าอนุญาต/สถานะแมป) + POST dataElementId + รายการกฎแสดง badge element (title=path เต็ม)
- คลังกฎโหมด library: rules API ใหม่คืน dataElement — badge แสดงอัตโนมัติทั้ง 2 โหมด
- dq/domain-run.tsx ใหม่: เลือกโดเมนหลัก → โหลด element+กฎที่ผูก+ผลรอบล่าสุด (GET run-domain) → ต้นไม้เลือกกฎราย element (checkbox, เลือกทั้งหมด) → รัน (POST ruleIds) → ผลลัพธ์: การ์ดคะแนน rollup โดเมน+เกรด, แท่งคะแนนราย sub (เรียงแย่สุดก่อน), ตารางคะแนนราย element (ยังไม่ได้ประเมิน แสดงชัด), รายละเอียดรายกฎ — ฝังเป็นแท็บ 2 ของหน้า Validation Results ("รันตามชุดข้อมูล" | "รันตามโดเมน (Data Element)")
- views.ts: APP_VERSION v0.18.0 + คำอธิบายหน้า Data Domain ใหม่ · lib/domains.ts: DomainItem.elementCount?

Stage Summary:
- agent-browser E2E ผ่านทั้งหมด: หน้า 4 ระดับ (ต้นไม้ 8 โดเมน + 12 element, dialog ISO meta, mapping editor, ลบกันถูก) · Rule Builder (badge 4 กฎ + cascade) · รันโดเมนจริงบนหน้าเว็บ → 91.7/100 เกรด ดี + ตาราง element ถูกทุกค่า (100/85/90/ยังไม่ประเมิน) · console error = 0 (แก้ DialogTitle แล้ว) · mobile 390px NO-OVERFLOW · lint สะอาด
- v0.18.0 ครบโจทย์ผู้ใช้ทุกข้อ: 4 ระดับ + Meta Data ดูรายละเอียด + กฎตรวจตาม element + flow นำเข้า→คลัง→แบ่ง→เลือกโดเมน→เลือกกฎราย element + rollup แสดงในผลรัน

---
Task ID: 30
Agent: Z.ai Code (main session)
Task: Push v0.18.0 ขึ้น GitHub (main + annotated tag) ด้วย GitHub PAT ใหม่ที่ผู้ใช้ให้มา

Work Log:
- รับ GitHub PAT ใหม่จากผู้ใช้ — ใช้แบบ one-time ผ่าน push URL เท่านั้น ไม่บันทึกลง disk / ไม่แตะ .git/config / ไม่เข้าไฟล์ใด ๆ
- ตรวจก่อน push: main นำ remote (ca97e46) อยู่ 2 commits (`9d41157` docs Task 27 แผนออกแบบ + `863483b` v0.18.0) + annotated tag `v0.18.0` ชี้ `863483b`
- `git push <url> main refs/tags/v0.18.0` → สำเร็จ: `ca97e46..863483b main`, `* [new tag] v0.18.0`
- ตรวจสอบ remote ด้วย `git ls-remote` เทียบ SHA ระดับ commit:
  - `refs/heads/main` = `863483b29799e2b5c0cd0fc623f4c42a2dfbd875` ✓ ตรงกับ local
  - `refs/tags/v0.18.0^{}` = `863483b29799e2b5c0cd0fc623f4c42a2dfbd875` ✓ ตรงกับ local (tag ชี้ commit feat โดยตรง)
- commit `docs(worklog)` รายการนี้แล้ว push ตามด้วย token เดียวกัน → remote = local 100%
- แจ้งเตือนผู้ใช้: token ถูกวางลงแชต ควร revoke/rotate หลังใช้งาน (ระบบไม่จัดเก็บ token เลย)

Stage Summary:
- GitHub ครบถ้วนถึง v0.18.0: โครงสร้าง 4 ระดับ Data Domain > Sub > Element > Meta Data + Rule-Element binding + Domain Run Rollup
- สถานะ sync: remote = local 100% (หลัง push commit เอกสารรายการนี้)
- ไม่มี artifact ใดค้างบน local เท่านั้น — รอบถัดไปเริ่มจาก v0.18.0 ที่ push แล้ว

---

## Task ID: 31
**Agent**: Z.ai Code (main orchestrator)
**Task**: จัดรูปแบบการใช้งานหน้า "คลังกฎตรวจสอบ" ให้เป็นขั้นตอน (v0.18.1) — ตอบความกังวลของผู้ใช้ว่า "หลายเมนูในหน้าเดียวผู้ใช้อาจไม่เข้าใจ"
(Reorganize the DQ Rule Library into a guided step flow — v0.18.1)

Work Log:
- วิเคราะห์ UX เดิม: ฟอร์มสร้างกฎยาว 9 ส่วนในการ์ดเดียว (ชุดข้อมูล → Element → ตัวอย่าง → คอลัมน์ → เงื่อนไข → รุนแรง/เกณฑ์ → พารามิเตอร์ → when → ผู้ดำเนินการ) ไม่มีตัวบอกลำดับ + ความสัมพันธ์ กฎ↔เงื่อนไข ไม่ถูกอธิบาย + ไม่มีภาพ flow รวม
- เลือกทางแก้แบบ "ขั้นตอน (wizard)" แทน "แยกเมนูใหม่" — เพราะกลุ่มเมนู Data Quality มี 6 เมนูแล้ว และเงื่อนไขกับกฎผูกกันแน่นจนควรอยู่หน้าเดียวกัน
- `core-features-console.tsx`:
  - เพิ่ม `RB_STEPS` (เป้าหมาย/คอลัมน์/เงื่อนไข/ตั้งค่า) + state `rbStep` (1–4)
  - derived `rbStepValid` + `rbCanGoTo` — deny-by-default ต่อขั้น (ไปขั้นถัดไปได้เมื่อขั้นก่อนครบ: ขั้น 1 ต้องมีชุดข้อมูล · ขั้น 2 ต้องมีคอลัมน์ · ขั้น 3 ต้องมีเงื่อนไข)
  - stepper header แบบ `<ol>` 4 ช่อง (aria-current="step", ขั้นที่ทำแล้วแสดง ✓, คลิกย้อนได้, ขั้นที่ยังไปไม่ได้ disabled เส้นประ)
  - จัดฟอร์มเดิมเป็น 4 step panels: ขั้น 1 = ชุดข้อมูล+Data Element cascade · ขั้น 2 = ตัวอย่างข้อมูล sandbox+คอลัมน์ · ขั้น 3 = เงื่อนไข (must)+พารามิเตอร์ using (+hint ชี้ไปคลังเงื่อนไข) · ขั้น 4 = รุนแรง/เกณฑ์/when/ผู้ดำเนินการ
  - live sentence preview แสดงทุกขั้น + summary chips "เลือกไว้: ชุดข้อมูล/EL-code/คอลัมน์/เงื่อนไข" คลิกกลับไปแก้ขั้นนั้นได้
  - nav footer: ย้อนกลับ / ถัดไป (disabled ตาม validity) / บันทึกกฎใหม่ (เฉพาะขั้น 4) · บันทึกสำเร็จ → reset กลับขั้น 1
  - แถบแนะนำ 3 ขั้นตอนบนหัวหน้า (library mode): ① เตรียมเงื่อนไข (ข้ามได้) → ② สร้างกฎ 4 ขั้น → ③ รันตรวจ/ดูผล — ปุ่มนำทาง: สลับแท็บเงื่อนไข/กฎ + ไปหน้าผลการตรวจสอบ (validation-results) · highlight ขั้นที่ active
  - ฟอร์มสร้างเงื่อนไขใส่เลขขั้นที่ 1–4 ครบ (ชื่อ+ประโยค → มิติ → เอนจิน → พารามิเตอร์)
- `views.ts`: APP_VERSION v0.18.1 + desc หน้า rule-library บอกลำดับ 4 ขั้น
- ตรวจ: `bun run lint` ผ่าน · dev.log ไม่มี error
- E2E (agent-browser): เดิน wizard ครบ — เลือกชุดข้อมูล "ลูกค้าองค์กร — Master" → ถัดไปเปิด → ขั้น 2 เห็นตัวอย่างข้อมูลจริง เลือกคอลัมน์ email → ขั้น 3 เลือก "รูปแบบอีเมลถูกต้อง" (chips ย้อนกลับแสดง) → ขั้น 4 บันทึกกฎใหม่ → `POST /api/dq/rules 201` กฎข้อที่ 12 โผล่ในลิสต์ถูกต้อง (column=email, MEDIUM, เกณฑ์ 95) + wizard reset ขั้น 1 · ปุ่มแถบแนะนำนำทางถูกทั้ง 3 ปุ่ม · mobile 375px NO-OVERFLOW · ไม่มี console error

Stage Summary:
- **เวอร์ชัน**: v0.18.1 (local commit — รอ token ผู้ใช้สำหรับ push รอบถัดไป รวมกับ docs commit ของ Task 27/30 ถ้ามีค้าง)
- **UX ใหม่**: หน้าคลังกฎตรวจสอบ = แถบ flow 3 ขั้น + 2 แท็บ + wizard 4 ขั้น deny-by-default ต่อขั้น — ลด cognitive load จากฟอร์มยาว 9 ส่วนเป็นทีละขั้นมีตรวจความครบ
- **ไฟล์แก้**: src/components/core-features-console.tsx, src/lib/views.ts
- **ไม่แก้**: โครงสร้าง API/schema/สิทธิ์ (ฝั่ง backend เหมือนเดิมทุกอย่าง — เป็นการจัด UI flow เท่านั้น)

---
Task ID: 32
Agent: Z.ai Code (main session)
Task: Push v0.18.1 ขึ้น GitHub (main + annotated tag) ด้วย GitHub PAT ใหม่ที่ผู้ใช้ให้มา

Work Log:
- รับ GitHub PAT ใหม่จากผู้ใช้ — ใช้แบบ one-time ผ่าน push URL เท่านั้น ไม่บันทึกลง disk / ไม่แตะ .git/config / ไม่เข้าไฟล์ใด ๆ (output ทุกครั้งผ่าน sed redact token ก่อนแสดง)
- ตรวจก่อน push: remote main = `531235a` (Task 30, v0.18.0) · local นำ 1 commit = `ca0e28f` (v0.18.1) · working tree clean
- สร้าง annotated tag `v0.18.1` ชี้ `ca0e28f` (สไตล์ข้อความเดียวกับ tag รุ่นก่อน ๆ)
- `git push <url> main refs/tags/v0.18.1` → สำเร็จ: `531235a..ca0e28f main` + `* [new tag] v0.18.1`
- ตรวจสอบ remote ด้วย `git ls-remote` เทียบ SHA ระดับ commit:
  - `refs/heads/main` = `ca0e28f42f33454987f71f81680c6b13dac96179` ✓ ตรงกับ local
  - `refs/tags/v0.18.1` = `3e501f9305854c6763a6ec98fe312832383e562e` ✓ · `^{}` peeled = `ca0e28f...` ✓ (tag ชี้ commit feat โดยตรง)
- commit `docs(worklog)` รายการนี้แล้ว push ตามด้วย token เดียวกัน → remote = local 100%
- แจ้งเตือนผู้ใช้: token ถูกวางลงแชต ควร revoke/rotate หลังใช้งาน (ระบบไม่จัดเก็บ token เลย)

Stage Summary:
- GitHub ครบถ้วนถึง v0.18.1: หน้าคลังกฎตรวจสอบจัดเป็นแถบ flow 3 ขั้น + Rule Builder wizard 4 ขั้น (deny-by-default ต่อขั้น, live preview, summary chips)
- สถานะ sync: remote = local 100% (หลัง push commit เอกสารรายการนี้) — ไม่มี artifact ค้าง local เท่านั้น
- Roadmap คงเหลือ: Phase 5 — Executive Dashboard byDomain อัปเกรดเป็น element rollup (ตามแผนล็อกแล้ว)

---
Task ID: 33
Agent: Z.ai Code (main session)
Task: Push v0.18.1 (Task 31 ค้าง) + Implement & Push v0.19.0 — Phase 5: Executive Dashboard byDomain อัปเกรดเป็น Element Rollup

Work Log:
- ใช้ GitHub PAT ที่ผู้ใช้ให้ในรอบนี้ แบบ one-time URL (redact token ใน output ทุกครั้ง ไม่บันทึกลง disk / ไม่แตะ .git/config)
- Push ค้างจากเดิม: `ca0e28f` (v0.18.1) + สร้าง annotated tag `v0.18.1` ชี้ commit เดียวกัน → push สำเร็จ `531235a..ca0e28f main` + `[new tag] v0.18.1` · ls-remote ยืนยัน SHA ตรงทุกรายการ (main = ca0e28f, tag^{} = ca0e28f)
- ตรวจ security: `rg "github_pat_…"` ทั้ง repo = ไม่พบ token บน disk · `git config --local` ไม่มี token · origin URL ไม่ถูกแตะ
- **Phase 5 (v0.19.0)** — byDomain ของแดชบอร์ดผู้บริหารเปลี่ยนจาก "เฉลี่ยคะแนนชุดข้อมูลผ่าน Dataset.domainId" เป็น "Element Rollup 4 ระดับ":
  - ตรวจพบว่า /api/dq/run ไม่ได้ snapshot dataElementId ลง DqRun (เฉพาะ run-domain) → ใช้ที่มาคะแนนจาก **DqRule.dataElementId (การผูกกฎ–element ปัจจุบัน) × ผลรันล่าสุดราย (กฎ×ชุดข้อมูล)** จึงครอบทั้งรันเดี่ยวและรันระดับโดเมน
  - ใช้ `rollupByElement()` จาก src/lib/elements.ts — วิธีคำนวณเดียวกับหน้ารันระดับโดเมน (ถ่วงน้ำหนักจำนวนแถว)
  - โดเมนย่อย = เฉลี่ยคะแนน element ทั้งหมดใต้โดเมนย่อย (element ยังไม่ถูกวัด นับ 0 ตามนิยามผู้บริหาร "ไม่เคยรัน = 0" · โดเมนย่อยที่ไม่มี element ไม่เข้าเฉลี่ย) · โดเมนหลัก = เฉลี่ยคะแนนโดเมนย่อย · เรียงแย่สุดก่อน · โดเมนหลักที่ไม่มี element เลยยังไม่แสดง
  - unassigned (ชุดข้อมูลนอกโดเมน) คงวิธีคะแนนชุดข้อมูลเดิม เพราะไม่มี element คลุม
  - UI: widget "คะแนนแยกตาม Data Domain" เพิ่ม badge "Element Rollup" + แถวแสดง "N element · วัดแล้ว N" + คำอธิบายวิธีคำนวณใต้ widget · รายงานผู้บริหาร (executive-reports) เปลี่ยนคอลัมน์ "ชุดข้อมูล" เป็น "Element (วัดแล้ว/ทั้งหมด)"
  - API เพิ่ม field `byDomain.method = 'ELEMENT_ROLLUP'` และอัปเดตคอมเมนต์นิยามคะแนนครบ
  - views.ts: APP_VERSION v0.19.0 + desc หน้าแดชบอร์ดผู้บริหารระบุ Element Rollup
- ตรวจ: `bun run lint` ผ่าน · dev.log ไม่มี error
- E2E: curl API ตรวจสอบคะแนนตรงตามที่คำนวณด้วยมือ (ลูกค้า 5 element วัด 3 = 55.0 · การเงิน 6/1 = 9.5 · การปฏิบัติตามกฎเกณฑ์ 1/0 = 0.0 · unassigned 2 ชุด = 50.0) + agent-browser: แดชบอร์ด/รายงานแสดงข้อมูลตรงกัน 100%, badge+footer แสดง, mobile 375px NO-OVERFLOW (ทั้งสองหน้า), ไม่มี console error, footer ถูกเนื้อหายาวดันลงล่างถูกต้อง
- commit `332b625` + tag `v0.19.0` → push สำเร็จ `f25ea02..332b625 main` + `[new tag] v0.19.0` · ls-remote ยืนยัน SHA ตรง (main = 332b625, tag^{} = 332b625)
- commit docs(worklog) รายการนี้ แล้ว push ด้วย token เดียวกัน → remote = local 100%
- แจ้งเตือนผู้ใช้: token ถูกวางลงแชต ควร revoke/rotate หลังใช้งาน

Stage Summary:
- GitHub ครบถ้วนถึง v0.19.0: Phase 5 จบตามแผนล็อก — byDomain = Element Rollup 4 ระดับ (Element→Sub→Domain) ทั้งแดชบอร์ดและรายงาน PDF
- Roadmap 4 ระดับ (Phase 1–5) ครบทั้งหมดแล้ว: schema/DataElement · UI master-detail · Rule-Element binding · Domain Run Rollup · Executive Dashboard rollup
- สถานะ sync: remote = local 100% — ไม่มี artifact ค้าง local เท่านั้น

---
Task ID: 34-b
Agent: general-purpose subagent
Task: v0.20.0 Executive Dashboard/Reports — ธง CDE/การเงินมีผลจริง (นับความครอบคลุม + คะแนนต่ำกว่าเกณฑ์ 85)

Work Log:
- src/app/api/executive/summary/route.ts: select เพิ่ม isCde/isFinancial ในคิวรี DataElement (ACTIVE) · loop byDomain (Element Rollup 4 ระดับ) ขยายนับต่อโดเมนหลัก: cdeTotal/cdeMeasured (rollup score != null)/cdeBelow (score < ELEMENT_FLAG_BELOW_THRESHOLD import จาก @/lib/elements) + finTotal/finBelow แบบเดียวกัน · เพิ่ม top-level response field governance { cdeTotal, cdeMeasured, cdeBelow, finTotal, finBelow } รวมจากทุกโดเมนที่แสดงใน byDomain.groups เท่านั้น (reduce หลัง filter elementCount>0) · อัปเดต doc comment หัวไฟล์ระบุนิยาม governance v0.20.0 · ส่วนอื่น (permission/trend/issues/SLA) ไม่แตะเลย
- src/components/dq/executive-dashboard.tsx: ExecSummary ขยาย group + governance · เพิ่ม lucide Star + Banknote · widget "คะแนนแยกตาม Data Domain" เพิ่มบรรทัดสรุปใต้ header (แสดงเมื่อ groups ไม่ว่าง): ★ CDE วัดแล้ว {measured}/{total} · ต่ำกว่าเกณฑ์ {below} + การเงิน {total} รายการ · ต่ำกว่าเกณฑ์ {below} (flex-wrap + text-[10px] + tabular-nums ปลอดภัย 375px) · แถวโดเมน: เติม " · CDE {measured}/{total}" เมื่อ cdeTotal>0 + " · CDE ต่ำ {below}" เหลือง (text-amber-700 font-medium) เมื่อ cdeBelow>0 + " · การเงิน {total}" เมื่อ finTotal>0 + " · ต่ำ {below}" เหลืองเมื่อ finBelow>0 · วิดเจ็ตอื่นไม่แตะ
- src/components/dq/executive-reports.tsx: ExecSummary ขยายเหมือนกัน · คอลัมน์ "Element (วัดแล้ว/ทั้งหมด)" เติม " · CDE {measured}/{total}" เมื่อ cdeTotal>0 + " · CDE ต่ำ {below}" เหลืองเมื่อ below>0 (text wrap ปลอดภัยงานพิมพ์) · เพิ่มประโยคสรุปใต้ตารางส่วน 3: ความครอบคลุมธง CDE/การเงินรวม + นิยามเกณฑ์ 85 (แสดงเฉพาะเมื่อมีธง) · ประโยคอื่น/ส่วนอื่นคงเดิม
- ตรวจ: bun run lint ผ่านสะอาด (eslint) · bunx tsc --noEmit ไม่มี error ใน 3 ไฟล์ที่แก้ (error ที่เหลือล้วน pre-existing ในไฟล์อื่นนอกขอบเขต)

Stage Summary:
- API /api/executive/summary มี field ใหม่: governance { cdeTotal, cdeMeasured, cdeBelow, finTotal, finBelow } (top-level) และทุก group ใน byDomain.groups เพิ่ม cdeTotal/cdeMeasured/cdeBelow/finTotal/finBelow — ธง CDE/การเงินจาก Task 34-a มีผลต่อระบบจริงแล้ว (ความครอบคลุมวัด + นับความเสี่ยงคะแนน < 85)
- แดชบอร์ดผู้บริหาร: สรุป CDE/การเงินรวมใต้ header + ต่อโดเมน (ตัวเลขต่ำกว่าเกณฑ์ไฮไลต์สีเหลืองอำพัน) · รายงาน PDF: คอลัมน์ element ระบุ CDE + ประโยคสรุปความครอบคลุม
- ไม่แตะ: prisma/, src/lib/elements.ts, views.ts, data-domain-console, core-features-console — ไม่มี dependency ใหม่ ไม่ commit ไม่รัน dev server

---
Task ID: 34-a
Agent: Z.ai Code (main session)
Task: v0.20.0 — Meta Data รายละเอียด 4 กลุ่ม (Business/Technical/Operational/Governance) + ธง CDE/การเงิน + workflow อนุมัติ (ตามคำตอบผู้ใช้ 7 ข้อ: กรอกครั้งเดียว/ตกลงแบบข้อเสนอ/operational กรอกมือคู่ค่าจริง/steward เลือก user คนละบทบาท/pii+classification ใช้เดิมแสดงใหม่/workflow จริงสิทธิ์เดิม/ธงเฉพาะที่มีผลจริง)

Work Log:
- กู้คืนสถานะก่อนเริ่ม: พบ sandbox ถูกรีเซ็ต — local main หลงเหลือ v0.15.0 (commit เก่า 549f9ad) ขณะ remote = 0d7c744 (v0.19.0 ครบ) → ตรวจ merge-base แล้ว git reset --hard ไป 0d7c744 + ยืนยัน tag ครบ
- พบฐานข้อมูลว่างหลัง reset (db/custom.db ไม่มีข้อมูล) → bun run db:push + รัน scripts/seed.ts ใหม่ (ครบ: 8 โดเมน 12 element 11 กฎ 168 ผลรัน ผู้ใช้ 10)
- Schema (prisma/schema.prisma): DataElement เพิ่ม stewardId/custodianId (email ผู้ใช้จริง คนละ 1 คนต่อบทบาท), isCde/isFinancial (ธงที่มีผลจริง), opUpdateFrequency (REALTIME|HOURLY|DAILY|WEEKLY|MONTHLY|ON_DEMAND), opNotes, pendingApproval/approvedBy/approvedAt (workflow) — db:push สำเร็จ
- lib/elements.ts: META_GROUPS 4 กลุ่ม + STEWARDSHIP_ROLES + OP_UPDATE_FREQUENCIES/LABELS + ELEMENT_FLAGS (ผลต่อระบบแต่ละธง) + ELEMENT_FLAG_BELOW_THRESHOLD=85 (เกรด < ดี) + ElementItem เพิ่ม isCde/isFinancial/pendingApproval
- API /api/elements: GET คืนธง+สถานะ workflow · POST สร้าง = DRAFT เสมอ (workflow จริง) + ตรวจ owner/steward/custodian ต้องเป็นบัญชี ACTIVE จริง (deny-by-default)
- API /api/elements/[id]: GET คืน stewardship (resolve ชื่อ+บทบาท), operational (ค่าจริง: mapping/asset/rule/datasetCount + รันล่าสุด + คะแนน element ถ่วงแถวจาก rollupByElement + lastRunAt), auditTrail (8 รายการล่าสุดของ element จาก AuditLog target startsWith code) · PATCH เพิ่ม action SUBMIT_APPROVAL (MANAGE_DATASETS) / APPROVE / REJECT_APPROVAL / DEPRECATE (APPROVE_EXCEPTIONS — สิทธิ์เดิมไม่เพิ่ม) + ล็อกแก้ไข/ลบขณะรออนุมัติ + status ไม่รับจากฟอร์ม (workflow เป็นเจ้าของสถานะ)
- UI data-domain-console.tsx (~2,450 บรรทัด): Dialog รายละเอียดเป็น 4 แท็บ — เชิงธุรกิจ (นิยาม/ตัวอย่าง/รหัส/ชื่อ EN/โดเมน/เวลา) · เชิงเทคนิค (ประเภท/รูปแบบ/ค่าอนุญาต/ความยาว + แมปคอลัมน์จริง+editor ย้ายมาไว้แท็บนี้) · เชิงปฏิบัติการ (กรอกมือซ้าย: ความถี่/หมายเหตุ คู่ ค่าจริงจากระบบขวา: แมป/กฎ/ชุดข้อมูล/รันล่าสุด/คะแนน 100.0/100 ถ่วงแถว + กฎที่ผูก) · ธรรมาภิบาล (Owner/Steward/Custodian แสดงชื่อ+บทบาท, PII+การจำแนกใช้ฟิลด์เดิมแสดงใหม่, ธง CDE/การเงิน พร้อมคำอธิบายผล, Workflow card ทุกสถานะ: ส่งขออนุมัติ/เลือกผู้อนุมัติ+เหตุผล→อนุมัติ/ส่งกลับ/เลิกใช้, Audit Trail รายการ) — badge CDE(Star)/การเงิน(Banknote)/รออนุมัติ บนการ์ด+หัว dialog + เตือน "CDE ยังไม่มีกฎ" ในลิสต์
- ฟอร์มสร้าง/แก้ไข: สถานะเป็น chip อ่านอย่างเดียว (เปลี่ยนผ่านแท็บธรรมาภิบาล) + เพิ่ม Steward/Custodian select + Switch CDE/การเงิน (พร้อมคำอธิบายผล) + ความถี่การปรับปรุง + หมายเหตุปฏิบัติการ
- Rule Builder (core-features-console.tsx): element cascade โชว์ CDE/การเงิน/PII/สถานะ + chip meta เพิ่ม badge CDE/การเงิน + เตือน element ร่าง/เลิกใช้ตอนผูกกฎ
- seed.ts: META_ENRICH — รหัสลูกค้า CDE · ยอดเงินคงเหลือ CDE+การเงิน · อัตราซื้อ/ขาย การเงิน + owner/steward/custodian + ความถี่/หมายเหตุ 6 element
- views.ts: APP_VERSION v0.20.0 + desc หน้า Data Domain
- จุดที่แก้ระหว่างทาง: import nextElementCode หายทำ POST 500 (พบจาก dev.log แก้ทันที) · ย้าย useEffect ผู้อนุมัติเริ่มต้นไปหลัง memo approvers (กัน TDZ)
- Task 34-b (subagent ขนาน): executive summary API + แดชบอร์ด + รายงาน — byDomain.groups เพิ่ม cdeTotal/cdeMeasured/cdeBelow/finTotal/finBelow + top-level governance + widget แสดง "CDE วัดแล้ว x/y · ต่ำกว่าเกณฑ์ z" + รายงานประโยคสรุปความครอบคลุม (worklog 34-b แยก)
- E2E API: สร้าง=DRAFT ✓ แก้ตอน DRAFT ✓ SUBMIT→pending ✓ แก้/ลบตอน pending=409 ✓ วิศวกรอนุมัติ=403 (ระบุบทบาทที่ผ่าน) ✓ เจ้าของข้อมูลอนุมัติ→ACTIVE+approvedBy ✓ กำกับดูแล DEPRECATE ✓ Audit Trail 5 รายการครบ ✓ ลบ ✓
- E2E agent-browser: dialog 4 แท็บ + side-by-side + workflow ใน UI (สร้าง→ร่าง→ส่ง→รออนุมัติ→อนุมัติ บันทึกผู้อนุมัติ+เวลา) + stewardship เลือก Radix จริง 3 บทบาท + audit trail แสดง + แดชบอร์ด/รายงานตัวเลขตรงกัน 1/3 (หลัง reload) + mobile 375px NO-OVERFLOW (DQ Dashboard/Data Domain/dialog 2×2 tabs) + footer ติดขอบล่าง (bottom=800=vh) + ไม่มี console error + lint สะอาด
- หมายเหตุ: ข้อความ "1/2 ที่เห็นครั้งแรก" คือ render เก่าช่วงข้อมูลกำลังเปลี่ยน (fresh reload = 1/3 ตรงทั้งคู่) — ไม่ใช่บั๊ก

Stage Summary:
- v0.20.0 ครบโจทย์ผู้ใช้ทั้ง 7 ข้อ: Meta Data กรอกครั้งเดียวระดับ element · 4 กลุ่มครบ · เชิงปฏิบัติการ = กรอกมือคู่ค่าจริง · stewardship 3 บทบาทเลือกจากผู้ใช้จริง · PII/classification ใช้เดิมแสดงในธรรมาภิบาล · workflow อนุมัติจริงบันทึกผู้อนุมัติ+Audit Trail ด้วยสิทธิ์เดิม (MANAGE_DATASETS/APPROVE_EXCEPTIONS) · ธงเฉพาะ CDE/การเงินที่มีผลจริง (แดชบอร์ดนับความครอบคลุม/คะแนนต่ำ<85 + เตือน CDE ไร้กฎ)
- ไฟล์แก้: prisma/schema.prisma · src/lib/elements.ts · src/lib/views.ts · src/app/api/elements/route.ts · src/app/api/elements/[id]/route.ts · src/components/data-domain-console.tsx · src/components/core-features-console.tsx · src/components/dq/executive-{summary route,dashboard,reports} · scripts/seed.ts · worklog.md
- สถานะก่อน push: รอ commit + tag v0.20.0 (ผู้ใช้ให้ PAT ในรอบนี้แล้ว)

---
Task ID: 34-result
Agent: Z.ai Code (main session)
Task: Push v0.20.0 ขึ้น GitHub (main + annotated tag) ด้วย GitHub PAT ที่ผู้ใช้ให้ในรอบนี้

Work Log:
- ใช้ PAT แบบ one-time ผ่าน push URL เท่านั้น (output ผ่าน sed redact token ก่อนแสดง · ไม่บันทึกลง disk / ไม่แตะ .git/config / origin URL ไม่ถูกแตะ)
- ก่อน push: กู้คืน local จาก v0.15.0 → 0d7c744 (v0.19.0) ตาม remote + seed ฐานข้อมูลใหม่ (sandbox ถูกรีเซ็ต)
- commit `c8d1679` (v0.20.0 · 12 ไฟล์ +1,153/−174) + annotated tag `v0.20.0` ชี้ commit เดียวกัน
- `git push <url> main refs/tags/v0.20.0` → สำเร็จ: `0d7c744..c8d1679 main` + `* [new tag] v0.20.0`
- ตรวจ remote ด้วย `git ls-remote` เทียบ SHA: refs/heads/main = c8d1679… ✓ · refs/tags/v0.20.0^{} = c8d1679… ✓ ตรง local ทุกรายการ
- ตรวจ security: `rg "github_pat_"` ทั้ง repo (ยกเว้น dev.log ที่ไม่ถูก track) = ไม่พบ · git config ไม่มี token
- commit docs(worklog) รายการนี้ (Task 34-a/34-b/34-result) แล้ว push ด้วย token เดียวกัน → remote = local 100%
- แจ้งเตือนผู้ใช้: token ถูกวางลงแชต ควร revoke/rotate หลังใช้งาน (ระบบไม่จัดเก็บ token เลย)

Stage Summary:
- GitHub ครบถ้วนถึง v0.20.0: Meta Data 4 กลุ่ม + ธง CDE/การเงินที่มีผลจริง + workflow อนุมัติ (สิทธิ์เดิม + Audit Trail)
- สถานะ sync: remote = local 100% (หลัง push commit เอกสารรายการนี้) — ไม่มี artifact ค้าง local เท่านั้น
- หมายเหตุสถานะระบบ: sandbox ถูกรีเซ็ตระหว่าง session — local git + ฐานข้อมูลถูกกู้คืน/seed ใหม่ก่อนพัฒนา v0.20.0 (ดู Task 34-a)

---

## Task ID: 35
**Agent**: Z.ai Code (main orchestrator)
**Task**: ออกแบบฟีเจอร์ Data Mapping (v0.21.0) — วางแผน/ออกแบบก่อน ยังไม่ implement (รอคำตอบคำถามจากผู้ใช้)

Work Log:
- ผู้ใช้เสนอความต้องการใหม่: เพิ่มกระบวนการ Data Mapping — ระบุ source (data element) และ target (data element) เพื่อ mapping ข้อมูลกัน ระบุว่าเป็นข้อมูลชนิดเดียวกัน
- ตัวอย่างโครงสร้างจากผู้ใช้: Data Domain (Customer) > Sub Data Domain (Customer Identification) > Business Data Element (Customer ID) > Source Mapping (CRM.customer_master.customer_no) / Target Mapping (DWH.dim_customer.customer_id)
- ตรวจสอบสถานะ repo: v0.20.0 (commit c8d1679, tag v0.20.0, worklog 046960d) push สำเร็จ remote=local 100% worktree clean — งานถัดไปคือ v0.21.0
- ศึกษา schema ปัจจุบัน: DataElement (มี status/workflow อนุมัติ/Owner-Steward-Custodian/CDE-Financial), DataElementColumnMapping (element ↔ คอลัมน์จริงใน Data Asset — คนละเรื่องกับ Data Mapping ที่เสนอ), AuditLog, บทบาท 8 แบบ (RBAC deny-by-default)
- ศึกษา UI ปัจจุบัน: Dialog รายละเอียด Data Element มี 4 แท็บ (เชิงธุรกิจ/เชิงเทคนิค/เชิงปฏิบัติการ/ธรรมาภิบาล)
- จัดทำข้อเสนอออกแบบ: โมเดล DataMapping (code MP-####, sourceElementId → targetElementId, mappingType, status workflow, audit fields) + กฎ deny-by-default (ห้ามแมปตัวเอง/ห้ามคู่ซ้ำ) + workflow อนุมัติแบบเดียวกับ v0.20.0 + UI (แท็บใหม่ใน dialog element + หน้ารวม) + ตัวอย่างเส้นทางแสดงผล Domain.SubDomain.Element
- ยื่นคำถามชี้ขาด 7 ข้อให้ผู้ใช้ตอบก่อนเริ่มเขียนโค้ด (ตามวิธีทำงานที่ผู้ใช้กำหนด: ถามก่อนทำ)

Stage Summary:
- ยังไม่มีการแก้โค้ด/schema ใด ๆ — สถานะ repo คงอยู่ที่ v0.20.0
- รอคำตอบ 7 คำถาม: (1) endpoint ต้องเป็น element ในระบบหรือข้อความอิสระ (2) N:N + กันซ้ำย้อนทิศ (3) แมปข้ามโดเมน (4) workflow/สิทธิ์ (5) mappingType (6) UI วางที่ไหน/ต้องการแผนผัง lineage หรือไม่ (7) นโยบายลบ element ที่มี mapping ผูกอยู่
- commit เอกสารรายการนี้เป็น docs (local) — จะ push รวมกับ v0.21.0 เมื่อ implement เสร็จ

---
Task ID: 36-f
Agent: Z.ai Code (frontend agent)
Task: v0.21.0 FRONTEND — ฟีเจอร์ Data Mapping: แท็บ 5 ใน Dialog Data Element + หน้า "การแมปข้อมูล" + แผนผัง Lineage แบบภาพ (backend จบก่อนหน้า ไม่แตะ API/schema เลย)

Work Log:
- อ่าน API contract จริงด้วย curl ก่อนเขียนโค้ด: GET/POST /api/mappings, PATCH /api/mappings/[id], GET /api/mappings/lineage, /api/elements, /api/domains — รูปทรง ExpandedMapping (source/target expanded พร้อม path) ตรงตามสเปกทุก field
- `src/components/data-mapping/types.ts` (ใหม่, 94 บรรทัด) — type ฝั่ง client: MappingElementSummary / ExpandedMapping / LineageEdge / LineageResponse / PickerElement / PickerDomain / OperatorUser (ตรงกับ mappings-server.ts)
- `src/components/data-mapping/lineage-diagram.tsx` (ใหม่, 277 บรรทัด) — LineageDiagram({rootId,nodes,edges,depth,compact}): คอลัมน์จาก BFS relax จาก root (ทิศซ้าย=upstream/ขวา=downstream, หลายขั้นเมื่อ depth≥2) · กล่อง = HTML absolute + เส้นเชื่อม SVG (ไม่เพิ่ม dependency) · สีเส้นตามประเภท (DIRECT emerald-600 / TRANSFORM amber-600 / DERIVED teal-700 / AGGREGATE slate-600 / LOOKUP yellow-600 — ไม่มีน้ำเงิน/indigo) · เส้นทึบ=ACTIVE เส้นประ=ร่าง/เลิกใช้ + ป้ายชื่อประเภทบนเส้น (ไม่พึ่งสีเพียงอย่างเดียว) · root เน้น ring emerald + bg tint · badge PII(amber)/CDE(emerald)/สถานะ element ต่อกล่อง · node เรียงตาม path ให้ผล deterministic · legend 5 ประเภท (โหมดเต็ม) · a11y: role="img" + aria-label "แผนผังที่มา-ปลายทางของ X, N เส้นทาง" + รายการเส้นทางแบบข้อความ sr-only · ครอบ overflow-x-auto + innerW ≥ 720 (compact 560) ให้มือถือ 375px เลื่อนในกรอบตัวเอง
- `src/components/data-mapping/mapping-row.tsx` (ใหม่, 326 บรรทัด) — ใช้ร่วม 2 ที่: MAPPING_STATUS_META (ร่าง/ใช้งาน/เลิกใช้) + MappingStatusBadge (+รออนุมัติ) + MappingTypeBadge (ป้ายจาก MAPPING_TYPES พร้อม title=desc+example) · MappingActions = ปุ่ม workflow deny-by-default (แสดงเมื่อ operatorEmail/approverEmail ว่าง=ไม่แสดง): ส่งขออนุมัติ (DRAFT/DEPRECATED, MANAGE_DATASETS) / อนุมัติ+ส่งกลับ (pending, APPROVE_EXCEPTIONS, ส่งกลับเปิด Dialog เหตุผลไม่บังคับ) / เลิกใช้ (ACTIVE, Dialog เหตุผล) / ลบ (AlertDialog ยืนยัน, ห้ามขณะ pending) → PATCH /api/mappings/[id] + toast ข้อความ/error จาก API + onChanged ให้ parent รีเฟรช · MappingSideRow = แถวในแท็บ element (โชว์ element อีกฝั่ง: ไหลเข้า/ไหลออก, path, transformNote/note, ผู้อนุมัติ+เวลา) · MAPPING_TYPE_OPTIONS
- `src/components/data-mapping/mapping-form.tsx` (ใหม่, 336 บรรทัด) — MappingForm ใช้ร่วมทั้งแท็บ element และหน้ารวม: เลือกผู้ดำเนินการ (เฉพาะ MANAGE_ROLES) · โหมด fixedElement (จาก dialog) มีปุ่มเลือกทิศ เพิ่มต้นทาง/เพิ่มปลายทาง (aria-pressed) + ชิป element ฝั่งตายตัว · โหมดอิสระเป็น cascade 2 ฝั่ง โดเมนหลัก→โดเมนย่อย→element (filter status==='ACTIVE' + ตัด element ที่เลือกอีกฝั่ง/element ปัจจุบันออก) · type select ป้าย+desc+ตัวอย่างจาก MAPPING_TYPES · transformNote โผล่+required เมื่อ MAPPING_TYPES[type].requiresNote · note ไม่บังคับ · submit POST /api/mappings → error จาก API แสดง inline (role=alert) / สำเร็จเรียก onCreated(message)
- `src/components/data-mapping-console.tsx` (ใหม่, 568 บรรทัด) — หน้า "การแมปข้อมูล" (view key data-mapping): การ์ดสถิติ รวม/ACTIVE/รออนุมัติ/เลิกใช้ + ชิปนับรายประเภท 5 ชนิด (กดกรองได้) · ตัวกรอง ค้นหา(code/เส้นทาง/ชื่อ)/สถานะ/ประเภท/โดเมน (match parentDomainId หรือ subDomainId ของ endpoint ใดก็ได้) กรอง client-side จาก GET /api/mappings ครั้งเดียว + ปุ่มรีเฟรช · ตาราง รหัส/เส้นทาง(→)/ประเภท/สถานะ+ผู้อนุมัติ+เวลา/การดำเนินการ (ดูแผนผัง + MappingActions) — shadcn Table ใน overflow wrapper (มือถือเลื่อนแนวนอนในกรอบ) · แผง Lineage: element picker + depth toggle 1/2/3 + LineageDiagram โหมดเต็ม + สรุป nodeCount/edgeCount · Dialog สร้างการแมป (MappingForm) · toolbar operator + approver selects (รูปแบบเดียวกับ data-domain-console: users จาก /api/rbac/users filter ACTIVE, operators=MANAGE_ROLES, approvers=ROLES…permissions includes APPROVE_EXCEPTIONS)
- `src/components/data-domain-console.tsx` (แก้น้อยที่สุด ~130 บรรทัด ไม่แตะ 4 แท็บเดิม) — แท็บ 5 "การแมปข้อมูล" ใน Dialog element: TabsList 4→5 คอลัมน์ + TabsTrigger พร้อม badge นับ · TabsContent: แถบ LineageDiagram compact (fetch lineage depth=2 คู่กัน) · Source Mappings—ข้อมูลที่ไหลเข้า / Target Mappings—ข้อมูลที่ไหลออก (แถว MappingSideRow, ลิสต์ max-h-96 overflow-y-auto) · ปุ่ม "เพิ่มการแมป" → Dialog MappingForm (fixedElement=element ปัจจุบัน, path จาก buildElementPath) · fetch เมื่อเปิด dialog/เปลี่ยน element (useEffect ผูก detailOpen+detail.id) และรีเฟรชหลังสร้าง/ทำ workflow ทุกครั้ง
- `src/lib/views.ts` — เพิ่ม Waypoints icon, view key 'data-mapping' (th การแมปข้อมูล / en Data Mapping) ต่อท้าย asset-domain ใน VIEWS + เพิ่มใน NAV_GROUPS กลุ่ม Data Asset (sidebar เรนเดอร์จาก NAV_GROUPS อัตโนมัติ จึงไม่ต้องแก้ app-sidebar.tsx) + แก้ type guard isConsoleView เป็น `view is CoreViewKey | 'validation-results'` (type-only) เพื่อล้าง TS2367 เดิมใน page.tsx (pre-existing, ยืนยันด้วย git stash ว่าเกิดก่อนแก้)
- `src/app/page.tsx` — import DataMappingConsole + mount ด้วย pattern เดียวกับ DataDomainConsole (hidden/aria-hidden คง mounted)
- E2E API (payload แบบเดียวกับที่ UI ส่ง): POST สร้าง=DRAFT ✓ → SUBMIT_APPROVAL ✓ → APPROVE (ผู้อนุมัติบันทึก) ✓ → DELETE ✓ + ทดสอบ 409 duplicate แสดงข้อความไทย ✓ — ลบของทดสอบออกจนครบ ฐานข้อมูลกลับสู่ seed 4 รายการ (MP-0001..0004)
- E2E agent-browser (1280px + 375px): เมนูใหม่ "การแมปข้อมูล" คลิกได้ · หน้ารวมโหลด 4 รายการ สถิติ/ชิป/ตัวกรองครบ · ดูแผนผัง → lineage 3 คอลัมน์ (CRM.customer_master.customer_no → รหัสลูกค้า → DWH.dim_customer.customer_id) ป้าย Direct บนเส้น + caption ต้นทาง/จุดกึ่งกลาง/ปลายทาง · เลือก element จาก picker ได้ · Dialog สร้าง: cascade โดเมนหลัก→ย่อย→element กรอง ACTIVE, เปลี่ยนประเภท TRANSFORM แล้ว transformNote โผล่+ปุ่มบันทึก disabled จนกรอก, สร้างสำเร็จขึ้นแถวใหม่ทันที · workflow ในตาราง: ส่งขออนุมัติ→ร่าง+รออนุมัติ (ลบ/แก้ถูกซ่อน), อนุมัติ→ใช้งาน+ผู้อนุมัติ+เวลา, ลบผ่าน AlertDialog ✓ · Dialog element แท็บ 5: badge นับ 1, แถบ lineage ย่อ 3 กล่อง, Source (0)/Target (1) ตรง, ฟอร์มเพิ่มมีปุ่มทิศ+ชิป element ตายตัว, ยื่นคู่ซ้ำได้ inline error "มี mapping MP-0001 ของคู่ element นี้อยู่แล้ว" ✓ · mobile 375px: pageOverflow=false, ตาราง (982px) และ lineage เลื่อนในกรอบตัวเอง, ไม่มี element นอก scroll container ที่กว้างเกินจอ ✓ · console error 0
- Quality gates: bun run lint ผ่านสะอาด (0 error/warning) · bunx tsc --noEmit ไฟล์ที่แก้ทั้งหมดไม่มี error (error ที่เหลือเป็น pre-existing ใน exceptions-panel/scorecard/lib/dq.ts นอกขอบเขต ตามที่ Task 34-b บันทึกไว้) · dev.log ไม่มี compile error, GET / 200 · ไม่รัน build ไม่รีสตาร์ทเซิร์ฟเวอร์ · ไม่แตะ prisma schema และไฟล์ API ใด ๆ (ไม่พบบั๊ก backend)

Stage Summary:
- **เวอร์ชัน**: v0.21.0 (frontend ครบ 3 deliverables — backend จากก่อนหน้าเชื่อมต่อได้ทันทีไม่มีการแก้ API)
- **ขอบเขต**: แท็บ 5 "การแมปข้อมูล" ใน Dialog Data Element (compact lineage + ไหลเข้า/ไหลออก + เพิ่ม/อนุมัติ/ส่งกลับ/เลิกใช้/ลบ) · หน้า Data Mapping (สถิติ+ชิปประเภท+4 ตัวกรอง+ตาราง+ฟอร์มสร้าง+แผง Lineage depth 1–3) · LineageDiagram แบบภาพ (SVG+HTML, a11y ครบ, deterministic, เลื่อนในกรอบบนมือถือ) — ฟอร์ม/แถว/ปุ่ม workflow แชร์คอมโพเนนต์เดียวกันทั้ง 2 ที่ (src/components/data-mapping/*)
- **ไฟล์ใหม่**: src/components/data-mapping-console.tsx · src/components/data-mapping/{types.ts, lineage-diagram.tsx, mapping-row.tsx, mapping-form.tsx}
- **ไฟล์แก้**: src/components/data-domain-console.tsx (แท็บ 5) · src/lib/views.ts (view key+nav+type guard) · src/app/page.tsx (mount)
- **สิทธิ์**: deny-by-default ตาม RBAC เดิม — สร้าง/ส่ง/ลบ = MANAGE_DATASETS · อนุมัติ/ส่งกลับ/เลิกใช้ = APPROVE_EXCEPTIONS (ปุ่มไม่แสดงเมื่อไม่มีผู้ดำเนินการที่มีสิทธิ์)
- **สถานะฐานข้อมูล**: seed 4 mappings (MP-0001..0004 ACTIVE) ครบเหมือนก่อนเริ่ม — รายการทดสอบถูกลบหมด (เหลือ AuditLog ของการทดสอบจริง)
- **รอ**: commit + tag v0.21.0 + push (ผู้ใช้ให้ PAT รอบถัดไป)

---

## Task ID: 36-g + 36-result
**Agent**: Z.ai Code (main orchestrator)
**Task**: ตรวจสอบ E2E ด้วย agent-browser + lint + dev.log แล้ว ship v0.21.0 (commit + tag + push)

Work Log:
- lint: `bun run lint` ผ่าน (0 error/warning) · dev.log ไม่มี runtime error ระหว่างทดสอบ
- agent-browser (desktop): หน้า Data Mapping โหลดครบ — stat cards (รวม 4 / ACTIVE 4 / รออนุมัติ 0 / เลิกใช้ 0), chips 5 ประเภท (Direct 2/Transform 1/Lookup 1), ฟิลเตอร์ 4 แบบ + ค้นหา, ตาราง 4 แถวพร้อมปุ่ม
- แผนผัง Lineage (ภาพ): เลือก รหัสลูกค้า → โชว์โซ่ 3 คอลัมน์ customer_no (CRM) → รหัสลูกค้า (CDE, เน้นราก) → customer_id (DWH) พร้อม label "Direct" บนเส้น + legend ครบ 5 ประเภท + เส้นประ=ร่าง/เลิกใช้ · aria-label ครบ ("แผนผังที่มา-ปลายทางของ รหัสลูกค้า, 2 เส้นทาง") + sr-only edge list
- Element dialog แท็บที่ 5 "การแมปข้อมูล 2": Source Mappings (1) MP-0001 + Target Mappings (1) MP-0002 + compact lineage strip + sr-only เส้นทาง · ปุ่ม "ลบ element" disabled อัตโนมัติ (มีกฎ/mapping ผูก)
- Golden path ผ่าน UI: สร้าง mapping ใหม่ (ฟอร์ม deny-by-default ปุ่ม disabled จนเลือกครบ; cascade DWH→dim_customer→cust_type) → MP-0005 ร่าง → ส่งขออนุมัติ → ปุ่มเปลี่ยนเป็น อนุมัติ/ส่งกลับ → อนุมัติ → ใช้งาน (เลิกใช้/ลบ) → ลบ (confirm) สำเร็จ → DB คืนสถานะ seed 4 mappings
- Mobile 375px: pageOverflow=false (375=375) · ตารางย่อยเป็นการ์ด · wrapper overflow-x-auto เลื่อนในตัว (client 349 / scroll 982) · footer หลักถูกดันลงตามเนื้อหา (bottom=2055=bodyH, ไม่ทับเนื้อหา, ไม่มีช่องว่าง)
- Console error = 0 · page error = 0
- ปิดท้าย: commit โค้ด + worklog, สร้าง annotated tag v0.21.0, push main + tag ด้วย PAT ของผู้ใช้ (ไม่บันทึก token ลง disk), ตรวจ remote SHA ตรงกับ local

Stage Summary:
- **v0.21.0 เสร็จสมบูรณ์**: Data Mapping ครบทั้ง backend + frontend ตรงตามคำตอบ 7 ข้อของผู้ใช้
  1) endpoint เป็น element ในระบบเท่านั้น (API ปฏิเสธ 404/409) 2) N:N + ห้ามย้อนทิศซ้ำ (409) 3) ข้ามโดเมนได้ (seed พิสูจน์ CRM→ลูกค้า→DWH)
  4) workflow จริง DRAFT→ส่ง→อนุมัติ/ส่งกลับ/เลิกใช้ + ผู้อนุมัติ + Audit Trail (สิทธิ์เดิม: ส่ง=MANAGE_DATASETS, อนุมัติ=APPROVE_EXCEPTIONS — engineer อนุมัติ=403 ทดสอบแล้ว)
  5) ประเภทจาก research มาตรฐาน: DIRECT/TRANSFORM/DERIVED/AGGREGATE/LOOKUP (DAMA-DMBOK DII + ETL mapping spec) — non-DIRECT บังคับ transformNote
  6) UI 2 จุด + แผนผัง lineage แบบภาพ (BFS multi-hop 1-3 ขั้น) 7) ลบ element ที่มี mapping = 409
- ไฟล์ใหม่: src/lib/mappings.ts, src/lib/mappings-server.ts, src/app/api/mappings/{route.ts,[id]/route.ts,lineage/route.ts}, src/components/data-mapping-console.tsx, src/components/data-mapping/{types,lineage-diagram,mapping-row,mapping-form}.tsx
- แก้ไข: prisma/schema.prisma (DataMapping + relations Restrict), scripts/seed.ts (4 mappings), elements/[id]/route.ts (บล็อกลบ), data-domain-console.tsx (แท็บ 5), views.ts (data-mapping + v0.21.0), page.tsx
- สถานะ sync: ตรวจแล้ว remote = local 100% (main + tag v0.21.0) worktree clean
