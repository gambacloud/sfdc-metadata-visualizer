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

    // ── Annotations ───────────────────────────────────────────────────────────
    const restResource  = (code.match(/@RestResource\s*\(\s*urlMapping\s*=\s*['"]([^'"]+)['"]\s*\)/i) || [])[1] || null;
    const restMethods   = unique([...(code.matchAll(/@Http(Get|Post|Put|Patch|Delete)/g))].map(m => m[1]));
    const isBatch       = /implements\s+[\w,\s]*Database\.Batchable/i.test(code);
    const isQueueable   = /implements\s+[\w,\s]*Queueable/i.test(code);
    const isSchedulable = /implements\s+[\w,\s]*Schedulable/i.test(code);
    const isFuture      = /@future/i.test(code);
    const isInvocable   = /@InvocableMethod/i.test(code);

    // ── Variable type map (shared module) ─────────────────────────────────────
    const varTypeMap = buildVarTypeMap(code);

    // ── DML detection — all forms ─────────────────────────────────────────────
    const dmlRaw  = new Set();
    const dmlVerbs = {};

    // Form 1 — statement DML:  insert x / update x / delete x
    for (const verb of DML_VERBS) {
        const re = new RegExp(`\\b${verb}\\s+([\\w\\.\\[]+)`, 'gi');
        let count = 0;
        for (const m of code.matchAll(re)) {
            dmlRaw.add(m[1].trim());
            count++;
        }
        if (count) dmlVerbs[verb] = (dmlVerbs[verb] || 0) + count;
    }

    // Form 2 — Database.* methods (all variants)
    //   Database.insert(x)
    //   Database.insert(x, false)            allOrNone
    //   Database.upsert(x, ExternalId__c)    external ID
    //   Database.insertImmediate(x)          async DML
    //   Database.updateImmediate(x)
    const dbRe = /Database\s*\.\s*(insert|update|upsert|delete|undelete|insertImmediate|updateImmediate)\s*\(\s*([\w\.]+)/gi;
    for (const m of code.matchAll(dbRe)) {
        const verb = m[1].replace(/Immediate$/i, '').toLowerCase();
        dmlRaw.add(m[2].trim());
        dmlVerbs[verb] = (dmlVerbs[verb] || 0) + 1;
    }

    // ── Resolve DML targets to SObject type names ─────────────────────────────
    const dmlObjects = unique(
        [...dmlRaw].map(raw => {
            if (looksLikeSObjectType(raw)) return raw;
            const base = raw.split('.')[0];
            return varTypeMap[base] || null;
        }).filter(looksLikeSObjectType)
    );

    // ── Platform event publish ────────────────────────────────────────────────
    const publishes = unique([
        // EventBus.publish(new X__e(...))
        ...[...(code.matchAll(/EventBus\s*\.\s*publish\s*\(\s*new\s+([\w]+__e)/g))].map(m => m[1]),
        // EventBus.publish(listVar) — where listVar is List<X__e>
        ...[...(code.matchAll(/EventBus\s*\.\s*publish\s*\(\s*([\w]+)/g))].map(m => varTypeMap[m[1]] || null),
        // new X__e(...) instantiation anywhere
        ...[...(code.matchAll(/new\s+([\w]+__e)\s*[({]/g))].map(m => m[1]),
    ].filter(Boolean));

    // ── Explicit Flow invocations ─────────────────────────────────────────────
    const flowInvoke = unique(
        [...(code.matchAll(/Flow\s*\.\s*Interview\s*\.\s*(\w+)/g))].map(m => m[1])
    );

    // ── Outbound REST callouts ────────────────────────────────────────────────
    const callouts = unique(
        [...(code.matchAll(/callout:([\w_]+)\//g))].map(m => m[1])
    );

    // ── Async invocations ─────────────────────────────────────────────────────
    const batchCalls = unique(
        [...(code.matchAll(/Database\s*\.\s*executeBatch\s*\(\s*new\s+(\w+)\s*[,(]/g))].map(m => m[1])
    );
    const queueableCalls = unique(
        [...(code.matchAll(/System\s*\.\s*enqueueJob\s*\(\s*new\s+(\w+)\s*[,(]/g))].map(m => m[1])
    );

    // ── Class-level calls to other Apex classes ───────────────────────────────
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
        dmlObjects,
        dmlVerbs,
        publishes,
        flowInvoke,
        callouts,
        batchCalls,
        queueableCalls,
        classCalls,
    };
}

function unique(arr) { return [...new Set(arr.filter(Boolean))]; }

module.exports = { parseApexClass };
