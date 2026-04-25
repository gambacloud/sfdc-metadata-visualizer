import React, { useState, useMemo } from 'react';
import { C, TYPE_COLOR, TYPE_ICON } from '../constants.js';

// ── Salesforce execution order blocks (mirrors chainTraversal.js) ─────────────
const BLOCK_ORDER = [
  { id: 'system-validation',  label: 'System Validation',               system: true  },
  { id: 'before-flows',       label: 'Before-Save Record Flows',         system: false },
  { id: 'before-triggers',    label: 'Before Triggers',                  system: false },
  { id: 'validation-rules',   label: 'Custom Validation Rules',          system: true  },
  { id: 'duplicate-rules',    label: 'Duplicate Rules',                  system: true  },
  { id: 'save-to-db',         label: 'Save to Database (not committed)', system: true  },
  { id: 'after-triggers',     label: 'After Triggers',                   system: false },
  { id: 'assignment-rules',   label: 'Assignment Rules',                 system: true  },
  { id: 'workflow-rules',     label: 'Workflow Rules (legacy)',           system: true  },
  { id: 'escalation-rules',   label: 'Escalation Rules',                 system: true  },
  { id: 'after-flows',        label: 'After-Save Record Flows',          system: false },
  { id: 'entitlement-rules',  label: 'Entitlement Rules',                system: true  },
  { id: 'rollup-summary',     label: 'Roll-Up Summary Recalculation',    system: true  },
  { id: 'sharing-rules',      label: 'Criteria-Based Sharing Rules',     system: true  },
  { id: 'commit',             label: 'COMMIT',                           system: true  },
  { id: 'post-commit',        label: 'Post-Commit (emails, outbound)',   system: true  },
];

const EVENTS = [
  'before insert', 'before update', 'before delete',
  'after insert',  'after update',  'after delete',
];

const ASYNC_STYLES = {
  'platform-event': { label: '── platform event boundary (async) ──', col: C.accent5 },
  'batch':          { label: '── batch job boundary (async) ──',       col: C.accent3 },
  'queueable':      { label: '── queueable boundary (async) ──',       col: C.accent3 },
  'future':         { label: '── @future boundary (async) ──',         col: C.accent3 },
};

// ── Client-side chain builder (mirrors chainTraversal.js logic) ───────────────
function buildChain(nodes, edges, object, event) {
  const byName  = Object.fromEntries(nodes.map(n => [n.name, n]));
  const edgeMap = {};
  edges.forEach(e => {
    if (!edgeMap[e.from]) edgeMap[e.from] = { out: [] };
    if (!edgeMap[e.to])   edgeMap[e.to]   = { out: [] };
    edgeMap[e.from].out.push(e);
  });

  const MAX_DEPTH = 8;

  function matchesEvent(node, timing) {
    if (!node.events?.length) return false;
    const [, op] = event.split(' ');
    return node.events.some(ev => {
      const evL = ev.toLowerCase();
      return evL.startsWith(timing) && evL.includes(op);
    });
  }

  function detectAsync(target, edge) {
    if (edge.edgeType === 'event-publish' || edge.edgeType === 'event-subscribe') return 'platform-event';
    if (edge.edgeType === 'batch-call'    || target.isBatch)      return 'batch';
    if (edge.edgeType === 'queueable-call'|| target.isQueueable)  return 'queueable';
    if (target.isFuture)                                           return 'future';
    return null;
  }

  function annotation(node, edgeType) {
    const p = [];
    if (node.triggerType === 'RecordBeforeSave') p.push('before save');
    if (node.triggerType === 'RecordAfterSave')  p.push('after save');
    if (node.recTrigType)   p.push(node.recTrigType.toLowerCase());
    if (node.isBatch)       p.push('Batchable');
    if (node.isQueueable)   p.push('Queueable');
    if (node.isFuture)      p.push('@future');
    if (node.isInvocable)   p.push('@InvocableMethod');
    if (node.restResource)  p.push(`REST ${node.restResource}`);
    if (node.callouts?.length) p.push(`↗ ${node.callouts.join(', ')}`);
    if (edgeType === 'dml-triggers')  p.push('⚠ inferred via DML');
    if (node.entryFilters?.length)    p.push('⚠ conditional');
    return p.join(' · ') || null;
  }

  let stepCounter = 0;

  function traverse(node, depth, edgeType, inferred, asyncBoundary, visited) {
    const key = node.name;
    if (depth > MAX_DEPTH || visited.has(key)) {
      return [{ id: `c${stepCounter++}`, depth, type: node.type, name: node.name,
                edgeType, inferred, asyncBoundary, annotation: '🔄 already visited', children: [], isCycle: true, node }];
    }
    visited = new Set(visited);
    visited.add(key);

    const step = {
      id: `s${stepCounter++}`, depth, type: node.type, name: node.name,
      edgeType, inferred: inferred || false, asyncBoundary,
      annotation: annotation(node, edgeType), children: [], node,
    };

    for (const edge of (edgeMap[node.name]?.out || [])) {
      const target = byName[edge.to];
      if (!target) continue;
      const async = detectAsync(target, edge);
      step.children.push(...traverse(target, depth + 1, edge.edgeType, edge.inferred, async, visited));
    }

    return [step];
  }

  // Map block id → matching entry nodes
  const blockMatchers = {
    'before-flows':    n => n.type === 'Flow'    && n.triggerType === 'RecordBeforeSave' && n.object === object,
    'before-triggers': n => n.type === 'Trigger' && matchesEvent(n, 'before')            && n.object === object,
    'after-triggers':  n => n.type === 'Trigger' && matchesEvent(n, 'after')             && n.object === object,
    'after-flows':     n => n.type === 'Flow'    && n.triggerType === 'RecordAfterSave'  && n.object === object,
  };

  return BLOCK_ORDER.map(block => {
    if (block.system) return { ...block, steps: [], isSystem: true };
    const matcher   = blockMatchers[block.id];
    const entryNodes = matcher ? nodes.filter(matcher) : [];
    const steps = entryNodes.flatMap(n => traverse(n, 0, 'entry', false, null, new Set()));
    return { ...block, steps, isEmpty: steps.length === 0 };
  });
}

// ── Step renderer ─────────────────────────────────────────────────────────────
let globalStepNum = 0;

function StepRow({ step, selected, onSelect, isLast }) {
  const col     = TYPE_COLOR[step.type] || C.muted;
  const isSel   = selected?.name === step.name;
  const indent  = step.depth * 24;

  // Async boundary divider before this step
  const asyncInfo = step.asyncBoundary ? ASYNC_STYLES[step.asyncBoundary] : null;

  globalStepNum++;
  const num = globalStepNum;

  return (
    <>
      {asyncInfo && (
        <div style={{
          marginLeft: indent + 8, marginTop: 8, marginBottom: 8,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1, height: 1, background: `${asyncInfo.col}40` }} />
          <span style={{ color: asyncInfo.col, fontSize: 10, fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap' }}>
            {asyncInfo.label}
          </span>
          <div style={{ flex: 1, height: 1, background: `${asyncInfo.col}40` }} />
        </div>
      )}

      <div
        onClick={() => !step.isCycle && onSelect(isSel ? null : step.node)}
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '7px 16px 7px 0',
          paddingLeft: indent + 16,
          background: isSel ? `${col}12` : 'transparent',
          borderLeft: isSel ? `3px solid ${col}` : '3px solid transparent',
          cursor: step.isCycle ? 'default' : 'pointer',
          transition: 'background 0.1s',
          opacity: step.isCycle ? 0.5 : 1,
        }}
        onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = `${C.border}28`; }}
        onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? `${col}12` : 'transparent'; }}
      >
        {/* Step number */}
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted,
          minWidth: 24, textAlign: 'right', paddingTop: 1, flexShrink: 0,
        }}>
          {num}
        </span>

        {/* Tree connector */}
        {step.depth > 0 && (
          <span style={{ color: C.border2, fontSize: 12, flexShrink: 0, paddingTop: 1 }}>
            {isLast ? '└─' : '├─'}
          </span>
        )}

        {/* Type badge */}
        <span style={{
          background: `${col}18`, color: col,
          padding: '1px 7px', borderRadius: 4,
          fontSize: 10, fontWeight: 700,
          border: `1px solid ${col}28`,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {TYPE_ICON[step.type]} {step.type}
        </span>

        {/* Name */}
        <span style={{
          color: isSel ? C.text : C.muted2,
          fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: isSel ? 700 : 400,
          flex: 1, wordBreak: 'break-all',
        }}>
          {step.name}
        </span>

        {/* Annotation */}
        {step.annotation && (
          <span style={{
            color: step.inferred ? C.warning : C.muted,
            fontFamily: 'JetBrains Mono', fontSize: 10,
            whiteSpace: 'nowrap', flexShrink: 0,
            paddingTop: 1,
          }}>
            {step.annotation}
          </span>
        )}

        {/* Inferred badge */}
        {step.inferred && !step.annotation?.includes('inferred') && (
          <span style={{ color: C.warning, fontSize: 9, flexShrink: 0 }}>⚠</span>
        )}
      </div>

      {/* Recurse into children */}
      {step.children.map((child, i) => (
        <StepRow
          key={child.id}
          step={child}
          selected={selected}
          onSelect={onSelect}
          isLast={i === step.children.length - 1}
        />
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ChainView({ nodes, edges, selected, onSelect }) {
  const [object, setObject] = useState('');
  const [event,  setEvent]  = useState('after update');
  const [showSystem, setShowSystem] = useState(false);

  // All unique objects with automations
  const objectOptions = useMemo(() => {
    const objs = new Set(
      nodes
        .filter(n => n.type === 'Trigger' || n.type === 'Flow')
        .map(n => n.object)
        .filter(Boolean)
    );
    return [...objs].sort();
  }, [nodes]);

  const focusObject = object || objectOptions[0] || '';

  const blocks = useMemo(() => {
    if (!focusObject) return [];
    return buildChain(nodes, edges, focusObject, event);
  }, [nodes, edges, focusObject, event]);

  const hasAnySteps = blocks.some(b => !b.isSystem && !b.isEmpty);

  // Count total steps for display
  function countSteps(steps) {
    return steps.reduce((acc, s) => acc + 1 + countSteps(s.children), 0);
  }
  const totalSteps = blocks.reduce((acc, b) => acc + countSteps(b.steps), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: C.panel, flexShrink: 0,
      }}>
        {/* Object picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted }}>Object:</span>
          <select
            value={focusObject}
            onChange={e => setObject(e.target.value)}
            style={{
              background: C.bg, border: `1px solid ${C.border2}`, color: C.text,
              padding: '5px 10px', borderRadius: 6, fontFamily: 'JetBrains Mono',
              fontSize: 12, outline: 'none', cursor: 'pointer',
            }}>
            {objectOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* Event picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted }}>Event:</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {EVENTS.map(ev => (
              <button key={ev} onClick={() => setEvent(ev)}
                style={{
                  background: event === ev ? C.accent2 : C.panel2,
                  color:      event === ev ? C.bg : C.muted,
                  border:     `1px solid ${event === ev ? C.accent2 : C.border}`,
                  padding: '4px 10px', borderRadius: 5,
                  fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                }}>
                {ev}
              </button>
            ))}
          </div>
        </div>

        {/* Show/hide system blocks */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginLeft: 'auto' }}>
          <input type="checkbox" checked={showSystem} onChange={e => setShowSystem(e.target.checked)}
            style={{ accentColor: C.muted }} />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted }}>
            Show system blocks
          </span>
        </label>

        {totalSteps > 0 && (
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>
            <span style={{ color: C.text, fontWeight: 700 }}>{totalSteps}</span> steps
          </span>
        )}
      </div>

      {/* ── Chain ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', background: C.bg }}>
        {!hasAnySteps && focusObject && (
          <div style={{ textAlign: 'center', color: C.muted, padding: 60, fontFamily: 'JetBrains Mono', fontSize: 13 }}>
            No automations found for <span style={{ color: C.accent }}>{focusObject}</span> on <span style={{ color: C.accent2 }}>{event}</span>
            <div style={{ fontSize: 11, marginTop: 8, color: C.muted }}>
              Try a different event or check the Table view for this object.
            </div>
          </div>
        )}

        {blocks.map(block => {
          // Skip empty system blocks unless showSystem
          if (block.isSystem && !showSystem) return null;
          if (!block.isSystem && block.isEmpty && !showSystem) return null;

          const isActive = !block.isSystem && !block.isEmpty;

          return (
            <div key={block.id} style={{ marginBottom: 0 }}>
              {/* Block header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 16px',
                background: isActive ? `${C.border}30` : 'transparent',
                borderTop:  `1px solid ${C.border}`,
                borderBottom: isActive ? `1px solid ${C.border}` : 'none',
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isActive ? C.accent : C.border,
                }} />
                <span style={{
                  fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
                  color: isActive ? C.text : C.muted,
                  letterSpacing: 1, textTransform: 'uppercase',
                }}>
                  {block.label}
                </span>
                {block.isSystem && (
                  <span style={{ fontSize: 9, color: C.muted, fontFamily: 'JetBrains Mono' }}>
                    [system]
                  </span>
                )}
                {block.note && (
                  <span style={{ fontSize: 10, color: C.muted, fontFamily: 'JetBrains Mono', fontStyle: 'italic' }}>
                    — {block.note}
                  </span>
                )}
                {isActive && (
                  <span style={{
                    marginLeft: 'auto', fontFamily: 'JetBrains Mono', fontSize: 10,
                    color: C.accent, fontWeight: 700,
                  }}>
                    {block.steps.length} entry {block.steps.length === 1 ? 'point' : 'points'}
                  </span>
                )}
              </div>

              {/* Steps */}
              {isActive && (
                <div style={{ paddingTop: 4, paddingBottom: 4 }}>
                  {(() => { globalStepNum = 0; return null; })()}
                  {block.steps.map((step, i) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      selected={selected}
                      onSelect={onSelect}
                      isLast={i === block.steps.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Legend ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 16px', borderTop: `1px solid ${C.border}`,
        display: 'flex', gap: 20, flexWrap: 'wrap', background: C.panel, flexShrink: 0,
      }}>
        {[
          ['⚠ inferred', 'DML → Trigger (not explicit in source)', C.warning],
          ['⚠ conditional', 'Entry condition present — may not always fire', C.warning],
          ['🔄 cycle', 'Already visited — recursion stopped', C.muted],
          ['── async ──', 'Transaction boundary — new execution context', C.accent5],
        ].map(([label, title, col]) => (
          <span key={label} title={title} style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: col, cursor: 'help' }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
