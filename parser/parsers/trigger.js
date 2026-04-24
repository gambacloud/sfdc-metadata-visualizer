/**
 * parser/parsers/trigger.js
 * Extracts metadata from Apex Trigger source files.
 */

function parseTrigger(name, code) {
    // trigger Name on Object__c (event1, event2, ...)
    const sig = code.match(/trigger\s+(\w+)\s+on\s+(\w+)\s*\(([^)]+)\)/i);
    const object = sig ? sig[2] : null;
    const events = sig ? sig[3].split(',').map(e => e.trim()) : [];

    // Handler instantiation: new XxxHandler().run()
    const handlerMatches = [...(code.matchAll(/new\s+(\w+Handler)\s*\(\s*\)/g))];
    const handlers = unique(handlerMatches.map(m => m[1]));

    // Direct class calls: ClassName.method(
    const classCallMatches = [...(code.matchAll(/\b([A-Z]\w+)\s*\.\s*\w+\s*\(/g))];
    const classCalls = unique(
        classCallMatches.map(m => m[1]).filter(c => !['System','Database','EventBus','Schema','Test'].includes(c))
    );

    // Explicit Flow invocation: Flow.Interview.FlowName
    const flowInvoke = unique(
        [...(code.matchAll(/Flow\.Interview\.(\w+)/g))].map(m => m[1])
    );

    // Batch: Database.executeBatch(new BatchClass()
    const batches = unique(
        [...(code.matchAll(/Database\.executeBatch\s*\(\s*new\s+(\w+)\s*\(/g))].map(m => m[1])
    );

    // Platform event publish
    const publishes = unique(
        [...(code.matchAll(/EventBus\.publish\s*\([^)]*new\s+(\w+__e)/g))].map(m => m[1])
    );

    return {
        name,
        type:      'Trigger',
        object,
        events,
        handlers,
        classCalls: unique([...handlers, ...classCalls]),
        flowInvoke,
        batches,
        publishes,
    };
}

function unique(arr) { return [...new Set(arr.filter(Boolean))]; }

module.exports = { parseTrigger };
