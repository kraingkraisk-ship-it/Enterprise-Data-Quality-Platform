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
