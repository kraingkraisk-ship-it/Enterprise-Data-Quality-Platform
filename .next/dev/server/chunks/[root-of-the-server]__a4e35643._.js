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
"[project]/src/lib/dq.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CONDITIONS",
    ()=>CONDITIONS,
    "CONDITION_KEYS",
    ()=>CONDITION_KEYS,
    "DIMENSION_LABELS",
    ()=>DIMENSION_LABELS,
    "PII_FIELD_HINTS",
    ()=>PII_FIELD_HINTS,
    "PII_UNMASKED_ROLES",
    ()=>PII_UNMASKED_ROLES,
    "SEVERITY_KEYS",
    ()=>SEVERITY_KEYS,
    "SEVERITY_LABELS",
    ()=>SEVERITY_LABELS,
    "buildRuleSentence",
    ()=>buildRuleSentence,
    "canSeePii",
    ()=>canSeePii,
    "evaluateRule",
    ()=>evaluateRule,
    "generateMlSignals",
    ()=>generateMlSignals,
    "isConditionKey",
    ()=>isConditionKey,
    "isSeverityKey",
    ()=>isSeverityKey,
    "maskRowByRole",
    ()=>maskRowByRole,
    "maskValueByRole",
    ()=>maskValueByRole,
    "permitted",
    ()=>permitted,
    "rolesWithPermission",
    ()=>rolesWithPermission
]);
/**
 * DQ Engine — Single Source of Truth ของระบบตรวจสอบคุณภาพข้อมูล
 * - นิยามเงื่อนไข (conditions) ของ Rule Builder + มิติคุณภาพข้อมูลที่เกี่ยวข้อง
 * - ประกอบประโยคกฎมาตรฐาน 5 ส่วน (For / must / using / when / otherwise)
 * - ประเมินกฎกับข้อมูลตัวอย่าง (sandbox rows) — ไม่แตะข้อมูลต้นทางจริงเสมอ
 * - สร้าง "สัญญาณ ML" แบบ deterministic — เป็นเพียงข้อแนะนำ ต้องมีมนุษย์ทบทวนเสมอ
 * - ปิดบัง PII ตามบทบาท (masking by default ตามหลัก PDPA)
 * ใช้ร่วมกันทั้ง Backend (API) และ Frontend (Core Features Console)
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rbac.ts [app-route] (ecmascript)");
;
const DIMENSION_LABELS = {
    COMPLETENESS: {
        th: 'ความสมบูรณ์',
        en: 'Completeness'
    },
    ACCURACY: {
        th: 'ความถูกต้อง',
        en: 'Accuracy'
    },
    VALIDITY: {
        th: 'ความถูกต้องตามรูปแบบ',
        en: 'Validity'
    },
    CONSISTENCY: {
        th: 'ความสอดคล้อง',
        en: 'Consistency'
    },
    UNIQUENESS: {
        th: 'ความไม่ซ้ำซ้อน',
        en: 'Uniqueness'
    },
    TIMELINESS: {
        th: 'ความทันเวลา',
        en: 'Timeliness'
    },
    INTEGRITY: {
        th: 'เอกภาพการอ้างอิง',
        en: 'Integrity Constraints'
    },
    VOLUME: {
        th: 'ปริมาณข้อมูล',
        en: 'Volume / Amount'
    },
    SCHEMA_CONFORMANCE: {
        th: 'การตรงตามโครงสร้าง',
        en: 'Schema Conformance'
    }
};
const CONDITIONS = {
    NOT_NULL: {
        key: 'NOT_NULL',
        th: 'ไม่มีค่าว่าง',
        en: 'Must not be empty',
        sentence: 'not be empty',
        dimension: 'COMPLETENESS',
        params: []
    },
    EMAIL: {
        key: 'EMAIL',
        th: 'รูปแบบอีเมลถูกต้อง',
        en: 'Must be a valid email',
        sentence: 'be a valid email address',
        dimension: 'VALIDITY',
        params: []
    },
    REGEX: {
        key: 'REGEX',
        th: 'ตรงตามรูปแบบที่กำหนด',
        en: 'Must match a pattern',
        sentence: 'match the pattern',
        dimension: 'VALIDITY',
        params: [
            {
                key: 'pattern',
                label: 'รูปแบบ (Regular Expression)',
                type: 'text',
                placeholder: '^0[0-9]{9}$'
            }
        ]
    },
    RANGE: {
        key: 'RANGE',
        th: 'อยู่ในช่วงตัวเลขที่กำหนด',
        en: 'Must be within a range',
        sentence: 'be within the range',
        dimension: 'ACCURACY',
        params: [
            {
                key: 'min',
                label: 'ค่าต่ำสุด',
                type: 'number'
            },
            {
                key: 'max',
                label: 'ค่าสูงสุด',
                type: 'number'
            }
        ]
    },
    IN_LIST: {
        key: 'IN_LIST',
        th: 'อยู่ในรายการค่าที่อนุญาต',
        en: 'Must be one of allowed values',
        sentence: 'be one of the allowed values',
        dimension: 'CONSISTENCY',
        params: [
            {
                key: 'values',
                label: 'ค่าที่อนุญาต (คั่นด้วยเครื่องหมาย ,)',
                type: 'text',
                placeholder: 'ACTIVE, INACTIVE'
            }
        ]
    },
    UNIQUE: {
        key: 'UNIQUE',
        th: 'ไม่ซ้ำกันในชุดข้อมูล',
        en: 'Must be unique',
        sentence: 'be unique across the dataset',
        dimension: 'UNIQUENESS',
        params: []
    },
    MAX_AGE_DAYS: {
        key: 'MAX_AGE_DAYS',
        th: 'ข้อมูลไม่เก่าเกินกี่วัน',
        en: 'Must not be older than N days',
        sentence: 'not be older than',
        dimension: 'TIMELINESS',
        params: [
            {
                key: 'days',
                label: 'จำนวนวันที่ยอมรับได้',
                type: 'number',
                placeholder: '7'
            }
        ]
    }
};
const CONDITION_KEYS = Object.keys(CONDITIONS);
const SEVERITY_LABELS = {
    CRITICAL: {
        th: 'วิกฤต',
        className: 'bg-rose-50 text-rose-800 border-rose-200'
    },
    HIGH: {
        th: 'สูง',
        className: 'bg-orange-50 text-orange-800 border-orange-200'
    },
    MEDIUM: {
        th: 'ปานกลาง',
        className: 'bg-amber-50 text-amber-900 border-amber-200'
    },
    LOW: {
        th: 'ต่ำ',
        className: 'bg-slate-50 text-slate-700 border-slate-200'
    }
};
const SEVERITY_KEYS = [
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW'
];
function isConditionKey(v) {
    return CONDITION_KEYS.includes(v);
}
function isSeverityKey(v) {
    return SEVERITY_KEYS.includes(v);
}
function formatParamValue(condition, params) {
    switch(condition){
        case 'RANGE':
            return `[${String(params.min ?? '?')} – ${String(params.max ?? '?')}]`;
        case 'IN_LIST':
            {
                const raw = String(params.values ?? '');
                return `[${raw}]`;
            }
        case 'MAX_AGE_DAYS':
            return `${String(params.days ?? '?')} days`;
        case 'REGEX':
            return `/${String(params.pattern ?? '')}/`;
        default:
            return '';
    }
}
function buildRuleSentence(rule) {
    const datasetName = rule.datasetName ?? rule.dataset?.name ?? '[Dataset]';
    const cond = isConditionKey(rule.condition) ? CONDITIONS[rule.condition] : null;
    let params = {};
    try {
        params = JSON.parse(rule.parameters || '{}');
    } catch  {
        params = {};
    }
    const usingPart = cond ? formatParamValue(cond.key, params) : '[Parameters]';
    const severityTh = isSeverityKey(rule.severity) ? SEVERITY_LABELS[rule.severity].th : rule.severity;
    let sentence = `For ${datasetName}, ${rule.column} must ${cond?.sentence ?? '[Condition]'}`;
    if (usingPart) sentence += ` using ${usingPart}`;
    if (rule.filter) sentence += ` when ${rule.filter}`;
    sentence += `, otherwise mark as ${severityTh} (${rule.severity})`;
    return sentence;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function valueOf(row, column) {
    return row[column];
}
function evaluateRule(rule, rows) {
    let params = {};
    try {
        params = JSON.parse(rule.parameters || '{}');
    } catch  {
        params = {};
    }
    const failedIndexes = [];
    // สำหรับ UNIQUE — เก็บค่าที่เจอแล้ว
    const seen = new Map();
    rows.forEach((row, idx)=>{
        const value = valueOf(row, rule.column);
        let failed = false;
        switch(rule.condition){
            case 'NOT_NULL':
                failed = value === null || value === undefined || String(value).trim() === '';
                break;
            case 'EMAIL':
                failed = value === null || value === undefined || !EMAIL_RE.test(String(value).trim());
                break;
            case 'REGEX':
                {
                    const pattern = String(params.pattern ?? '');
                    try {
                        const re = new RegExp(pattern);
                        failed = value === null || value === undefined || !re.test(String(value ?? '').trim());
                    } catch  {
                        failed = true; // pattern ไม่ถูกต้องถือว่ากฎพัง — แจ้งเป็น fail เพื่อให้ทบทวน
                    }
                    break;
                }
            case 'RANGE':
                {
                    const min = Number(params.min);
                    const max = Number(params.max);
                    const num = Number(value);
                    failed = value === null || value === undefined || String(value).trim() === '' || Number.isNaN(num) || num < min || num > max;
                    break;
                }
            case 'IN_LIST':
                {
                    const allowed = String(params.values ?? '').split(',').map((s)=>s.trim()).filter(Boolean);
                    failed = value === null || value === undefined || !allowed.includes(String(value).trim());
                    break;
                }
            case 'UNIQUE':
                {
                    const key = String(value ?? '').trim();
                    if (key === '') {
                        failed = true;
                    } else if (seen.has(key)) {
                        failed = true;
                    } else {
                        seen.set(key, idx);
                    }
                    break;
                }
            case 'MAX_AGE_DAYS':
                {
                    const days = Number(params.days);
                    const date = new Date(String(value ?? ''));
                    failed = value === null || value === undefined || String(value).trim() === '' || Number.isNaN(date.getTime()) || Number.isNaN(days) || (Date.now() - date.getTime()) / 86_400_000 > days;
                    break;
                }
            default:
                failed = true;
        }
        if (failed) failedIndexes.push(idx);
    });
    return {
        totalRows: rows.length,
        failedIndexes,
        failedRows: failedIndexes.length
    };
}
/** ตรวจ outlier แบบ IQR — deterministic ทำซ้ำได้ (ใช้แทนโมเดลจริงใน demo) */ function detectNumericOutliers(column, rows) {
    const nums = rows.map((r, i)=>({
            index: i,
            num: Number(r[column])
        })).filter((x)=>!Number.isNaN(x.num) && x.num !== null);
    if (nums.length < 8) return [];
    const values = nums.map((n)=>n.num).sort((a, b)=>a - b);
    const q1 = values[Math.floor(values.length * 0.25)];
    const q3 = values[Math.floor(values.length * 0.75)];
    const iqr = q3 - q1;
    const low = q1 - 1.5 * iqr;
    const high = q3 + 1.5 * iqr;
    return nums.filter((n)=>n.num < low || n.num > high);
}
/** ตรวจ near-duplicate: ค่า text ต่างกันเล็กน้อย (trim + lowercase + ลบช่องว่าง) */ function detectFuzzyDuplicates(column, rows) {
    const groups = new Map();
    rows.forEach((row, idx)=>{
        const v = String(row[column] ?? '').trim().toLowerCase().replace(/\s+/g, '');
        if (!v) return;
        const arr = groups.get(v) ?? [];
        arr.push(idx);
        groups.set(v, arr);
    });
    return [
        ...groups.entries()
    ].filter(([, idxs])=>idxs.length > 1).map(([value, indexes])=>({
            value,
            indexes
        }));
}
function generateMlSignals(rows) {
    const signals = [];
    if (rows.length === 0) return signals;
    const columns = [
        ...new Set(rows.flatMap((r)=>Object.keys(r)))
    ];
    // 1) Schema conformance — คอลัมน์ที่ขาดหายในบางแถว
    for (const col of columns){
        const missing = rows.filter((r)=>!(col in r) || r[col] === undefined).length;
        if (missing > 0 && missing < rows.length) {
            signals.push({
                kind: 'ML_ANOMALY',
                dimension: 'SCHEMA_CONFORMANCE',
                title: `โครงสร้างคอลัมน์ ${col} ไม่คงที่`,
                detail: `พบ ${missing}/${rows.length} แถวที่ไม่มีคอลัมน์ ${col} — อาจเกิด schema drift จากแหล่งข้อมูล (สัญญาณ AI — รอมนุษย์ทบทวน)`,
                severity: 'HIGH'
            });
            break;
        }
    }
    // 2) Numeric outliers (IQR)
    for (const col of columns){
        const outliers = detectNumericOutliers(col, rows);
        if (outliers.length > 0 && outliers.length <= Math.ceil(rows.length * 0.15)) {
            const sample = outliers.slice(0, 3).map((o)=>`แถว #${o.index + 1} = ${o.num}`).join(', ');
            signals.push({
                kind: 'ML_ANOMALY',
                dimension: 'ACCURACY',
                title: `ค่าผิดปกติ (outlier) ในคอลัมน์ ${col}`,
                detail: `โมเดลตรวจพบค่าห่างจากกรอบ IQR ${outliers.length} แถว (${sample}) — โปรดทบทวนก่อนดำเนินการ (สัญญาณ AI ไม่ได้แก้ไขข้อมูล)`,
                severity: 'MEDIUM'
            });
            break;
        }
    }
    // 3) Fuzzy duplicates ในคอลัมน์ text ที่ไม่ใช่ id หลัก
    for (const col of columns){
        if (/^(.*_)?id$/i.test(col)) continue;
        const dups = detectFuzzyDuplicates(col, rows);
        if (dups.length > 0) {
            const d = dups[0];
            signals.push({
                kind: 'ML_ANOMALY',
                dimension: 'UNIQUENESS',
                title: `ระเบียนคล้ายกันมากในคอลัมน์ ${col}`,
                detail: `พบค่า “${d.value}” ซ้ำกัน ${d.indexes.length} แถว (แถว #${d.indexes.map((i)=>i + 1).join(', #')}) — อาจเป็นระเบียนซ้ำ โปรดทบทวน (สัญญาณ AI)`,
                severity: 'MEDIUM'
            });
            break;
        }
    }
    // 4) Volume check — จำนวนแถวผิดปกติ (ต่ำกว่าคาดมากเทียบจำนวนคอลัมน์)
    if (rows.length > 0 && rows.length < columns.length * 2) {
        signals.push({
            kind: 'ML_ANOMALY',
            dimension: 'VOLUME',
            title: 'ปริมาณข้อมูลต่ำกว่าที่คาดหวัง',
            detail: `ชุดข้อมูลมีเพียง ${rows.length} แถว (${columns.length} คอลัมน์) — อาจมีข้อมูลหายระหว่างนำเข้า (สัญญาณ AI — รอมนุษย์ทบทวน)`,
            severity: 'LOW'
        });
    }
    return signals;
}
const PII_UNMASKED_ROLES = [
    'DATA_OWNER',
    'DATA_STEWARD',
    'DQ_ANALYST',
    'COMPLIANCE_OFFICER',
    'SYS_ADMIN'
];
function canSeePii(role) {
    return PII_UNMASKED_ROLES.includes(role);
}
function maskEmail(v) {
    const at = v.indexOf('@');
    if (at <= 0) return '•'.repeat(v.length);
    const name = v.slice(0, at);
    const domain = v.slice(at);
    return `${name.slice(0, 1)}${'•'.repeat(Math.max(name.length - 1, 3))}${domain}`;
}
function maskPhone(v) {
    return v.replace(/[0-9]/g, (d, i)=>i < 3 ? d : '•');
}
function maskName(v) {
    return `${v.slice(0, 1)}${'•'.repeat(Math.max(v.length - 1, 2))}`;
}
const PII_FIELD_HINTS = {
    email: maskEmail,
    phone: maskPhone,
    full_name: maskName,
    name: maskName,
    account_no: ()=>'••••-••••',
    national_id: ()=>'x-xxxx-xxxxx-xx-x'
};
function maskRowByRole(row, role, piiEnabled) {
    const masked = {
        ...row
    };
    if (!piiEnabled || canSeePii(role)) return masked;
    for (const [field, masker] of Object.entries(PII_FIELD_HINTS)){
        if (field in masked && typeof masked[field] === 'string' && masked[field]) {
            masked[field] = masker(String(masked[field]));
        }
    }
    return masked;
}
function maskValueByRole(column, value, role, piiEnabled) {
    const s = value === null || value === undefined ? '' : String(value);
    if (!piiEnabled || s === '' || canSeePii(role)) return s;
    const masker = PII_FIELD_HINTS[column];
    return masker ? masker(s) : s;
}
function permitted(role, permission) {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["hasPermission"])(role, permission);
}
function rolesWithPermission(permission) {
    return __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rbac$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["ROLE_LIST"].filter((r)=>r.permissions.includes(permission)).map((r)=>({
            key: r.key,
            th: r.th,
            en: r.en
        }));
}
}),
"[project]/src/app/api/dq/dashboard/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dq$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/dq.ts [app-route] (ecmascript)");
;
;
;
async function GET() {
    try {
        const [datasets, pendingSignals, pendingExceptions, rulesEnabled] = await Promise.all([
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].dataset.findMany({
                where: {
                    status: 'ACTIVE'
                },
                orderBy: {
                    createdAt: 'asc'
                },
                include: {
                    rules: {
                        where: {
                            enabled: true
                        },
                        include: {
                            runs: {
                                orderBy: {
                                    createdAt: 'desc'
                                },
                                take: 1
                            }
                        }
                    },
                    _count: {
                        select: {
                            signals: {
                                where: {
                                    status: 'PENDING_REVIEW'
                                }
                            }
                        }
                    }
                }
            }),
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].dqSignal.count({
                where: {
                    status: 'PENDING_REVIEW'
                }
            }),
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].dqException.count({
                where: {
                    status: 'PENDING'
                }
            }),
            __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["db"].dqRule.count({
                where: {
                    enabled: true
                }
            })
        ]);
        const dimensionAverages = new Map();
        const perDataset = datasets.map((d)=>{
            const byDimension = new Map();
            let lastRunAt = null;
            for (const rule of d.rules){
                const run = rule.runs[0];
                if (!run) continue;
                if (!lastRunAt || run.createdAt > new Date(lastRunAt)) lastRunAt = run.createdAt.toISOString();
                const arr = byDimension.get(run.dimension) ?? [];
                arr.push(run.passRate * 100);
                byDimension.set(run.dimension, arr);
            }
            const scores = [];
            for (const [k, arr] of byDimension){
                const score = arr.reduce((a, b)=>a + b, 0) / arr.length;
                scores.push({
                    dimension: k,
                    th: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dq$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["DIMENSION_LABELS"][k].th,
                    score
                });
                const globalArr = dimensionAverages.get(k) ?? [];
                globalArr.push(score);
                dimensionAverages.set(k, globalArr);
            }
            const overall = scores.length > 0 ? scores.reduce((a, b)=>a + b.score, 0) / scores.length : null;
            const weakest = scores.length > 0 ? scores.reduce((a, b)=>a.score <= b.score ? a : b) : null;
            return {
                id: d.id,
                name: d.name,
                sourceType: d.sourceType,
                piiEnabled: d.piiEnabled,
                ruleCount: d.rules.length,
                lastRunAt,
                overallScore: overall,
                weakestDimension: weakest ? {
                    th: weakest.th,
                    score: weakest.score
                } : null,
                pendingSignals: d._count.signals,
                dimensionScores: scores.sort((a, b)=>a.score - b.score)
            };
        });
        const dimensions = [
            ...dimensionAverages.entries()
        ].map(([k, arr])=>({
                dimension: k,
                th: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dq$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["DIMENSION_LABELS"][k].th,
                en: __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$dq$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["DIMENSION_LABELS"][k].en,
                score: arr.reduce((a, b)=>a + b, 0) / arr.length
            })).sort((a, b)=>a.score - b.score);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            totals: {
                pendingSignals,
                pendingExceptions,
                rulesEnabled,
                datasetsWithRun: perDataset.filter((d)=>d.lastRunAt).length,
                datasetsTotal: perDataset.length
            },
            perDataset,
            dimensions
        });
    } catch (e) {
        console.error('GET /api/dq/dashboard', e);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'ไม่สามารถโหลดแดชบอร์ดได้'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__a4e35643._.js.map