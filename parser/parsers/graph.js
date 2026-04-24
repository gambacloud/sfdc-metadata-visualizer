/**
 * parser/parsers/graph.js
 * Builds edges between all parsed nodes.
 * Edge types:
 *   handler-call      Trigger → TriggerHandler class
 *   class-call        Apex class → Apex class
 *   dml-triggers      Apex/Flow DML on Object X → Trigger on X  (inferred)
 *   event-publish     Apex → Platform Event
 *   event-subscribe   Platform Event → Trigger
 *   flow-subflow      Flow → Flow
 *   flow-apex         Flow → Apex invocable
 *   flow-dml          Flow → Custom Object (write)
 *   lwc-apex          LWC → Apex class
 *   lwc-flow          LWC → Flow
 *   aura-apex         Aura → Apex class
 *   aura-flow         Aura → Flow
 *   batch-call        Apex → Batch class
 *   queueable-call    Apex → Queueable class
 *   future-call       Apex → @future method (self)
 *   rest-endpoint     External → REST Apex class
 *   extends           ApexClass → parent class
 */

function buildGraph(nodes) {
    const edges = [];
    const byName = {};
    const byObject = {}; // Object name → [Trigger nodes]

    // Index
    nodes.forEach(n => {
        byName[n.name] = n;
    });

    // Build object → trigger index
    nodes.forEach(n => {
        if (n.type === 'Trigger' && n.object) {
            if (!byObject[n.object]) byObject[n.object] = [];
            byObject[n.object].push(n.name);
        }
    });

    // Helper: add edge only if target exists in graph (or is a known external)
    const add = (from, to, edgeType, meta = {}) => {
        if (!from || !to || from === to) return;
        edges.push({ from, to, edgeType, ...meta });
    };

    nodes.forEach(n => {

        // ── Triggers ──────────────────────────────────────────────────────────
        if (n.type === 'Trigger') {
            n.classCalls?.forEach(cls => add(n.name, cls, 'handler-call'));
            n.flowInvoke?.forEach(fl  => add(n.name, fl,  'flow-invoke'));
            n.batches?.forEach(b      => add(n.name, b,   'batch-call'));
            n.publishes?.forEach(e    => add(n.name, e,   'event-publish'));
        }

        // ── Apex Classes ──────────────────────────────────────────────────────
        if (n.type === 'ApexClass') {
            // Inheritance
            if (n.extendsClass) add(n.name, n.extendsClass, 'extends');

            // Class → class calls
            n.classCalls?.forEach(cls => {
                if (cls !== n.name) add(n.name, cls, 'class-call');
            });

            // Batch / Queueable spawning
            n.batchCalls?.forEach(b     => add(n.name, b, 'batch-call'));
            n.queueableCalls?.forEach(q => add(n.name, q, 'queueable-call'));

            // Platform event publish
            n.publishes?.forEach(e => add(n.name, e, 'event-publish'));

            // Flow invocations
            n.flowInvoke?.forEach(fl => add(n.name, fl, 'flow-invoke'));

            // DML → inferred trigger chains
            n.dmlObjects?.forEach(obj => {
                (byObject[obj] || []).forEach(trigName => {
                    add(n.name, trigName, 'dml-triggers', { inferred: true, viaObject: obj });
                });
            });

            // Outbound REST callouts
            n.callouts?.forEach(nc => add(n.name, `[Callout] ${nc}`, 'rest-callout', { external: true }));
        }

        // ── Flows ─────────────────────────────────────────────────────────────
        if (n.type === 'Flow') {
            // Subflows
            n.subflows?.forEach(sf => add(n.name, sf, 'flow-subflow'));

            // Apex action calls
            n.actionCalls?.forEach(a => {
                if (a.name) add(n.name, a.name, 'flow-apex');
            });

            // DML → inferred trigger chains
            n.dmlObjects?.forEach(obj => {
                (byObject[obj] || []).forEach(trigName => {
                    add(n.name, trigName, 'dml-triggers', { inferred: true, viaObject: obj });
                });
            });
        }

        // ── LWC ───────────────────────────────────────────────────────────────
        if (n.type === 'LWC') {
            n.apexImports?.forEach(imp => {
                if (imp.class) add(n.name, imp.class, 'lwc-apex', { method: imp.method });
            });
            n.flowRefs?.forEach(fl    => add(n.name, fl, 'lwc-flow'));
            n.childComponents?.forEach(c => add(n.name, c, 'lwc-child'));
        }

        // ── Aura ──────────────────────────────────────────────────────────────
        if (n.type === 'Aura') {
            n.flowRefs?.forEach(fl => add(n.name, fl, 'aura-flow'));
            if (n.controller) add(n.name, n.controller, 'aura-apex');
            n.childComponents?.forEach(c => {
                if (byName[c]) add(n.name, c, 'aura-child');
            });
        }

        // ── Platform Events: subscribe edges ──────────────────────────────────
        if (n.type === 'PlatformEvent') {
            // Triggers that listen to this event
            nodes.forEach(t => {
                if (t.type === 'Trigger' && t.object === n.name) {
                    add(n.name, t.name, 'event-subscribe');
                }
            });
        }
    });

    // Deduplicate
    const seen = new Set();
    const unique = edges.filter(e => {
        const key = `${e.from}|${e.to}|${e.edgeType}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return unique;
}

module.exports = { buildGraph };
