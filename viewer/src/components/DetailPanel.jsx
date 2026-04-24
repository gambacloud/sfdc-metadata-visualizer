import React from 'react';
import { C, TYPE_COLOR, TYPE_ICON, EDGE_LABELS, EDGE_COLOR } from '../constants.js';

export default function DetailPanel({ node, edges, allNodes, onClose, onNavigate }) {
  if (!node) return null;

  const col      = TYPE_COLOR[node.type] || C.muted;
  const outEdges = edges.filter(e => e.from === node.name);
  const inEdges  = edges.filter(e => e.to   === node.name);
  const nodeMap  = Object.fromEntries(allNodes.map(n => [n.name, n]));

  return (
    <div style={{
      width: 320, flexShrink: 0,
      background: C.panel, borderLeft: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 18px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        background: `${col}0c`,
      }}>
        <div>
          <div style={{ color: col, fontWeight: 800, fontSize: 13, fontFamily: 'JetBrains Mono', letterSpacing: 1 }}>
            {TYPE_ICON[node.type]}  {node.type.toUpperCase()}
          </div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 15, marginTop: 6, wordBreak: 'break-all', lineHeight: 1.3 }}>
            {node.name}
          </div>
          {node.label && node.label !== node.name && (
            <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>{node.label}</div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: C.muted, fontSize: 18,
          cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1, flexShrink: 0,
        }}>✕</button>
      </div>

      <div style={{ padding: '14px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Core metadata */}
        <Section title="Metadata">
          {[
            ['Object',         node.object],
            ['Trigger Type',   node.triggerType],
            ['Rec Trigger',    node.recTrigType],
            ['Process Type',   node.processType],
            ['Status',         node.status],
            ['Events',         node.events?.join(', ')],
            ['Extends',        node.extendsClass],
            ['REST Endpoint',  node.restResource],
            ['REST Methods',   node.restMethods?.join(', ')],
            ['DML Objects',    (node.dmlObjects || node.touchedObjects || []).join(', ')],
            ['Callouts',       node.callouts?.join(', ')],
            ['Publishes',      node.publishes?.join(', ')],
          ].filter(([, v]) => v).map(([k, v]) => (
            <Row key={k} label={k} value={v} />
          ))}
        </Section>

        {/* Badges */}
        <Badges node={node} col={col} />

        {/* Outgoing edges */}
        {outEdges.length > 0 && (
          <Section title={`Outgoing (${outEdges.length})`}>
            {outEdges.map((e, i) => (
              <EdgeRow key={i} edge={e} direction="out" nodeMap={nodeMap} onNavigate={onNavigate} />
            ))}
          </Section>
        )}

        {/* Incoming edges */}
        {inEdges.length > 0 && (
          <Section title={`Incoming (${inEdges.length})`}>
            {inEdges.map((e, i) => (
              <EdgeRow key={i} edge={e} direction="in" nodeMap={nodeMap} onNavigate={onNavigate} />
            ))}
          </Section>
        )}

        {/* Entry conditions (Flows) */}
        {node.entryFilters?.length > 0 && (
          <Section title="Entry Conditions">
            {node.entryFilters.map((f, i) => (
              <div key={i} style={{ fontSize: 11, color: C.muted2, fontFamily: 'JetBrains Mono', marginBottom: 4 }}>
                <span style={{ color: C.accent }}>{f.field}</span>
                <span style={{ color: C.muted }}> {f.operator} </span>
                <span style={{ color: C.text }}>{f.value}</span>
              </div>
            ))}
          </Section>
        )}

        {/* Override methods (TriggerHandlers) */}
        {node.overrides?.length > 0 && (
          <Section title="Overrides">
            {node.overrides.map(o => (
              <div key={o} style={{ fontSize: 11, color: C.accent2, fontFamily: 'JetBrains Mono', marginBottom: 3 }}>
                {o}()
              </div>
            ))}
          </Section>
        )}

        {/* Apex imports (LWC) */}
        {node.apexImports?.length > 0 && (
          <Section title="Apex Wire Imports">
            {node.apexImports.map((imp, i) => (
              <div key={i} style={{ fontSize: 11, color: C.muted2, fontFamily: 'JetBrains Mono', marginBottom: 3 }}>
                <span style={{ color: C.accent3 }}>{imp.class}</span>
                {imp.method && <span style={{ color: C.muted }}>.{imp.method}</span>}
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.muted, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'JetBrains Mono' }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: C.muted, fontFamily: 'JetBrains Mono' }}>{label}: </span>
      <span style={{ fontSize: 11, color: C.text, fontFamily: 'JetBrains Mono', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

function EdgeRow({ edge, direction, nodeMap, onNavigate }) {
  const target  = direction === 'out' ? edge.to   : edge.from;
  const tNode   = nodeMap[target];
  const col     = edge.inferred ? C.warning : edge.external ? C.muted : (EDGE_COLOR[edge.edgeType] || C.muted);
  const tCol    = tNode ? (TYPE_COLOR[tNode.type] || C.muted) : C.muted;

  return (
    <div onClick={() => tNode && onNavigate(tNode)}
      style={{
        background: `${col}0e`, border: `1px solid ${col}25`,
        borderRadius: 6, padding: '7px 10px', marginBottom: 5,
        cursor: tNode ? 'pointer' : 'default',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => tNode && (e.currentTarget.style.background = `${col}1e`)}
      onMouseLeave={e => e.currentTarget.style.background = `${col}0e`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        {tNode && <span style={{ color: tCol, fontSize: 10 }}>{TYPE_ICON[tNode.type]}</span>}
        <span style={{ color: C.text, fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 600, wordBreak: 'break-all' }}>
          {target}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ color: col, fontSize: 9, fontFamily: 'JetBrains Mono' }}>
          {EDGE_LABELS[edge.edgeType] || edge.edgeType}
        </span>
        {edge.inferred && <span style={{ color: C.warning, fontSize: 9 }}>⚠ inferred</span>}
        {edge.external && <span style={{ color: C.muted,   fontSize: 9 }}>↗ external</span>}
        {edge.viaObject && <span style={{ color: C.muted, fontSize: 9 }}>via {edge.viaObject}</span>}
      </div>
    </div>
  );
}

function Badges({ node }) {
  const badges = [];
  if (node.isBatch)       badges.push(['Batch',           C.accent3]);
  if (node.isQueueable)   badges.push(['Queueable',       C.accent3]);
  if (node.isSchedulable) badges.push(['Schedulable',     C.accent3]);
  if (node.isFuture)      badges.push(['@future',         C.accent3]);
  if (node.isInvocable)   badges.push(['@InvocableMethod',C.accent ]);
  if (node.restResource)  badges.push(['REST Resource',   C.success ]);
  if (node.isTriggerHandler) badges.push(['TriggerHandler', C.accent2]);
  if (node.usesNavigation)badges.push(['NavigationMixin', C.accent6]);
  if (badges.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {badges.map(([label, col]) => (
        <span key={label} style={{
          background: `${col}18`, color: col, padding: '3px 8px',
          borderRadius: 4, fontSize: 10, fontWeight: 700,
          border: `1px solid ${col}30`, fontFamily: 'JetBrains Mono',
        }}>
          {label}
        </span>
      ))}
    </div>
  );
}
