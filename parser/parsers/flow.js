/**
 * parser/parsers/flow.js
 * Extracts everything knowable from a Flow XML file.
 */

const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({ ignoreAttributes: false, isArray: () => true });

function parseFlow(name, xml) {
    let doc;
    try { doc = parser.parse(xml); } catch { return null; }

    const flow = doc?.Flow?.[0] ?? {};

    // processType / label
    const processType  = str(flow.processType);
    const label        = str(flow.label) || name;
    const status       = str(flow.status);

    // Trigger info — can live in <start> or top-level
    const start        = first(flow.start);
    const object       = str(start?.object) || str(flow.object);
    const triggerType  = str(start?.triggerType)  || str(flow.triggerType);
    const recTrigType  = str(start?.recordTriggerType);

    // Entry conditions (filter fields on start)
    const entryFilters = (start?.filters ?? []).map(f => ({
        field:    str(f.field),
        operator: str(f.operator),
        value:    str(f.value?.stringValue) || str(f.value?.numberValue),
    })).filter(f => f.field);

    // Subflows
    const subflows = (flow.subflows ?? []).map(s => str(s.flowName)).filter(Boolean);

    // Action calls (Apex invocable actions)
    const actionCalls = (flow.actionCalls ?? []).map(a => ({
        name:       str(a.actionName),
        type:       str(a.actionType),
        label:      str(a.label),
    })).filter(a => a.name);

    // DML — objects this flow reads/writes
    const recordUpdates = collect(flow, 'recordUpdates');
    const recordCreates = collect(flow, 'recordCreates');
    const recordDeletes = collect(flow, 'recordDeletes');
    const recordLookups = collect(flow, 'recordLookups');

    const dmlObjects = unique([
        ...recordUpdates.map(r => str(r.object)),
        ...recordCreates.map(r => str(r.object)),
        ...recordDeletes.map(r => str(r.object)),
    ]);
    const queryObjects = unique(recordLookups.map(r => str(r.object)));

    // Decisions — extract for future branching display
    const decisions = (flow.decisions ?? []).map(d => ({
        name:  str(d.name || d.n),
        label: str(d.label),
        rules: (d.rules ?? []).map(r => str(r.label)).filter(Boolean),
    })).filter(d => d.name);

    return {
        name,
        label,
        type:          'Flow',
        processType,
        status,
        object:        object || null,
        triggerType:   triggerType || null,
        recTrigType:   recTrigType || null,
        entryFilters,
        subflows,
        actionCalls,
        dmlObjects,
        queryObjects,
        decisions,
    };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function str(v) { return typeof v === 'string' ? v.trim() : (v != null ? String(v) : null); }
function first(arr) { return Array.isArray(arr) ? arr[0] : arr; }
function collect(obj, key) { return Array.isArray(obj[key]) ? obj[key] : []; }
function unique(arr) { return [...new Set(arr.filter(Boolean))]; }

module.exports = { parseFlow };
