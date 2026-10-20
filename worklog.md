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
