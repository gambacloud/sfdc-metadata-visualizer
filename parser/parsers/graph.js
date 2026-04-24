/**
 * parser/parsers/graph.js
 * Builds edges between all parsed nodes.
 *
 * Edge types:
 *   handler-call       Trigger → TriggerHandler class
 *   class-call         Apex class → Apex class
 *   dml-triggers       Apex/Flow DML on Object X → Trigger on X  (inferred)
 *   event-publish      Apex → Platform Event
 *   event-subscribe    Platform Event → Trigger
 *   flow-subflow       Flow → Flow
 *   flow-apex          Flow → Apex invocable
 *   flow-dml           Flow → Custom Object (write)
 *   lwc-apex           LWC → Apex class
 *   lwc-flow           LWC → Flow
 *   lwc-child          LWC → child LWC
 *   aura-apex          Aura → Apex class
 *   aura-flow          Aura → Flow
 *   aura-child         Aura → child component
 *   batch-call         Apex → Batch class
 *   queueable-call     Apex → Queueable class
 *   rest-callout       Apex → external Named Credential
 *   extends            ApexClass → parent class
 *   formula-ref        CustomObject → CustomObject via formula field (cross-object)
 */

function buildGraph(nodes) {
    const edges   = [];
    const byName  = {};
    const byObject= {};   // Object API name → [Trigger node names]

    // ── Index ─────────────────────────────────────────────────────────────────
    nodes.forEach(n => { byName[n.name] = n; });

    nodes.forEach(n => {
        if (n.type === 'Trigger' && n.object) {
            if (!byObject[n.object]) byObject[n.object] = [];
            byObject[n.object].push(n.name);
        }
    });

    const add = (from, to, edgeType, meta = {}) => {
        if (!from || !to || from === to) return;
        edges.push({ from, to, edgeType, ...meta });
    };

    nodes.forEach(n => {

        // ── Triggers ──────────────────────────────────────────────────────────
        if (n.type === 'Trigger') {
            n.classCalls?.forEach(cls  => add(n.name, cls, 'handler-call'));
            n.flowInvoke?.forEach(fl   => add(n.name, fl,  'flow-invoke'));
            n.batches?.forEach(b       => add(n.name, b,   'batch-call'));
            n.publishes?.forEach(e     => add(n.name, e,   'event-publish'));
        }

        // ── Apex Classes ──────────────────────────────────────────────────────
        if (n.type === 'ApexClass') {
            if (n.extendsClass) add(n.name, n.extendsClass, 'extends');

            n.classCalls?.forEach(cls  => { if (cls !== n.name) add(n.name, cls, 'class-call'); });
            n.batchCalls?.forEach(b    => add(n.name, b, 'batch-call'));
            n.queueableCalls?.forEach(q=> add(n.name, q, 'queueable-call'));
            n.publishes?.forEach(e     => add(n.name, e, 'event-publish'));
            n.flowInvoke?.forEach(fl   => add(n.name, fl, 'flow-invoke'));
            n.callouts?.forEach(nc     => add(n.name, `[Callout] ${nc}`, 'rest-callout', { external: true }));

            n.dmlObjects?.forEach(obj  => {
                (byObject[obj] || []).forEach(trig => {
                    add(n.name, trig, 'dml-triggers', { inferred: true, viaObject: obj });
                });
            });
        }

        // ── Flows ─────────────────────────────────────────────────────────────
        if (n.type === 'Flow') {
            n.subflows?.forEach(sf     => add(n.name, sf, 'flow-subflow'));
            n.actionCalls?.forEach(a   => { if (a.name) add(n.name, a.name, 'flow-apex'); });

            n.dmlObjects?.forEach(obj  => {
                (byObject[obj] || []).forEach(trig => {
                    add(n.name, trig, 'dml-triggers', { inferred: true, viaObject: obj });
                });
            });

            // Feature 2: Flow formula → field refs on the object
            // These are informational only (not new graph edges) — captured in node data
        }

        // ── LWC ───────────────────────────────────────────────────────────────
        if (n.type === 'LWC') {
            n.apexImports?.forEach(imp => {
                if (imp.class) add(n.name, imp.class, 'lwc-apex', { method: imp.method });
            });
            n.flowRefs?.forEach(fl     => add(n.name, fl, 'lwc-flow'));
            n.childComponents?.forEach(c => add(n.name, c, 'lwc-child'));
        }

        // ── Aura ──────────────────────────────────────────────────────────────
        if (n.type === 'Aura') {
            n.flowRefs?.forEach(fl     => add(n.name, fl, 'aura-flow'));
            if (n.controller)            add(n.name, n.controller, 'aura-apex');
            n.childComponents?.forEach(c => { if (byName[c]) add(n.name, c, 'aura-child'); });
        }

        // ── Platform Events: subscribe edges ──────────────────────────────────
        if (n.type === 'PlatformEvent') {
            nodes.forEach(t => {
                if (t.type === 'Trigger' && t.object === n.name) {
                    add(n.name, t.name, 'event-subscribe');
                }
            });
        }

        // ── Feature 5: Formula field cross-object edges ───────────────────────
        // CustomObject.formulaEdges were pre-computed in parseCustomObject
        if (n.type === 'CustomObject' || n.type === 'PlatformEvent') {
            (n.formulaEdges ?? []).forEach(fe => {
                // Only add edge if target object exists in graph
                if (byName[fe.to] || fe.to) {
                    add(fe.from, fe.to, 'formula-ref', {
                        viaField:   fe.viaField,
                        viaFormula: fe.viaFormula,
                        label:      fe.label,
                    });
                }
            });
        }
    });

    // ── Deduplicate ───────────────────────────────────────────────────────────
    const seen = new Set();
    return edges.filter(e => {
        const key = `${e.from}|${e.to}|${e.edgeType}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

module.exports = { buildGraph };
