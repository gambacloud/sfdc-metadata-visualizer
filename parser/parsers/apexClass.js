/**
 * parser/parsers/apexClass.js
 * Extracts metadata from Apex Class source files.
 */

function parseApexClass(name, code) {
    // Class signature
    const sig      = code.match(/public\s+((?:virtual|abstract|with sharing|without sharing)\s+)*class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/i);
    const extendsClass   = sig?.[3] || null;
    const implementsList = sig?.[4]?.split(',').map(s => s.trim()).filter(Boolean) || [];

    // Is it a TriggerHandler subclass?
    const isTriggerHandler = extendsClass === 'TriggerHandler';

    // Which trigger events does it override?
    const overrides = unique([...(code.matchAll(/public\s+override\s+void\s+(beforeInsert|beforeUpdate|beforeDelete|afterInsert|afterUpdate|afterDelete)\s*\(/g))].map(m => m[1]));

    // REST resource
    const restResource = (code.match(/@RestResource\s*\(\s*urlMapping\s*=\s*'([^']+)'\s*\)/i) || [])[1] || null;
    const restMethods  = unique([...(code.matchAll(/@Http(Get|Post|Put|Patch|Delete)/g))].map(m => m[1]));

    // Batch / Queueable / Schedulable
    const isBatch      = /implements\s+[\w,\s]*Database\.Batchable/i.test(code);
    const isQueueable  = /implements\s+[\w,\s]*Queueable/i.test(code);
    const isSchedulable= /implements\s+[\w,\s]*Schedulable/i.test(code);
    const isFuture     = /@future/i.test(code);
    const isInvocable  = /@InvocableMethod/i.test(code);

    // DML statements — which objects?
    const dmlObjects = unique([
        ...(code.matchAll(/(?:insert|update|upsert|delete)\s+([\w.]+)/gi))
    ].map(m => m[1]).filter(s => s !== 'toUpdate' && s !== 'toInsert' && s !== 'toDelete' && /[A-Z]/.test(s[0])));

    // Platform event publish
    const publishes = unique([...(code.matchAll(/EventBus\.publish\s*\([^)]*new\s+(\w+__e)/g))].map(m => m[1]));

    // Explicit Flow invocations
    const flowInvoke = unique([...(code.matchAll(/Flow\.Interview\.(\w+)/g))].map(m => m[1]));

    // Outbound REST callouts
    const callouts = unique([...(code.matchAll(/callout:([\w_]+)\//g))].map(m => m[1]));

    // Batch / Queueable invocations
    const batchCalls    = unique([...(code.matchAll(/Database\.executeBatch\s*\(\s*new\s+(\w+)\s*\(/g))].map(m => m[1]));
    const queueableCalls= unique([...(code.matchAll(/System\.enqueueJob\s*\(\s*new\s+(\w+)\s*\(/g))].map(m => m[1]));

    // Class-level method calls to other Apex classes
    const classCalls = unique([...(code.matchAll(/\b([A-Z][A-Za-z0-9]+)\s*\.\s*\w+\s*\(/g))].map(m => m[1])
        .filter(c => !['System','Database','EventBus','Schema','Test','Flow','Http','JSON','String','List','Map','Set','Date','Math','Trigger'].includes(c)));

    return {
        name,
        type:          'ApexClass',
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
