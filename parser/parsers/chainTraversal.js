/**
 * parser/parsers/chainTraversal.js
 *
 * Builds an ordered chain of execution steps from a given entry point.
 *
 * Input:  { nodes, edges }  from index.json
 *         { object, event } e.g. { object: 'Order__c', event: 'after update' }
 *
 * Output: { blocks: [ { id, label, steps: [ Step ] } ] }
 *
 * Step shape:
 * {
 *   id:          string          unique step id
 *   depth:       number          indentation level
 *   type:        string          Flow | Trigger | ApexClass | ...
 *   name:        string
 *   edgeType:    string          how we got here
 *   inferred:    boolean         DML→Trigger (not in source)
 *   asyncBoundary: string|null   'platform-event' | 'batch' | 'queueable' | 'future'
 *   annotation:  string|null     e.g. 'before save' | '@future' | 'conditional ⚠'
 *   children:    Step[]          nested sub-steps
 * }
 */

// ── Salesforce Order of Execution blocks ──────────────────────────────────────
// Each block has a filter that decides which nodes belong here.
// Blocks are always rendered in this order; empty blocks are skipped.

const BLOCKS = [
  {
    id:    'system-validation',
    label: 'System Validation',
    system: true,
    note:  'Page layout rules, field type/length checks',
  },
  {
    id:    'before-flows',
    label: 'Before-Save Record Flows',
    system: false,
    match: (n) => n.type === 'Flow' &&
                  (n.triggerType === 'RecordBeforeSave' ||
                   n.recTrigType  === 'Create' ||
                   n.recTrigType  === 'Update' ||
                   n.recTrigType  === 'CreateAndUpdate') &&
                  (n.triggerType === 'RecordBeforeSave'),
  },
  {
    id:    'before-triggers',
    label: 'Before Triggers',
    system: false,
    match: (n, event) => n.type === 'Trigger' &&
                         matchesEvent(n, event, 'before'),
  },
  {
    id:    'validation-rules',
    label: 'Custom Validation Rules',
    system: true,
    note:  'All active validation rules evaluated',
  },
  {
    id:    'duplicate-rules',
    label: 'Duplicate Rules',
    system: true,
    note:  'Block action stops execution',
  },
  {
    id:    'save-to-db',
    label: 'Save to Database (not committed)',
    system: true,
  },
  {
    id:    'after-triggers',
    label: 'After Triggers',
    system: false,
    match: (n, event) => n.type === 'Trigger' &&
                         matchesEvent(n, event, 'after'),
  },
  {
    id:    'assignment-rules',
    label: 'Assignment Rules',
    system: true,
  },
  {
    id:    'workflow-rules',
    label: 'Workflow Rules (legacy)',
    system: true,
    note:  'Field updates re-fire before+after triggers once',
  },
  {
    id:    'escalation-rules',
    label: 'Escalation Rules',
    system: true,
  },
  {
    id:    'after-flows',
    label: 'After-Save Record Flows',
    system: false,
    match: (n) => n.type === 'Flow' &&
                  n.triggerType === 'RecordAfterSave',
  },
  {
    id:    'entitlement-rules',
    label: 'Entitlement Rules',
    system: true,
  },
  {
    id:    'rollup-summary',
    label: 'Roll-Up Summary Recalculation',
    system: true,
    note:  'Parent record goes through full save cycle',
  },
  {
    id:    'sharing-rules',
    label: 'Criteria-Based Sharing Rules',
    system: true,
  },
  {
    id:    'commit',
    label: 'COMMIT',
    system: true,
  },
  {
    id:    'post-commit',
    label: 'Post-Commit (emails, outbound messages)',
    system: true,
  },
];

// ── Public API ─────────────────────────────────────────────────────────────────
function buildChain(nodes, edges, object, event) {
  const byName   = Object.fromEntries(nodes.map(n => [n.name, n]));
  const edgeMap  = buildEdgeMap(edges);
  const visited  = new Set();
  const MAX_DEPTH = 8;

  // Find all flows/triggers on this object that match the entry event
  function findEntryNodes(blockMatch) {
    return nodes.filter(n =>
      (n.object === object || n.object === object.replace('__c','')) &&
      blockMatch(n, event)
    );
  }

  // DFS from a node, returns Step[]
  function traverse(node, depth, entryEdgeType, entryInferred, asyncBoundary) {
    const key = node.name;
    if (depth > MAX_DEPTH || visited.has(key)) {
      return [{
        id:           `cycle-${key}-${depth}`,
        depth,
        type:         node.type,
        name:         node.name,
        edgeType:     entryEdgeType,
        inferred:     entryInferred,
        asyncBoundary,
        annotation:   '🔄 cycle — already visited',
        children:     [],
        isCycle:      true,
      }];
    }

    visited.add(key);

    const step = {
      id:           `${key}-${depth}`,
      depth,
      type:         node.type,
      name:         node.name,
      edgeType:     entryEdgeType,
      inferred:     entryInferred || false,
      asyncBoundary,
      annotation:   buildAnnotation(node, entryEdgeType),
      children:     [],
      node,          // reference for detail panel
    };

    // Walk outgoing edges
    const outEdges = edgeMap[node.name]?.out || [];
    for (const edge of outEdges) {
      const target = byName[edge.to];
      if (!target) continue;

      // Detect async boundaries
      const async = detectAsync(target, edge);

      // Skip dml-triggers that point back to the same triggering object
      // to avoid immediate false recursion at depth 0
      if (edge.edgeType === 'dml-triggers' && depth === 0) {
        // still show it but mark as inferred
      }

      const childSteps = traverse(target, depth + 1, edge.edgeType, edge.inferred, async);
      step.children.push(...childSteps);
    }

    visited.delete(key); // allow same node in different branches
    return [step];
  }

  // Build blocks
  const result = [];

  for (const block of BLOCKS) {
    if (block.system) {
      result.push({ ...block, steps: [], isSystem: true });
      continue;
    }

    const entryNodes = findEntryNodes(block.match);
    if (entryNodes.length === 0) {
      result.push({ ...block, steps: [], isEmpty: true });
      continue;
    }

    const steps = [];
    for (const n of entryNodes) {
      visited.clear();
      steps.push(...traverse(n, 0, 'entry', false, null));
    }

    result.push({ ...block, steps, isEmpty: steps.length === 0 });
  }

  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildEdgeMap(edges) {
  const m = {};
  edges.forEach(e => {
    if (!m[e.from]) m[e.from] = { out: [], in: [] };
    if (!m[e.to])   m[e.to]   = { out: [], in: [] };
    m[e.from].out.push(e);
    m[e.to].in.push(e);
  });
  return m;
}

function matchesEvent(node, event, timing) {
  // event = 'after update', timing = 'before' | 'after'
  if (!node.events || node.events.length === 0) return false;
  const [timingPart, operationPart] = event.split(' ');
  return node.events.some(ev => {
    const evLower = ev.toLowerCase();
    return evLower.startsWith(timing) &&
           (evLower.includes(operationPart) || operationPart === 'all');
  });
}

function detectAsync(node, edge) {
  if (edge.edgeType === 'event-publish' || edge.edgeType === 'event-subscribe') {
    return 'platform-event';
  }
  if (edge.edgeType === 'batch-call' || node.isBatch)      return 'batch';
  if (edge.edgeType === 'queueable-call' || node.isQueueable) return 'queueable';
  if (node.isFuture)                                        return 'future';
  return null;
}

function buildAnnotation(node, edgeType) {
  const parts = [];
  if (node.triggerType === 'RecordBeforeSave') parts.push('before save');
  if (node.triggerType === 'RecordAfterSave')  parts.push('after save');
  if (node.recTrigType)                        parts.push(node.recTrigType.toLowerCase());
  if (node.restResource)                       parts.push(`REST ${node.restResource}`);
  if (node.isBatch)                            parts.push('Database.Batchable');
  if (node.isQueueable)                        parts.push('Queueable');
  if (node.isFuture)                           parts.push('@future');
  if (node.isSchedulable)                      parts.push('Schedulable');
  if (node.isInvocable)                        parts.push('@InvocableMethod');
  if (edgeType === 'dml-triggers')             parts.push('⚠ inferred via DML');
  if (edgeType === 'formula-ref')              parts.push('ƒ formula ref');
  if (node.entryFilters?.length > 0)           parts.push('⚠ conditional entry');
  if (node.callouts?.length > 0)               parts.push(`↗ callout: ${node.callouts.join(', ')}`);
  return parts.length ? parts.join(' · ') : null;
}

module.exports = { buildChain, BLOCKS };
