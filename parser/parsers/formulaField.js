/**
 * parser/parsers/formulaField.js
 *
 * Extracts formula fields from Custom Object XML and resolves:
 *   1. Formula expression
 *   2. Same-object field references  →  Status__c
 *   3. Cross-object field references →  Account.Name, Order__r.Status__c
 *      These produce graph edges: ObjectA ──formula──▶ ObjectB
 */

const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser({ ignoreAttributes: false, isArray: () => true });

// Patterns inside formula expressions
// Standard cross-object: Account.Name  /  Order__r.Status__c  /  Parent.CreatedDate
const CROSS_OBJ_RE     = /\b([A-Z][A-Za-z0-9]+(?:__r)?)\.([\w]+)\b/g;
// Merge field syntax: {!Account.Name}
const MERGE_CROSS_RE   = /\{!([A-Z][A-Za-z0-9]+(?:__r)?)\.([\w]+)\}/g;
// Bare field refs (no object prefix) — same object
const BARE_FIELD_RE    = /\b([A-Za-z][A-Za-z0-9_]+__c)\b/g;

// These prefixes are functions/keywords, not object names
const SKIP_PREFIXES = new Set([
    'IF','AND','OR','NOT','ISBLANK','ISNULL','NULLVALUE','TEXT','VALUE','LEN',
    'LEFT','RIGHT','MID','FIND','SUBSTITUTE','TRIM','UPPER','LOWER',
    'TODAY','NOW','DATE','DATEVALUE','DATETIMEVALUE','YEAR','MONTH','DAY',
    'HOUR','MINUTE','SECOND','ADDMONTHS','WEEKDAY',
    'ABS','CEILING','FLOOR','MAX','MIN','MOD','ROUND','SQRT','EXP','LN','LOG',
    'HYPERLINK','IMAGE','INCLUDES','ISPICKVAL','CASE','BEGINS','CONTAINS','REGEX',
    'GETRECORDIDS','PRIORVALUE','ISCHANGED','ISNEW','PARENTGROUPVAL','PREVGROUPVAL',
    'VLOOKUP','BLANKVALUE',
    'TRUE','FALSE','NULL',
]);

function parseFormulaFields(objectName, xml) {
    let doc;
    try { doc = parser.parse(xml); } catch { return []; }
    const obj = doc?.CustomObject?.[0] ?? {};

    const formulaFields = [];

    for (const field of (obj.fields ?? [])) {
        const type    = str(first(field.type));
        if (type !== 'Formula' && type !== 'Summary') continue;

        const fieldName   = str(first(field.fullName));
        const label       = str(first(field.label));
        const returnType  = str(first(field.formulaTreatBlanksAs)) || str(first(field.type));
        const expression  = str(first(field.formula)) || str(first(field.summaryFormula));
        if (!fieldName || !expression) continue;

        const crossObjectRefs = [];  // { objectRef, field }
        const sameObjectRefs  = [];  // field names on the same object

        // Cross-object refs from expression text
        for (const re of [CROSS_OBJ_RE, MERGE_CROSS_RE]) {
            for (const m of expression.matchAll(re)) {
                const objRef = m[1];
                const fld    = m[2];
                if (SKIP_PREFIXES.has(objRef.toUpperCase())) continue;
                crossObjectRefs.push({ objectRef: objRef, field: fld });
            }
        }

        // Same-object refs (bare __c fields)
        for (const m of expression.matchAll(BARE_FIELD_RE)) {
            sameObjectRefs.push(m[1]);
        }

        formulaFields.push({
            fieldName,
            label,
            returnType,
            expression,
            crossObjectRefs: dedup(crossObjectRefs, r => `${r.objectRef}.${r.field}`),
            sameObjectRefs:  [...new Set(sameObjectRefs)],
        });
    }

    return formulaFields;
}

/**
 * Build graph edges from formula field cross-object references.
 * A cross-object reference from ObjectA.FormulaField → ObjectB.Field
 * creates a dependency: ObjectA depends on ObjectB.
 *
 * @param {string} objectName   - API name of the object owning the formula
 * @param {Array}  formulaFields - result of parseFormulaFields()
 * @returns {Array} edges  { from, to, edgeType, viaField, viaFormula }
 */
function buildFormulaEdges(objectName, formulaFields) {
    const edges = [];
    for (const ff of formulaFields) {
        for (const ref of ff.crossObjectRefs) {
            // Normalise relationship name → object name
            // Order__r → Order__c,  Account → Account,  Parent → resolve later
            const targetObject = normaliseRelationship(ref.objectRef);
            if (!targetObject || targetObject === objectName) continue;

            edges.push({
                from:       objectName,
                to:         targetObject,
                edgeType:   'formula-ref',
                viaField:   ff.fieldName,
                viaFormula: ff.expression.slice(0, 80),
                label:      `formula: ${ff.fieldName}`,
            });
        }
    }
    return edges;
}

function normaliseRelationship(ref) {
    // __r → __c
    if (ref.endsWith('__r')) return ref.slice(0, -3) + '__c';
    // Standard known lookups
    const KNOWN = {
        Account:    'Account',
        Contact:    'Contact',
        Lead:       'Lead',
        Opportunity:'Opportunity',
        Case:       'Case',
        User:       'User',
        Parent:     null,  // polymorphic — can't resolve statically
        Owner:      'User',
        CreatedBy:  'User',
        LastModifiedBy: 'User',
    };
    if (ref in KNOWN) return KNOWN[ref];
    // Capitalised word — treat as standard object name
    if (/^[A-Z]/.test(ref)) return ref;
    return null;
}

function str(v)  { return typeof v === 'string' ? v.trim() : (v != null ? String(v).trim() : null); }
function first(v){ return Array.isArray(v) ? v[0] : v; }
function dedup(arr, key) {
    const seen = new Set();
    return arr.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
}

module.exports = { parseFormulaFields, buildFormulaEdges };
