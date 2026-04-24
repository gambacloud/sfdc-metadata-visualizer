/**
 * parser/parsers/flow.js
 * Extracts everything knowable from a Flow XML file.
 */

const { XMLParser } = require('fast-xml-parser');
const { parseFlowFormulas } = require('./flowFormula');

const parser = new XMLParser({ ignoreAttributes: false, isArray: () => true });

function parseFlow(name, xml) {
    let doc;
    try { doc = parser.parse(xml); } catch { return null; }

    const flow = doc?.Flow?.[0] ?? {};

    // ── Basic metadata ────────────────────────────────────────────────────────
    const processType = str(first(flow.processType));
    const label       = str(first(flow.label)) || name;
    const status      = str(first(flow.status));

    // ── Trigger info ──────────────────────────────────────────────────────────
    const start      = first(flow.start);
    const object     = str(start?.object?.[0]) || str(first(flow.object));
    const triggerType= str(start?.triggerType?.[0]) || str(first(flow.triggerType));
    const recTrigType= str(start?.recordTriggerType?.[0]);

    // ── Entry conditions ──────────────────────────────────────────────────────
    const entryFilters = (start?.filters ?? []).map(f => ({
        field:    str(first(f.field)),
        operator: str(first(f.operator)),
        value:    str(first(f.value?.[0]?.stringValue)) || str(first(f.value?.[0]?.numberValue)),
    })).filter(f => f.field);

    // ── Subflows ──────────────────────────────────────────────────────────────
    const subflows = (flow.subflows ?? []).map(s => str(first(s.flowName))).filter(Boolean);

    // ── Action calls (Apex invocable) ─────────────────────────────────────────
    const actionCalls = (flow.actionCalls ?? []).map(a => ({
        name:  str(first(a.actionName)),
        type:  str(first(a.actionType)),
        label: str(first(a.label)),
    })).filter(a => a.name);

    // ── DML ───────────────────────────────────────────────────────────────────
    const dmlObjects = unique([
        ...(flow.recordUpdates ?? []).map(r => str(first(r.object))),
        ...(flow.recordCreates ?? []).map(r => str(first(r.object))),
        ...(flow.recordDeletes ?? []).map(r => str(first(r.object))),
    ]);
    const queryObjects = unique((flow.recordLookups ?? []).map(r => str(first(r.object))));

    // ── Decisions ─────────────────────────────────────────────────────────────
    const decisions = (flow.decisions ?? []).map(d => ({
        name:  str(first(d.name || d.n)),
        label: str(first(d.label)),
        rules: (d.rules ?? []).map(r => str(first(r.label))).filter(Boolean),
    })).filter(d => d.name);

    // ── Variables ─────────────────────────────────────────────────────────────
    const variables = (flow.variables ?? []).map(v => ({
        name:      str(first(v.name || v.n)),
        dataType:  str(first(v.dataType)),
        isInput:   str(first(v.isInput))  === 'true',
        isOutput:  str(first(v.isOutput)) === 'true',
        objectType:str(first(v.objectType)),
    })).filter(v => v.name);

    // ── Formulas ─────────────────────────────────────────────────────────────
    // Feature 1 & 2: formula expressions + field references
    const formulas = parseFlowFormulas(xml, object);

    // Collect field refs from formulas as additional implicit dependencies
    const formulaFieldRefs = unique(
        formulas.flatMap(f => f.fieldRefs.map(r => r.field)).filter(Boolean)
    );

    return {
        name,
        label,
        type:         'Flow',
        processType,
        status,
        object:       object   || null,
        triggerType:  triggerType || null,
        recTrigType:  recTrigType || null,
        entryFilters,
        subflows,
        actionCalls,
        dmlObjects,
        queryObjects,
        decisions,
        variables,
        formulas,          // ← new: full formula list with expressions
        formulaFieldRefs,  // ← new: field names referenced by formulas
    };
}

// ── helpers ───────────────────────────────────────────────────────────────────
function str(v)  { return typeof v === 'string' ? v.trim() : (v != null ? String(v).trim() : null); }
function first(v){ return Array.isArray(v) ? v[0] : v; }
function unique(arr){ return [...new Set(arr.filter(Boolean))]; }

module.exports = { parseFlow };
