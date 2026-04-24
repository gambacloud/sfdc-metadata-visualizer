#!/usr/bin/env node
/**
 * parser/index.js
 * Entry point. Reads a Salesforce metadata ZIP and writes data/index.json.
 *
 * Usage:
 *   node index.js --zip ../demo-metadata.zip
 *   node index.js --zip /path/to/metadata.zip --out ../data/index.json
 */

const path    = require('path');
const fs      = require('fs');
const AdmZip  = require('adm-zip');
const yargs   = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

const { parseFlow }         = require('./parsers/flow');
const { parseTrigger }      = require('./parsers/trigger');
const { parseApexClass }    = require('./parsers/apexClass');
const { parseCustomObject } = require('./parsers/customObject');
const { parseLwcJs, parseLwcHtml } = require('./parsers/lwc');
const { parseAuraCmp, parseAuraController } = require('./parsers/aura');
const { buildGraph }        = require('./parsers/graph');

// ── CLI args ──────────────────────────────────────────────────────────────────
const argv = yargs(hideBin(process.argv))
    .option('zip', { type: 'string', demandOption: true, description: 'Path to metadata ZIP file' })
    .option('out', { type: 'string', default: path.join(__dirname, '../data/index.json'), description: 'Output JSON path' })
    .argv;

const zipPath = path.resolve(argv.zip);
const outPath = path.resolve(argv.out);

if (!fs.existsSync(zipPath)) {
    console.error(`❌  ZIP not found: ${zipPath}`);
    process.exit(1);
}

console.log(`\n📦  Reading ZIP: ${zipPath}`);
const zip = new AdmZip(zipPath);
const entries = zip.getEntries();
console.log(`    ${entries.length} entries found\n`);

// ── Accumulators ──────────────────────────────────────────────────────────────
const nodes = [];
const lwcMap  = {}; // componentName → { js, html }
const auraMap = {}; // componentName → { cmp, controllerJs }

let counts = { flows: 0, triggers: 0, classes: 0, objects: 0, events: 0, lwc: 0, aura: 0, skipped: 0 };

// ── First pass: collect all files ─────────────────────────────────────────────
for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryPath = entry.entryName.replace(/\\/g, '/');
    const lower     = entryPath.toLowerCase();
    const filename  = path.basename(entryPath);
    const content   = entry.getData().toString('utf8');

    // ── Flows ──
    if (lower.endsWith('.flow-meta.xml') || (lower.includes('/flows/') && lower.endsWith('.xml'))) {
        const name = filename.replace(/\.flow-meta\.xml$/i, '').replace(/\.xml$/i, '');
        const node = parseFlow(name, content);
        if (node) { nodes.push(node); counts.flows++; }
        continue;
    }

    // ── Triggers ──
    if (lower.endsWith('.trigger') || lower.endsWith('.trigger-meta.xml')) {
        const name = filename.replace(/\.trigger.*$/i, '');
        // Skip meta-only files
        if (lower.endsWith('-meta.xml') && !lower.endsWith('.trigger-meta.xml')) continue;
        if (lower.endsWith('-meta.xml')) continue;
        const node = parseTrigger(name, content);
        if (node) { nodes.push(node); counts.triggers++; }
        continue;
    }

    // ── Apex Classes ──
    if (lower.endsWith('.cls') && !lower.endsWith('.cls-meta.xml')) {
        const name = filename.replace(/\.cls$/i, '');
        const node = parseApexClass(name, content);
        if (node) { nodes.push(node); counts.classes++; }
        continue;
    }

    // ── Custom Objects ──
    if (lower.endsWith('.object-meta.xml') || (lower.includes('/objects/') && lower.endsWith('.xml'))) {
        const name = filename.replace(/\.object-meta\.xml$/i, '').replace(/\.xml$/i, '');
        const isPlatformEvent = name.endsWith('__e') || lower.includes('/platformevents/');
        const node = parseCustomObject(name, content, isPlatformEvent);
        if (node) {
            nodes.push(node);
            if (isPlatformEvent) counts.events++;
            else counts.objects++;
        }
        continue;
    }

    // ── LWC ──
    if (lower.includes('/lwc/')) {
        // Derive component name from folder
        const parts    = entryPath.split('/');
        const lwcIdx   = parts.findIndex(p => p.toLowerCase() === 'lwc');
        const compName = parts[lwcIdx + 1];
        if (!compName) continue;

        if (!lwcMap[compName]) lwcMap[compName] = {};
        if (lower.endsWith('.js') && !lower.endsWith('.test.js')) lwcMap[compName].js   = content;
        if (lower.endsWith('.html')) lwcMap[compName].html = content;
        continue;
    }

    // ── Aura ──
    if (lower.includes('/aura/')) {
        const parts    = entryPath.split('/');
        const auraIdx  = parts.findIndex(p => p.toLowerCase() === 'aura');
        const compName = parts[auraIdx + 1];
        if (!compName) continue;

        if (!auraMap[compName]) auraMap[compName] = {};
        if (lower.endsWith('.cmp'))          auraMap[compName].cmp = content;
        if (lower.endsWith('controller.js')) auraMap[compName].controllerJs = content;
        continue;
    }

    counts.skipped++;
}

// ── Second pass: assemble LWC nodes ──────────────────────────────────────────
for (const [compName, files] of Object.entries(lwcMap)) {
    const jsData   = files.js   ? parseLwcJs(compName, files.js)     : {};
    const htmlData = files.html ? parseLwcHtml(compName, files.html) : {};
    nodes.push({
        name:           compName,
        type:           'LWC',
        apexImports:    jsData.apexImports    || [],
        usesNavigation: jsData.usesNavigation || false,
        flowInvoke:     jsData.flowInvoke     || [],
        flowRefs:       htmlData.flowRefs     || [],
        childComponents:htmlData.childComponents || [],
    });
    counts.lwc++;
}

// ── Third pass: assemble Aura nodes ──────────────────────────────────────────
for (const [compName, files] of Object.entries(auraMap)) {
    const cmpData  = files.cmp          ? parseAuraCmp(compName, files.cmp)              : {};
    const ctrlData = files.controllerJs ? parseAuraController(compName, files.controllerJs) : {};
    nodes.push({
        name:           compName,
        type:           'Aura',
        flowRefs:       cmpData.flowRefs        || [],
        controller:     cmpData.controller      || null,
        childComponents:cmpData.childComponents || [],
        apexMethods:    ctrlData.apexCalls      || [],
    });
    counts.aura++;
}

// ── Build graph ───────────────────────────────────────────────────────────────
console.log('🔗  Building dependency graph...');
const edges = buildGraph(nodes);

// ── Stats ─────────────────────────────────────────────────────────────────────
const inferredEdges = edges.filter(e => e.inferred).length;
const externalEdges = edges.filter(e => e.external).length;

console.log(`\n📊  Parse results:`);
console.log(`    Flows:          ${counts.flows}`);
console.log(`    Triggers:       ${counts.triggers}`);
console.log(`    Apex Classes:   ${counts.classes}`);
console.log(`    Custom Objects: ${counts.objects}`);
console.log(`    Platform Events:${counts.events}`);
console.log(`    LWC:            ${counts.lwc}`);
console.log(`    Aura:           ${counts.aura}`);
console.log(`    ─────────────────────────`);
console.log(`    Total nodes:    ${nodes.length}`);
console.log(`    Total edges:    ${edges.length}  (${inferredEdges} inferred, ${externalEdges} external)`);

// ── Write output ──────────────────────────────────────────────────────────────
const output = {
    meta: {
        generatedAt:   new Date().toISOString(),
        sourceZip:     path.basename(zipPath),
        totalNodes:    nodes.length,
        totalEdges:    edges.length,
        inferredEdges,
        externalEdges,
        counts,
    },
    nodes,
    edges,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`\n✅  Written: ${outPath}  (${sizeKb} KB)\n`);
