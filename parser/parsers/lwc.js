/**
 * parser/parsers/lwc.js
 * Extracts Apex imports and Flow references from LWC files.
 */

function parseLwcJs(componentName, js) {
    // @salesforce/apex/ClassName.methodName
    const apexImports = unique(
        [...(js.matchAll(/from\s+['"]@salesforce\/apex\/([\w.]+)['"]/g))].map(m => {
            const parts = m[1].split('.');
            return { class: parts[0], method: parts[1] || null };
        })
    );

    // NavigationMixin usage
    const usesNavigation = /NavigationMixin/i.test(js);

    // Flow invocations via Flow.Interview
    const flowInvoke = unique([...(js.matchAll(/Flow\.Interview\.(\w+)/g))].map(m => m[1]));

    return { apexImports, usesNavigation, flowInvoke };
}

function parseLwcHtml(componentName, html) {
    // <lightning-flow flow-api-name="FlowName">
    const flowRefs = unique(
        [...(html.matchAll(/flow-api-name\s*=\s*["']([^"']+)["']/g))].map(m => m[1])
    );

    // c-component-name references (child LWC)
    const childComponents = unique(
        [...(html.matchAll(/<c-([\w-]+)/g))].map(m => kebabToCamel(m[1]))
    );

    return { flowRefs, childComponents };
}

function kebabToCamel(str) {
    return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function unique(arr) {
    const seen = new Set();
    return arr.filter(a => {
        const key = JSON.stringify(a);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

module.exports = { parseLwcJs, parseLwcHtml };
