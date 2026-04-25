/**
 * parser/parsers/apexClass.js
 * Extracts metadata from Apex Class source files.
 */

const { buildVarTypeMap, looksLikeSObjectType } = require('./varTypeMap');

const DML_VERBS = ['insert', 'update', 'upsert', 'delete', 'undelete'];

const SKIP_CLASSES = new Set([
    'System','Database','EventBus','Schema','Test','Flow','Http','HttpRequest',
    'HttpResponse','JSON','String','List','Map','Set','Date','Math','Trigger',
    'Limits','UserInfo','ApexPages','PageReference','Type','Blob','EncodingUtil',
    'Integer','Decimal','Boolean','Long','Double','DateTime','ID',
]);

function parseApexClass(name, code) {

    // ── Class signature ───────────────────────────────────────────────────────
    const sig = code.match(
        /public\s+((?:virtual|abstract|with\s+sharing|without\s+sharing|inherited\s+sharing)\s+)*class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/i
    );
    const extendsClass    = sig?.[3] || null;
    const implementsList  = sig?.[4]?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const isTriggerHandler = extendsClass === 'TriggerHandler';

    // ── Overridden trigger event methods ──────────────────────────────────────
    const overrides = unique(
        [...(code.matchAll(/public\s+override\s+void\s+(beforeInsert|beforeUpdate|beforeDelete|afterInsert|afterUpdate|afterDelete)\s*\(/g))]
            .map(m => m[1])
    );

    // ── Annotations & sharing model ───────────────────────────────────────────
    const restResource     = (code.match(/@RestResource\s*\(\s*urlMapping\s*=\s*['"]([^'"]+)['"]\s*\)/i) || [])[1] || null;
    const restMethods      = unique([...(code.matchAll(/@Http(Get|Post|Put|Patch|Delete)/g))].map(m => m[1]));
    const isBatch          = /implements\s+[\w,\s]*Database\.Batchable/i.test(code);
    const isQueueable      = /implements\s+[\w,\s]*Queueable/i.test(code);
    const isSchedulable    = /implements\s+[\w,\s]*Schedulable/i.test(code);
    const isFuture         = /@future/i.test(code);
    const isInvocable      = /@InvocableMethod/i.test(code);
    const withoutSharing   = /without\s+sharing/i.test(code);
    const withSharing      = /\bwith\s+sharing/i.test(code);
    const inheritedSharing = /inherited\s+sharing/i.test(code);

    // ── Code quality patterns ──────────────────────────────────────────────────
    // DML inside for/while loop — governor limit bomb
    const dmlInLoop = detectDmlInLoop(code);

    // SOQL inside for/while loop
    const soqlInLoop = /for\s*\([^)]*\)\s*\{[^}]*\[SELECT/i.test(code) ||
                       /while\s*\([^)]*\)\s*\{[^}]*\[SELECT/i.test(code);

    // Test isolation violations
    const hasTestVisible   = /@TestVisible/i.test(code);
    const hasTestRunning   = /Test\.isRunningTest\s*\(\s*\)/i.test(code);

    // Database.insert with allOrNone=false (silent failures)
    const silentDml = /Database\s*\.\s*(?:insert|update|upsert|delete)\s*\([^,)]+,\s*false\s*\)/i.test(code);

    // Debug log density
    const debugCount = (code.match(/System\s*\.\s*debug\s*\(/g) || []).length;

    // ── Variable type map ─────────────────────────────────────────────────────
    const varTypeMap = buildVarTypeMap(code);

    // ── DML detection — all forms ─────────────────────────────────────────────
    const dmlRaw   = new Set();
    const dmlVerbs = {};

    for (const verb of DML_VERBS) {
        const re = new RegExp(`\\b${verb}\\s+([\\w\\.\\[]+)`, 'gi');
        let count = 0;
        for (const m of code.matchAll(re)) { dmlRaw.add(m[1].trim()); count++; }
        if (count) dmlVerbs[verb] = (dmlVerbs[verb] || 0) + count;
    }

    const dbRe = /Database\s*\.\s*(insert|update|upsert|delete|undelete|insertImmediate|updateImmediate)\s*\(\s*([\w\.]+)/gi;
    for (const m of code.matchAll(dbRe)) {
        const verb = m[1].replace(/Immediate$/i, '').toLowerCase();
        dmlRaw.add(m[2].trim());
        dmlVerbs[verb] = (dmlVerbs[verb] || 0) + 1;
    }

    const dmlObjects = unique(
        [...dmlRaw].map(raw => {
            if (looksLikeSObjectType(raw)) return raw;
            return varTypeMap[raw.split('.')[0]] || null;
        }).filter(looksLikeSObjectType)
    );

    // ── Platform events ────────────────────────────────────────────────────────
    const publishes = unique([
        ...[...(code.matchAll(/EventBus\s*\.\s*publish\s*\(\s*new\s+([\w]+__e)/g))].map(m => m[1]),
        ...[...(code.matchAll(/EventBus\s*\.\s*publish\s*\(\s*([\w]+)/g))].map(m => varTypeMap[m[1]] || null),
        ...[...(code.matchAll(/new\s+([\w]+__e)\s*[({]/g))].map(m => m[1]),
    ].filter(Boolean));

    // ── Flow / async invocations ───────────────────────────────────────────────
    const flowInvoke     = unique([...(code.matchAll(/Flow\s*\.\s*Interview\s*\.\s*(\w+)/g))].map(m => m[1]));
    const callouts       = unique([...(code.matchAll(/callout:([\w_]+)\//g))].map(m => m[1]));
    const batchCalls     = unique([...(code.matchAll(/Database\s*\.\s*executeBatch\s*\(\s*new\s+(\w+)\s*[,(]/g))].map(m => m[1]));
    const queueableCalls = unique([...(code.matchAll(/System\s*\.\s*enqueueJob\s*\(\s*new\s+(\w+)\s*[,(]/g))].map(m => m[1]));

    // ── Class-level calls ──────────────────────────────────────────────────────
    const classCalls = unique(
        [...(code.matchAll(/\b([A-Z][A-Za-z0-9]+)\s*\.\s*\w+\s*\(/g))]
            .map(m => m[1])
            .filter(c => !SKIP_CLASSES.has(c))
    );

    return {
        name,
        type:            'ApexClass',
        extendsClass,
        implementsList,
        isTriggerHandler,
        overrides,
        restResource,
        restMethods,
        isBatch,
        isQueueable,
        isSchedulable,
        isFuture,
        isInvocable,
        // sharing model
        withoutSharing,
        withSharing,
        inheritedSharing,
        // code quality
        dmlInLoop,
        soqlInLoop,
        hasTestVisible,
        hasTestRunning,
        silentDml,
        debugCount,
        // DML
        dmlObjects,
        dmlVerbs,
        // comms
        publishes,
        flowInvoke,
        callouts,
        // async
        batchCalls,
        queueableCalls,
        classCalls,
    };
}

// ── DML in loop detection ──────────────────────────────────────────────────────
// Looks for DML verbs that appear inside a for/while block.
// Heuristic — not a full AST — but catches the most common patterns.
function detectDmlInLoop(code) {
    const DML_PATTERN = /\b(insert|update|upsert|delete|undelete|Database\s*\.\s*(?:insert|update|upsert|delete))\s*[\w(]/i;

    // Find for/while loops and check if DML appears in the next ~500 chars
    const loopRe = /\b(for|while)\s*\([^)]*\)\s*\{/gi;
    for (const m of code.matchAll(loopRe)) {
        const body = code.slice(m.index + m[0].length, m.index + m[0].length + 500);
        if (DML_PATTERN.test(body)) return true;
    }
    return false;
}

function unique(arr) { return [...new Set(arr.filter(Boolean))]; }

module.exports = { parseApexClass };
