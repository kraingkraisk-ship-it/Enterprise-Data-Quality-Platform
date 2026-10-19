module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[project]/src/lib/db.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "db",
    ()=>db
]);
var __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__ = __turbopack_context__.i("[externals]/@prisma/client [external] (@prisma/client, cjs, [project]/node_modules/@prisma/client)");
;
const globalForPrisma = globalThis;
const db = globalForPrisma.prisma ?? new __TURBOPACK__imported__module__$5b$externals$5d2f40$prisma$2f$client__$5b$external$5d$__$2840$prisma$2f$client$2c$__cjs$2c$__$5b$project$5d2f$node_modules$2f40$prisma$2f$client$29$__["PrismaClient"]({
    log: [
        'query'
    ]
});
if ("TURBOPACK compile-time truthy", 1) globalForPrisma.prisma = db;
}),
"[project]/src/lib/rbac.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * RBAC Configuration — Single Source of Truth
 * บทบาทผู้ใช้และสิทธิ์การเข้าถึงของ Enterprise Data Quality Platform
 * ใช้ร่วมกันทั้ง Backend (API) และ Frontend (RBAC Console)
 */ __turbopack_context__.s([
    "PERMISSION_KEYS",
    ()=>PERMISSION_KEYS,
    "PERMISSION_LABELS",
    ()=>PERMISSION_LABELS,
    "ROLES",
    ()=>ROLES,
    "ROLE_KEYS",
    ()=>ROLE_KEYS,
    "ROLE_LIST",
    ()=>ROLE_LIST,
    "hasPermission",
    ()=>hasPermission,
    "isValidRole",
    ()=>isValidRole
]);
const ROLE_KEYS = [
    'DATA_OWNER',
    'DATA_STEWARD',
    'DQ_ANALYST',
    'DATA_ENGINEER',
    'COMPLIANCE_OFFICER',
    'BUSINESS_USER',
    'EXECUTIVE',
    'SYS_ADMIN'
];
const PERMISSION_KEYS = [
    'VIEW_DATASETS',
    'MANAGE_DATASETS',
    'MANAGE_RULES',
    'RUN_VALIDATION',
    'REVIEW_SIGNALS',
    'APPROVE_EXCEPTIONS',
    'VIEW_DASHBOARDS',
    'MANAGE_USERS'
];
const PERMISSION_LABELS = {
    VIEW_DATASETS: {
        th: 'ดูชุดข้อมูล',
        en: 'View Datasets'
    },
    MANAGE_DATASETS: {
        th: 'จัดการชุดข้อมูล',
        en: 'Manage Datasets'
    },
    MANAGE_RULES: {
        th: 'สร้าง/แก้ไขกฎ',
        en: 'Manage Rules'
    },
    RUN_VALIDATION: {
        th: 'รันการตรวจสอบ',
        en: 'Run Validation'
    },
    REVIEW_SIGNALS: {
        th: 'ทบทวนสัญญาณ AI',
        en: 'Review ML Signals'
    },
    APPROVE_EXCEPTIONS: {
        th: 'อนุมัติข้อยกเว้น',
        en: 'Approve Exceptions'
    },
    VIEW_DASHBOARDS: {
        th: 'ดูแดชบอร์ด',
        en: 'View Dashboards'
    },
    MANAGE_USERS: {
        th: 'จัดการผู้ใช้และสิทธิ์',
        en: 'Manage Users'
    }
};
const ROLES = {
    DATA_OWNER: {
        key: 'DATA_OWNER',
        th: 'เจ้าของข้อมูล',
        en: 'Data Owner',
        desc: 'กำกับนโยบายข้อมูลในความรับผิดชอบและอนุมัติข้อยกเว้นระดับชุดข้อมูล',
        permissions: [
            'VIEW_DATASETS',
            'MANAGE_DATASETS',
            'MANAGE_RULES',
            'RUN_VALIDATION',
            'APPROVE_EXCEPTIONS',
            'VIEW_DASHBOARDS'
        ],
        scope: 'เห็นเฉพาะชุดข้อมูลที่ตนเป็นเจ้าของหรือได้รับมอบสิทธิ์'
    },
    DATA_STEWARD: {
        key: 'DATA_STEWARD',
        th: 'ผู้ดูแลข้อมูล',
        en: 'Data Steward',
        desc: 'ดูแลกฎ คุณภาพข้อมูล และทบทวนสัญญาณ AI ในงานประจำวัน',
        permissions: [
            'VIEW_DATASETS',
            'MANAGE_DATASETS',
            'MANAGE_RULES',
            'RUN_VALIDATION',
            'REVIEW_SIGNALS',
            'VIEW_DASHBOARDS'
        ],
        scope: 'เห็นเฉพาะชุดข้อมูลในโดเมนที่รับผิดชอบ'
    },
    DQ_ANALYST: {
        key: 'DQ_ANALYST',
        th: 'นักวิเคราะห์คุณภาพข้อมูล',
        en: 'Data Quality Analyst',
        desc: 'ทบทวนผลตรวจและสัญญาณ AI วิเคราะห์สาเหตุ และสร้างกฎเพิ่มเติม',
        permissions: [
            'VIEW_DATASETS',
            'MANAGE_RULES',
            'RUN_VALIDATION',
            'REVIEW_SIGNALS',
            'VIEW_DASHBOARDS'
        ],
        scope: 'เห็นเฉพาะชุดข้อมูลที่ได้รับมอบหมายให้วิเคราะห์'
    },
    DATA_ENGINEER: {
        key: 'DATA_ENGINEER',
        th: 'วิศวกรข้อมูล',
        en: 'Data Engineer',
        desc: 'จัดการแหล่งข้อมูล การนำเข้า และประสิทธิภาพของการตรวจสอบ',
        permissions: [
            'VIEW_DATASETS',
            'MANAGE_DATASETS',
            'RUN_VALIDATION',
            'VIEW_DASHBOARDS'
        ],
        scope: 'เห็นเฉพาะชุดข้อมูลที่รับผิดชอบด้านวิศวกรรม'
    },
    COMPLIANCE_OFFICER: {
        key: 'COMPLIANCE_OFFICER',
        th: 'เจ้าหน้าที่กำกับดูแล',
        en: 'Compliance Officer',
        desc: 'ตรวจสอบการปฏิบัติตาม PDPA ทบทวนสัญญาณที่มีความเสี่ยง และอนุมัติร่วม',
        permissions: [
            'VIEW_DATASETS',
            'REVIEW_SIGNALS',
            'APPROVE_EXCEPTIONS',
            'VIEW_DASHBOARDS'
        ],
        scope: 'เห็นชุดข้อมูลที่เกี่ยวข้องกับการกำกับดูแลเท่านั้น'
    },
    BUSINESS_USER: {
        key: 'BUSINESS_USER',
        th: 'ผู้ใช้งานทั่วไป',
        en: 'Business User',
        desc: 'ใช้ชุดข้อมูลที่ผ่านการตรวจสอบแล้วในงานประจำของตน',
        permissions: [
            'VIEW_DATASETS',
            'VIEW_DASHBOARDS'
        ],
        scope: 'เห็นเฉพาะชุดข้อมูลที่อนุมัติให้ใช้งาน (ข้อมูลถูกปิดบัง PII แล้ว)'
    },
    EXECUTIVE: {
        key: 'EXECUTIVE',
        th: 'ผู้บริหาร',
        en: 'Executive',
        desc: 'ติดตามภาพรวมคุณภาพข้อมูลองค์กรและอนุมัติการกำกับดูแลระดับสูง',
        permissions: [
            'VIEW_DATASETS',
            'APPROVE_EXCEPTIONS',
            'VIEW_DASHBOARDS'
        ],
        scope: 'เห็นเฉพาะสรุปภาพรวมและชุดข้อมูลระดับบริหาร'
    },
    SYS_ADMIN: {
        key: 'SYS_ADMIN',
        th: 'ผู้ดูแลระบบ',
        en: 'System Administrator',
        desc: 'จัดการผู้ใช้ บทบาท สิทธิ์การเข้าถึง และการตั้งค่าระบบ',
        permissions: [
            'VIEW_DATASETS',
            'MANAGE_DATASETS',
            'MANAGE_RULES',
            'RUN_VALIDATION',
            'VIEW_DASHBOARDS',
            'MANAGE_USERS'
        ],
        scope: 'จัดการการเข้าถึงทุกชุดข้อมูล (ไม่อนุมัติข้อยกเว้นทางธุรกิจ)'
    }
};
const ROLE_LIST = ROLE_KEYS.map((k)=>ROLES[k]);
function isValidRole(role) {
    return ROLE_KEYS.includes(role);
}
function hasPermission(role, permission) {
    if (!isValidRole(role)) return false;
    return ROLES[role].permissions.includes(permission);
}
}),
"[project]/src/app/api/rbac/users/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rbac.ts [app-route] (ecmascript)");
;
;
;
const ACTOR = 'sys.admin@company.co.th' // demo mode — ยังไม่มีระบบ login
;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
async function GET() {
    try {
        const users = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.findMany({
            orderBy: {
                createdAt: 'asc'
            }
        });
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            users
        });
    } catch (e) {
        console.error('GET /api/rbac/users', e);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้'
        }, {
            status: 500
        });
    }
}
async function POST(req) {
    try {
        const body = await req.json().catch(()=>null);
        if (!body || typeof body !== 'object') {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'รูปแบบข้อมูลไม่ถูกต้อง'
            }, {
                status: 400
            });
        }
        const name = String(body.name ?? '').trim();
        const email = String(body.email ?? '').trim().toLowerCase();
        const role = String(body.role ?? '').trim();
        if (!name || name.length < 2) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'กรุณาระบุชื่อผู้ใช้ (อย่างน้อย 2 ตัวอักษร)'
            }, {
                status: 400
            });
        }
        if (!EMAIL_RE.test(email)) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'รูปแบบอีเมลไม่ถูกต้อง'
            }, {
                status: 400
            });
        }
        if (!(0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["isValidRole"])(role)) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'บทบาทที่เลือกไม่ถูกต้อง'
            }, {
                status: 400
            });
        }
        const exists = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.findUnique({
            where: {
                email
            }
        });
        if (exists) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'อีเมลนี้มีอยู่ในระบบแล้ว'
            }, {
                status: 409
            });
        }
        const user = await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].user.create({
            data: {
                name,
                email,
                role,
                status: 'ACTIVE'
            }
        });
        await __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].auditLog.create({
            data: {
                action: 'CREATE_USER',
                actor: ACTOR,
                target: email,
                detail: `สร้างบัญชีใหม่: ${name} บทบาท ${__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ROLES"][role].th} (${role})`
            }
        });
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            user
        }, {
            status: 201
        });
    } catch (e) {
        console.error('POST /api/rbac/users', e);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'ไม่สามารถสร้างผู้ใช้ได้'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__d5ea15a7._.js.map