/**
 * parser/export.js
 * Generates targeted analysis exports from index.json.
 *
 * Usage:
 *   node export.js --index ../data/index.json --out ../data/exports/
 *
 * Outputs:
 *   concerns.csv        — static analysis findings with severity
 *   chains.csv          — flattened execution chains per object+event
 *   dml_map.csv         — who writes what, and what it triggers
 *   coverage_gaps.csv   — Apex classes with no matching test class
 *   prompt_template.txt — ready-to-paste LLM prompt
 */

const fs   = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const argv = yargs(hideBin(process.argv))
    .option('index', { type: 'string', default: path.join(__dirname, '../data/index.json') })
    .option('out',   { type: 'string', default: path.join(__dirname, '../data/exports') })
    .argv;

const indexPath = path.resolve(argv.index);
const outDir    = path.resolve(argv.out);

if (!fs.existsSync(indexPath)) {
    console.error(`❌  index.json not found: ${indexPath}`);
    console.error('    Run: node parser/index.js --zip <your-metadata.zip> first');
    process.exit(1);
}

console.log(`\n📂  Reading: ${indexPath}`);
const { nodes, edges, meta } = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

fs.mkdirSync(outDir, { recursive: true });
console.log(`📁  Output:  ${outDir}\n`);

// ── Shared indexes ─────────────────────────────────────────────────────────────
const byName  = Object.fromEntries(nodes.map(n => [n.name, n]));
const edgeMap = {};
edges.forEach(e => {
    if (!edgeMap[e.from]) edgeMap[e.from] = { out: [], in: [] };
    if (!edgeMap[e.to])   edgeMap[e.to]   = { out: [], in: [] };
    edgeMap[e.from].out.push(e);
    edgeMap[e.to].in.push(e);
});

const totalEdges = n => (edgeMap[n.name]?.out.length || 0) + (edgeMap[n.name]?.in.length || 0);

// ── 1. concerns.csv ────────────────────────────────────────────────────────────
console.log('  [1/4] Generating concerns.csv...');

const concerns = [];

const addConcern = (severity, category, node, nodeType, detail, recommendation) => {
    concerns.push({ severity, category, node, nodeType, detail, recommendation });
};

nodes.forEach(n => {
    const edges_in  = edgeMap[n.name]?.in.length  || 0;
    const edges_out = edgeMap[n.name]?.out.length || 0;
    const total     = edges_in + edges_out;

    // ── God class / hub node ─────────────────────────────────────────────────
    if (total >= 10) {
        addConcern('HIGH', 'Architecture',
            n.name, n.type,
            `${total} total edges (${edges_out} out, ${edges_in} in) — extremely high connectivity`,
            'Consider splitting responsibilities. High connectivity = high change risk.'
        );
    } else if (total >= 6) {
        addConcern('MEDIUM', 'Architecture',
            n.name, n.type,
            `${total} total edges — high connectivity`,
            'Review single responsibility. May be doing too much.'
        );
    }

    // ── Inferred DML chains (recursion risk) ──────────────────────────────────
    const inferredOut = edgeMap[n.name]?.out.filter(e => e.inferred) || [];
    if (inferredOut.length > 0) {
        const targets = inferredOut.map(e => `${e.to} (via ${e.viaObject})`).join('; ');
        addConcern('HIGH', 'Recursion Risk',
            n.name, n.type,
            `DML triggers downstream automation: ${targets}`,
            'Verify recursion guard. Use static boolean flags to prevent re-entry.'
        );
    }

    // ── Apex class specifics ──────────────────────────────────────────────────
    if (n.type === 'ApexClass') {

        if (n.isFuture && edgeMap[n.name]?.in.some(e => byName[e.from]?.type === 'Trigger')) {
            addConcern('MEDIUM', 'Governor Limits',
                n.name, n.type,
                '@future method called directly from trigger context',
                'Ensure @future is not called in loops. Max 50 @future calls per transaction.'
            );
        }

        if (n.isBatch && edgeMap[n.name]?.in.some(e => byName[e.from]?.type === 'Trigger')) {
            addConcern('MEDIUM', 'Governor Limits',
                n.name, n.type,
                'Batch job initiated from trigger context',
                'Max 5 executeBatch calls per transaction. Avoid in loops.'
            );
        }

        if (n.isQueueable && edgeMap[n.name]?.in.some(e => byName[e.from]?.type === 'Trigger')) {
            addConcern('LOW', 'Governor Limits',
                n.name, n.type,
                'Queueable initiated from trigger context',
                'Only 1 enqueueJob call allowed per transaction from triggers.'
            );
        }

        if (n.callouts?.length > 0) {
            addConcern('MEDIUM', 'Integration',
                n.name, n.type,
                `Makes ${n.callouts.length} outbound callout(s): ${n.callouts.join(', ')}`,
                'Callouts cannot be made after DML in same transaction without @future or Queueable.'
            );
        }

        if (n.dmlObjects?.length >= 3) {
            addConcern('MEDIUM', 'Data Integrity',
                n.name, n.type,
                `Writes to ${n.dmlObjects.length} different objects: ${n.dmlObjects.join(', ')}`,
                'Multiple DML targets increase transaction complexity and rollback risk.'
            );
        }

        if (n.withoutSharing) {
            addConcern('MEDIUM', 'Security',
                n.name, n.type,
                'Declared without sharing — bypasses record-level security',
                'Verify this is intentional. Consider inherited sharing where possible.'
            );
        }

        if (n.dmlInLoop) {
            addConcern('HIGH', 'Governor Limits',
                n.name, n.type,
                'DML operation detected inside a for/while loop',
                'Bulkify: collect records first, then DML outside the loop. This will hit limits in bulk operations.'
            );
        }

        if (n.soqlInLoop) {
            addConcern('HIGH', 'Governor Limits',
                n.name, n.type,
                'SOQL query detected inside a for/while loop',
                'Bulkify: query outside the loop, store in a Map, then iterate the Map.'
            );
        }

        if (n.silentDml) {
            addConcern('MEDIUM', 'Data Integrity',
                n.name, n.type,
                'Uses Database.insert/update/delete with allOrNone=false — failures silently ignored',
                'Ensure SaveResult/DeleteResult errors are explicitly checked and handled.'
            );
        }

        if (n.debugCount >= 10) {
            addConcern('LOW', 'Hygiene',
                n.name, n.type,
                `${n.debugCount} System.debug calls — log pollution in production`,
                'Remove or guard debug statements with a custom logging framework.'
            );
        }
    }

    // ── Flow specifics ────────────────────────────────────────────────────────
    if (n.type === 'Flow') {
        if (n.triggerType && n.entryFilters?.length === 0 && n.status === 'Active') {
            addConcern('MEDIUM', 'Performance',
                n.name, n.type,
                'Record-triggered flow with no entry conditions — fires on every save',
                'Add entry conditions to limit unnecessary executions. Major performance impact at scale.'
            );
        }

        if (n.status && n.status !== 'Active') {
            addConcern('LOW', 'Hygiene',
                n.name, n.type,
                `Flow status is "${n.status}" — not active but still deployed`,
                'Consider removing inactive flows to reduce metadata noise.'
            );
        }

        if (n.dmlObjects?.length >= 3) {
            addConcern('MEDIUM', 'Data Integrity',
                n.name, n.type,
                `Flow writes to ${n.dmlObjects.length} objects: ${n.dmlObjects.join(', ')}`,
                'Complex multi-object flows are hard to debug. Consider splitting.'
            );
        }
    }

    // ── Trigger specifics ─────────────────────────────────────────────────────
    if (n.type === 'Trigger') {
        const hasHandler = edgeMap[n.name]?.out.some(e =>
            e.edgeType === 'handler-call' || (byName[e.to]?.isTriggerHandler)
        );
        if (!hasHandler && total > 0) {
            addConcern('MEDIUM', 'Architecture',
                n.name, n.type,
                'Trigger does not delegate to a handler class',
                'Use handler pattern for testability and separation of concerns.'
            );
        }

        const sibling = nodes.filter(other =>
            other.type === 'Trigger' && other.name !== n.name && other.object === n.object
        );
        if (sibling.length > 0) {
            addConcern('LOW', 'Architecture',
                n.name, n.type,
                `Multiple triggers on ${n.object}: ${sibling.map(s => s.name).join(', ')}`,
                'Salesforce does not guarantee trigger execution order. Consolidate into one trigger.'
            );
        }
    }

    // ── Isolated nodes ────────────────────────────────────────────────────────
    if (total === 0 && !['CustomObject', 'PlatformEvent'].includes(n.type)) {
        addConcern('LOW', 'Hygiene',
            n.name, n.type,
            'No connections found — possible dead code',
            'Verify this is still in use. If not, consider removing.'
        );
    }

    // ── Cross-object formula deps ─────────────────────────────────────────────
    if (n.formulaFields?.some(ff => ff.crossObjectRefs?.length > 0)) {
        const crossRefs = n.formulaFields
            .flatMap(ff => ff.crossObjectRefs.map(r => `${ff.fieldName}→${r.objectRef}.${r.field}`));
        addConcern('LOW', 'Data Integrity',
            n.name, n.type,
            `Formula fields reference other objects: ${crossRefs.slice(0, 3).join('; ')}${crossRefs.length > 3 ? '...' : ''}`,
            'Cross-object formulas create hidden read dependencies. Changes to parent objects affect this object.'
        );
    }
});

writeCsv(outDir, 'concerns.csv',
    ['severity', 'category', 'node', 'nodeType', 'detail', 'recommendation'],
    concerns.sort((a, b) => {
        const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return (order[a.severity] - order[b.severity]) || a.category.localeCompare(b.category);
    })
);
console.log(`      → ${concerns.length} concerns (${concerns.filter(c=>c.severity==='HIGH').length} HIGH, ${concerns.filter(c=>c.severity==='MEDIUM').length} MEDIUM, ${concerns.filter(c=>c.severity==='LOW').length} LOW)`);

// ── 2. chains.csv ──────────────────────────────────────────────────────────────
console.log('  [2/4] Generating chains.csv...');

const { buildChain } = require('./parsers/chainTraversal');

const EVENTS = [
    'before insert', 'before update', 'before delete',
    'after insert',  'after update',  'after delete',
];

const automatedObjects = [...new Set(
    nodes.filter(n => n.type === 'Trigger' || n.type === 'Flow').map(n => n.object).filter(Boolean)
)].sort();

const chainRows = [];
let chainStepNum = 0;

function flattenSteps(steps, object, event, blockId, blockLabel) {
    steps.forEach(step => {
        chainStepNum++;
        chainRows.push({
            object, event, blockId, blockLabel,
            stepNum:       chainStepNum,
            depth:         step.depth,
            name:          step.name,
            type:          step.type,
            edgeType:      step.edgeType || '',
            inferred:      step.inferred ? 'yes' : 'no',
            asyncBoundary: step.asyncBoundary || '',
            annotation:    step.annotation || '',
            isCycle:       step.isCycle ? 'yes' : 'no',
        });
        if (step.children?.length) flattenSteps(step.children, object, event, blockId, blockLabel);
    });
}

automatedObjects.forEach(obj => {
    EVENTS.forEach(ev => {
        chainStepNum = 0;
        const blocks = buildChain(nodes, edges, obj, ev);
        if (!blocks.some(b => !b.isSystem && b.steps?.length > 0)) return;
        blocks.forEach(block => {
            if (block.isSystem || !block.steps?.length) return;
            flattenSteps(block.steps, obj, ev, block.id, block.label);
        });
    });
});

writeCsv(outDir, 'chains.csv',
    ['object', 'event', 'blockId', 'blockLabel', 'stepNum', 'depth',
     'name', 'type', 'edgeType', 'inferred', 'asyncBoundary', 'annotation', 'isCycle'],
    chainRows
);
console.log(`      → ${chainRows.length} chain steps across ${automatedObjects.length} objects`);

// ── 3. dml_map.csv ─────────────────────────────────────────────────────────────
console.log('  [3/4] Generating dml_map.csv...');

const dmlRows = [];

nodes.forEach(n => {
    const dmlObjects = n.dmlObjects || [];
    if (!dmlObjects.length) return;
    const verbs = n.dmlVerbs
        ? Object.entries(n.dmlVerbs).map(([v, c]) => `${v}(${c})`).join(', ')
        : 'dml';
    dmlObjects.forEach(obj => {
        const triggeredNodes = edges
            .filter(e => e.from === n.name && e.inferred && e.viaObject === obj)
            .map(e => e.to);
        dmlRows.push({
            writer:             n.name,
            writerType:         n.type,
            writerObject:       n.object || '',
            dmlVerbs:           verbs,
            targetObject:       obj,
            triggersAutomation: triggeredNodes.length > 0 ? 'yes' : 'no',
            triggeredNodes:     triggeredNodes.join('; '),
            asyncContext:       (n.isBatch || n.isQueueable || n.isFuture || n.isSchedulable) ? 'yes' : 'no',
        });
    });
});

writeCsv(outDir, 'dml_map.csv',
    ['writer', 'writerType', 'writerObject', 'dmlVerbs', 'targetObject',
     'triggersAutomation', 'triggeredNodes', 'asyncContext'],
    dmlRows.sort((a, b) => a.targetObject.localeCompare(b.targetObject))
);
console.log(`      → ${dmlRows.length} DML operations mapped`);

// ── 4. coverage_gaps.csv ───────────────────────────────────────────────────────
console.log('  [4/4] Generating coverage_gaps.csv...');

const apexClasses = nodes.filter(n => n.type === 'ApexClass');
const testClassNames = new Set(
    apexClasses
        .filter(n => n.name.endsWith('Test') || n.name.endsWith('_Test') ||
                     n.name.startsWith('Test') || n.name.includes('_test'))
        .map(n => n.name)
);

function findTestClass(className) {
    return [`${className}Test`, `${className}_Test`, `Test${className}`, `Test_${className}`]
        .find(c => testClassNames.has(c)) || null;
}

const coverageRows = [];
apexClasses
    .filter(n => !n.name.toLowerCase().includes('test'))
    .forEach(n => {
        const testClass = findTestClass(n.name);
        const edgeCount = totalEdges(n);
        const risk = edgeCount >= 6 ? 'HIGH' : edgeCount >= 3 ? 'MEDIUM' : 'LOW';
        coverageRows.push({
            className:        n.name,
            isTriggerHandler: n.isTriggerHandler ? 'yes' : 'no',
            isBatch:          n.isBatch          ? 'yes' : 'no',
            isQueueable:      n.isQueueable       ? 'yes' : 'no',
            isInvocable:      n.isInvocable        ? 'yes' : 'no',
            isRestResource:   n.restResource      ? 'yes' : 'no',
            withoutSharing:   n.withoutSharing    ? 'yes' : 'no',
            dmlInLoop:        n.dmlInLoop         ? 'yes' : 'no',
            soqlInLoop:       n.soqlInLoop        ? 'yes' : 'no',
            totalEdges:       edgeCount,
            missingTest:      testClass ? 'no' : 'yes',
            testClass:        testClass || '—',
            riskIfUntested:   testClass ? '—' : risk,
        });
    });

writeCsv(outDir, 'coverage_gaps.csv',
    ['className', 'isTriggerHandler', 'isBatch', 'isQueueable', 'isInvocable',
     'isRestResource', 'withoutSharing', 'dmlInLoop', 'soqlInLoop',
     'totalEdges', 'missingTest', 'testClass', 'riskIfUntested'],
    coverageRows.sort((a, b) => {
        if (a.missingTest !== b.missingTest) return a.missingTest === 'yes' ? -1 : 1;
        const order = { HIGH: 0, MEDIUM: 1, LOW: 2, '—': 3 };
        return (order[a.riskIfUntested] || 3) - (order[b.riskIfUntested] || 3);
    })
);

const missing  = coverageRows.filter(r => r.missingTest === 'yes');
const highRisk = missing.filter(r => r.riskIfUntested === 'HIGH');
console.log(`      → ${coverageRows.length} classes, ${missing.length} missing tests (${highRisk.length} HIGH risk)`);

// ── 5. prompt_template.txt ─────────────────────────────────────────────────────
const concernSummary = {
    HIGH:   concerns.filter(c => c.severity === 'HIGH').length,
    MEDIUM: concerns.filter(c => c.severity === 'MEDIUM').length,
    LOW:    concerns.filter(c => c.severity === 'LOW').length,
};

const prompt = `# Salesforce Org Automation Analysis
Generated: ${new Date().toISOString()}
Source: ${meta?.sourceZip || 'unknown'}

## Org Summary
- Nodes: ${nodes.length} (Flows: ${nodes.filter(n=>n.type==='Flow').length}, Triggers: ${nodes.filter(n=>n.type==='Trigger').length}, Apex Classes: ${nodes.filter(n=>n.type==='ApexClass').length})
- Edges: ${edges.length} (${edges.filter(e=>e.inferred).length} inferred)
- Static concerns: ${concerns.length} (HIGH: ${concernSummary.HIGH}, MEDIUM: ${concernSummary.MEDIUM}, LOW: ${concernSummary.LOW})
- Classes missing test coverage: ${missing.length} (${highRisk.length} HIGH risk)

---

## Instructions for LLM

The following CSVs are attached. Please analyze them and provide:

1. **Executive Summary** (3-5 sentences)
   Overall architectural health of this org's automation layer.

2. **Top 5 Risks** (ranked by priority)
   For each: what is the risk, which nodes, what could go wrong, recommended fix.

3. **Patterns and Anti-Patterns**
   Recurring good patterns and recurring problems.

4. **Quick Wins** (low effort, high impact)
   Specific actionable items a developer could address in one sprint.

5. **Gaps and Blind Spots**
   What cannot be detected statically and requires runtime analysis or manual review.

## Important Context
- Inferred edges: derived from DML operations, not explicit code. Likely correct but not guaranteed.
- Async boundaries: new execution context, new governor limit reset.
- DML/SOQL in loop detection is heuristic — confirm with code review before acting.
- Coverage gaps are heuristic — test classes may exist with non-standard naming.
- without sharing flag means record-level security bypassed — verify intent.

## Files Attached
- concerns.csv       — ${concerns.length} static analysis findings
- chains.csv         — ${chainRows.length} execution chain steps across ${automatedObjects.length} objects
- dml_map.csv        — ${dmlRows.length} DML operations mapped to targets
- coverage_gaps.csv  — ${coverageRows.length} Apex classes with coverage status

---
## Top HIGH Concerns

${concerns
    .filter(c => c.severity === 'HIGH')
    .map(c => `- [${c.category}] ${c.node} (${c.nodeType}): ${c.detail}`)
    .join('\n') || '  None found.'}

## Classes Missing Tests — HIGH Risk

${highRisk
    .map(r => `- ${r.className} (${r.totalEdges} edges, dmlInLoop: ${r.dmlInLoop}, soqlInLoop: ${r.soqlInLoop})`)
    .join('\n') || '  None found.'}
`;

fs.writeFileSync(path.join(outDir, 'prompt_template.txt'), prompt, 'utf8');

// ── Done ───────────────────────────────────────────────────────────────────────
console.log(`
✅  Export complete:
    concerns.csv        → ${concerns.length} findings
    chains.csv          → ${chainRows.length} steps
    dml_map.csv         → ${dmlRows.length} DML operations
    coverage_gaps.csv   → ${missing.length}/${coverageRows.length} classes missing tests
    prompt_template.txt → ready to paste

📋  Quick LLM workflow:
    1. Open Claude, GPT-4, or any LLM
    2. Paste prompt_template.txt as your first message
    3. Attach concerns.csv + chains.csv
    4. Ask follow-up questions about specific nodes or objects
`);

// ── CSV writer ─────────────────────────────────────────────────────────────────
function writeCsv(dir, filename, headers, rows) {
    const escape = v => {
        const s = v == null ? '' : String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(','), ...rows.map(row => headers.map(h => escape(row[h])).join(','))];
    fs.writeFileSync(path.join(dir, filename), lines.join('\n'), 'utf8');
}
