/**
 * parser/parsers/customObject.js
 * Extracts metadata from Custom Object and Platform Event XML files.
 */

const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser({ ignoreAttributes: false, isArray: () => true });

function parseCustomObject(name, xml, isPlatformEvent = false) {
    let doc;
    try { doc = parser.parse(xml); } catch { return null; }

    const obj   = doc?.CustomObject?.[0] ?? {};
    const label = str(first(obj.label)) || name;
    const plural = str(first(obj.pluralLabel));

    const fields = (obj.fields ?? []).map(f => ({
        name:     str(first(f.fullName)),
        label:    str(first(f.label)),
        type:     str(first(f.type)),
        ref:      str(first(f.referenceTo)),
    })).filter(f => f.name);

    const relationships = fields
        .filter(f => f.ref)
        .map(f => ({ field: f.name, referenceTo: f.ref, type: f.type }));

    return {
        name,
        label,
        plural,
        type:            isPlatformEvent ? 'PlatformEvent' : 'CustomObject',
        fields,
        relationships,
    };
}

function str(v)  { return typeof v === 'string' ? v.trim() : (v != null ? String(v) : null); }
function first(arr) { return Array.isArray(arr) ? arr[0] : arr; }

module.exports = { parseCustomObject };
