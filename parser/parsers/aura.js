/**
 * parser/parsers/aura.js
 * Extracts Apex calls and Flow references from Aura component files.
 */

function parseAuraCmp(componentName, cmp) {
    // <lightning:flow flowApiName="..." or aura:id on flow
    const flowRefs = unique([
        ...(cmp.matchAll(/flowApiName\s*=\s*["']([^"']+)["']/g)),
        ...(cmp.matchAll(/lightning:flow[^>]+flowApiName\s*=\s*["']([^"']+)["']/g)),
    ].map(m => m[1]));

    // Apex controller attribute
    const controller = (cmp.match(/controller\s*=\s*["']([^"']+)["']/i) || [])[1] || null;

    // Child aura components: <c:ComponentName or <namespace:ComponentName
    const childComponents = unique(
        [...(cmp.matchAll(/<[a-z]+:([A-Za-z]\w+)/g))].map(m => m[1])
            .filter(c => !['component','attribute','if','iteration','handler','registerEvent','dependency'].includes(c))
    );

    return { flowRefs, controller, childComponents };
}

function parseAuraController(componentName, js) {
    // apex.js method calls: component.get("c.methodName")
    const apexCalls = unique(
        [...(js.matchAll(/["']c\.([\w]+)['"]/g))].map(m => m[1])
    );

    return { apexCalls };
}

function unique(arr) { return [...new Set(arr.filter(Boolean))]; }

module.exports = { parseAuraCmp, parseAuraController };
