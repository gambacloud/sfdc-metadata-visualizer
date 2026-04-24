/**
 * Resolves variable names → SObject type names by scanning declaration patterns.
 *
 * Covers:
 *   List<Order__c>           varName
 *   List<Order__c>           varName = new List<...>()
 *   Map<Id, Order__c>        varName
 *   Map<String, Order__c>    varName
 *   Map<Id, List<Order__c>>  varName   (nested)
 *   Set<Order__c>            varName
 *   Order__c[]               varName   (array syntax)
 *   Order__c                 varName   (simple)
 *   for (Order__c rec : ...)           (loop variable)
 */

const SKIP_TYPES = new Set([
    'String','Integer','Decimal','Boolean','Date','DateTime','Id','Long','Double',
    'Blob','Object','SObject','void','null','true','false',
]);

const STANDARD_OBJECTS = new Set([
    'Account','Contact','Lead','Opportunity','Case','Task','Event','User',
    'Product2','Pricebook2','PricebookEntry','Quote','QuoteLine','Contract',
    'Order','OrderItem','Campaign','CampaignMember','Asset','Entitlement',
    'ServiceContract','WorkOrder','WorkOrderLineItem','ReturnOrder',
    'ContentVersion','ContentDocument','Attachment','Note','FeedItem',
    'ApexClass','ApexTrigger','CustomObject',
]);

function looksLikeSObjectType(s) {
    if (!s || SKIP_TYPES.has(s)) return false;
    if (/__[cCeEbBsStTmMdDlLhH]$/.test(s)) return true;  // __c __e __mdt __b __share __history etc.
    return STANDARD_OBJECTS.has(s);
}

function buildVarTypeMap(code) {
    const map = {};

    const register = (varName, typeName) => {
        if (varName && typeName && looksLikeSObjectType(typeName) && !SKIP_TYPES.has(varName)) {
            map[varName] = typeName;
        }
    };

    // ── 1. List<SObject> varName ──────────────────────────────────────────────
    for (const m of code.matchAll(/\bList\s*<\s*([\w]+)\s*>\s+([\w]+)/g)) {
        register(m[2], m[1]);
    }

    // ── 2. Set<SObject> varName ───────────────────────────────────────────────
    for (const m of code.matchAll(/\bSet\s*<\s*([\w]+)\s*>\s+([\w]+)/g)) {
        register(m[2], m[1]);
    }

    // ── 3. Map<*, SObject> varName  (value type is what we care about) ────────
    //    Map<Id, Order__c>           → Order__c
    //    Map<String, Order__c>       → Order__c
    //    Map<Id, List<Order__c>>     → Order__c  (unwrap inner List<>)
    for (const m of code.matchAll(/\bMap\s*<\s*[\w]+\s*,\s*(?:List\s*<\s*)?([\w]+)\s*>?\s*>\s+([\w]+)/g)) {
        register(m[2], m[1]);
    }
    // Simpler Map pattern fallback: Map<*, SObject> varName
    for (const m of code.matchAll(/\bMap\s*<[^>]*,\s*([\w]+__[ceC])\s*>\s+([\w]+)/g)) {
        register(m[2], m[1]);
    }

    // ── 4. SObject[] varName  (array syntax) ──────────────────────────────────
    for (const m of code.matchAll(/\b([\w]+)\s*\[\s*\]\s+([\w]+)/g)) {
        register(m[2], m[1]);
    }

    // ── 5. Simple declaration:  SObject varName [=;] ─────────────────────────
    //    Catches both custom (__c/__e) and standard objects
    const stdPattern = [...STANDARD_OBJECTS].join('|');
    const simpleRe   = new RegExp(`\\b(${stdPattern}|[\\w]+__[ceC])\\s+([\\w]+)\\s*[=;(,]`, 'g');
    for (const m of code.matchAll(simpleRe)) {
        register(m[2], m[1]);
    }

    // ── 6. For-loop variable:  for (SObject rec : collection) ────────────────
    for (const m of code.matchAll(/for\s*\(\s*([\w]+)\s+([\w]+)\s*:/g)) {
        register(m[2], m[1]);
    }

    // ── 7. new SObject() / new List<SObject>() assignments ───────────────────
    //    SomeType varName = new SomeType(...)
    for (const m of code.matchAll(/\b([\w]+)\s+([\w]+)\s*=\s*new\s+\1\s*[({]/g)) {
        register(m[2], m[1]);
    }

    return map;
}

module.exports = { buildVarTypeMap, looksLikeSObjectType, STANDARD_OBJECTS };
