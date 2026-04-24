/**
 * parser/parsers/customObject.js
 * Extracts metadata from Custom Object and Platform Event XML files.
 * Now includes formula field expressions and cross-object references.
 */

const { XMLParser } = require('fast-xml-parser');
const { parseFormulaFields, buildFormulaEdges } = require('./formulaField');

const parser = new XMLParser({ ignoreAttributes: false, isArray: () => true });

function parseCustomObject(name, xml, isPlatformEvent = false) {
    let doc;
    try { doc = parser.parse(xml); } catch { return null; }

    const obj    = doc?.CustomObject?.[0] ?? {};
    const label  = str(first(obj.label))      || name;
    const plural = str(first(obj.pluralLabel));

    // ── All fields ────────────────────────────────────────────────────────────
    const fields = (obj.fields ?? []).map(f => ({
        name:         str(first(f.fullName)),
        label:        str(first(f.label)),
        type:         str(first(f.type)),
        ref:          str(first(f.referenceTo)),
        formula:      str(first(f.formula))        || null,
        summaryFormula: str(first(f.summaryFormula)) || null,
        returnType:   str(first(f.formulaTreatBlanksAs)) || null,
    })).filter(f => f.name);

    // ── Lookup / Master-Detail relationships ──────────────────────────────────
    const relationships = fields
        .filter(f => f.ref)
        .map(f => ({ field: f.name, referenceTo: f.ref, type: f.type }));

    // ── Feature 3 & 4: Formula field expressions + same-object refs ───────────
    const formulaFields = parseFormulaFields(name, xml);

    // ── Feature 5: Cross-object formula → graph edges ─────────────────────────
    const formulaEdges = buildFormulaEdges(name, formulaFields);

    return {
        name,
        label,
        plural,
        type:         isPlatformEvent ? 'PlatformEvent' : 'CustomObject',
        fields,
        relationships,
        formulaFields,   // ← new: full formula field list with expressions
        formulaEdges,    // ← new: cross-object dependency edges
    };
}

function str(v)  { return typeof v === 'string' ? v.trim() : (v != null ? String(v).trim() : null); }
function first(v){ return Array.isArray(v) ? v[0] : v; }

module.exports = { parseCustomObject };
