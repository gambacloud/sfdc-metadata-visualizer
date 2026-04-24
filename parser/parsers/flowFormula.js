/**
 * parser/parsers/flowFormula.js
 *
 * Extracts formula elements from Flow XML and resolves:
 *   1. Formula name + expression
 *   2. Field references within expressions  {!Record.FieldName__c}
 *   3. Which decisions depend on each formula
 */

const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser({ ignoreAttributes: false, isArray: () => true });

// Match {!Record.Field__c} or {!varName} references in flow expressions
const REF_RE = /\{!([\w]+)\.([\w]+)\}/g;
const VAR_RE = /\{!([\w]+)\}/g;

function parseFlowFormulas(xml, flowObject) {
    let doc;
    try { doc = parser.parse(xml); } catch { return []; }
    const flow = doc?.Flow?.[0] ?? {};

    const formulas = (flow.formulas ?? []).map(f => {
        const name       = str(first(f.name || f.n));
        const dataType   = str(first(f.dataType));
        const expression = str(first(f.expression));
        if (!name || !expression) return null;

        // Resolve field references: {!Record.Status__c} → { object: flowObject, field: 'Status__c' }
        const fieldRefs = [];
        for (const m of expression.matchAll(REF_RE)) {
            fieldRefs.push({ prefix: m[1], field: m[2] });
        }

        // Resolve plain variable references: {!myVar}
        const varRefs = [];
        for (const m of expression.matchAll(VAR_RE)) {
            varRefs.push(m[1]);
        }

        return { name, dataType, expression, fieldRefs, varRefs };
    }).filter(Boolean);

    // Map which decisions use which formula
    const decisions = (flow.decisions ?? []).map(d => {
        const dName = str(first(d.name || d.n));
        const rules  = (d.rules ?? []).map(r => {
            const conditions = (r.conditions ?? []).map(c => {
                const lv = str(first(c.leftValueReference));
                return lv;
            }).filter(Boolean);
            return conditions;
        }).flat();
        return { decision: dName, usesFormulas: rules };
    });

    // Link each formula to decisions that reference it
    formulas.forEach(f => {
        f.usedInDecisions = decisions
            .filter(d => d.usesFormulas.some(ref => ref.includes(f.name)))
            .map(d => d.decision);
    });

    return formulas;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function str(v)  { return typeof v === 'string' ? v.trim() : (v != null ? String(v).trim() : null); }
function first(v){ return Array.isArray(v) ? v[0] : v; }

module.exports = { parseFlowFormulas };
