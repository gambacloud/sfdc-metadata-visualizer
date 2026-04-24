import React, { useState } from 'react';
import { C, TYPE_COLOR, TYPE_ICON, EDGE_LABELS, EDGE_COLOR } from '../constants.js';

export default function DetailPanel({ node, edges, allNodes, onClose, onNavigate }) {
  if (!node) return null;

  const col     = TYPE_COLOR[node.type] || C.muted;
  const outEdges= edges.filter(e => e.from === node.name);
  const inEdges = edges.filter(e => e.to   === node.name);
  const nodeMap = Object.fromEntries(allNodes.map(n => [n.name, n]));

  return (
    <div style={{
      width: 340, flexShrink: 0,
      background: C.panel, borderLeft: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 18px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        background: `${col}0c`, flexShrink: 0,
      }}>
        <div>
          <div style={{ color: col, fontWeight: 800, fontSize: 12, fontFamily: 'JetBrains Mono', letterSpacing: 1 }}>
            {TYPE_ICON[node.type]}  {node.type.toUpperCase()}
          </div>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 15, marginTop: 6, wordBreak: 'break-all', lineHeight: 1.3 }}>
            {node.name}
          </div>
          {node.label && node.label !== node.name && (
            <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>{node.label}</div>
          )}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: C.muted,
          fontSize: 18, cursor: 'pointer', padding: '0 0 0 8px', lineHeight: 1, flexShrink: 0,
        }}>✕</button>
      </div>

      <div style={{ padding: '14px 18px', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Core metadata */}
        <Section title="Metadata">
          {[
            ['Object',        node.object],
            ['Trigger Type',  node.triggerType],
            ['Rec Trigger',   node.recTrigType],
            ['Process Type',  node.processType],
            ['Status',        node.status],
            ['Events',        node.events?.join(', ')],
            ['Extends',       node.extendsClass],
            ['REST Endpoint', node.restResource],
            ['REST Methods',  node.restMethods?.join(', ')],
            ['DML Objects',   (node.dmlObjects || []).join(', ')],
            ['Callouts',      node.callouts?.join(', ')],
            ['Publishes',     node.publishes?.join(', ')],
          ].filter(([, v]) => v).map(([k, v]) => <Row key={k} label={k} value={v} />)}
        </Section>

        {/* DML verbs breakdown */}
        {node.dmlVerbs && Object.keys(node.dmlVerbs).length > 0 && (
          <Section title="DML Operations">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Object.entries(node.dmlVerbs).map(([verb, count]) => (
                <span key={verb} style={{
                  background: `${C.accent2}18`, color: C.accent2,
                  border: `1px solid ${C.accent2}28`,
                  padding: '2px 8px', borderRadius: 4,
                  fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
                }}>
                  {verb} ×{count}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Badges */}
        <Badges node={node} col={col} />

        {/* ── Feature 1 & 2: Flow Formulas ─────────────────────────────────── */}
        {node.formulas?.length > 0 && (
          <Section title={`Flow Formulas (${node.formulas.length})`}>
            {node.formulas.map((f, i) => (
              <FormulaCard key={i} formula={f} accentCol={C.formula} />
            ))}
          </Section>
        )}

        {/* Flow formula field refs summary */}
        {node.formulaFieldRefs?.length > 0 && (
          <Section title="Fields Referenced by Formulas">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {node.formulaFieldRefs.map(f => (
                <span key={f} style={{
                  background: `${C.formula}15`, color: C.formula,
                  border: `1px solid ${C.formula}25`,
                  padding: '2px 7px', borderRadius: 4,
                  fontFamily: 'JetBrains Mono', fontSize: 10,
                }}>
                  {f}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* ── Feature 3 & 4: Formula Fields on Custom Objects ──────────────── */}
        {node.formulaFields?.length > 0 && (
          <Section title={`Formula Fields (${node.formulaFields.length})`}>
            {node.formulaFields.map((ff, i) => (
              <FormulaFieldCard key={i} ff={ff} />
            ))}
          </Section>
        )}

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

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div>
      <div style={{
        fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: 1.5,
        textTransform: 'uppercase', marginBottom: 8, fontFamily: 'JetBrains Mono',
      }}>
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
  const target = direction === 'out' ? edge.to : edge.from;
  const tNode  = nodeMap[target];
  const col    = edge.inferred ? C.warning
               : edge.edgeType === 'formula-ref' ? C.formula
               : edge.external ? C.muted
               : (EDGE_COLOR[edge.edgeType] || C.muted);
  const tCol   = tNode ? (TYPE_COLOR[tNode.type] || C.muted) : C.muted;

  return (
    <div onClick={() => tNode && onNavigate(tNode)}
      style={{
        background: `${col}0e`, border: `1px solid ${col}25`,
        borderRadius: 6, padding: '7px 10px', marginBottom: 5,
        cursor: tNode ? 'pointer' : 'default',
      }}
      onMouseEnter={e => tNode && (e.currentTarget.style.background = `${col}1e`)}
      onMouseLeave={e => (e.currentTarget.style.background = `${col}0e`)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        {tNode && <span style={{ color: tCol, fontSize: 10 }}>{TYPE_ICON[tNode.type]}</span>}
        <span style={{ color: C.text, fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 600, wordBreak: 'break-all' }}>
          {target}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: col, fontSize: 9, fontFamily: 'JetBrains Mono' }}>
          {EDGE_LABELS[edge.edgeType] || edge.edgeType}
        </span>
        {edge.inferred  && <span style={{ color: C.warning, fontSize: 9 }}>⚠ inferred</span>}
        {edge.external  && <span style={{ color: C.muted,   fontSize: 9 }}>↗ external</span>}
        {edge.viaObject && <span style={{ color: C.muted,   fontSize: 9 }}>via {edge.viaObject}</span>}
        {edge.viaField  && <span style={{ color: C.formula, fontSize: 9 }}>via {edge.viaField}</span>}
      </div>
    </div>
  );
}

// Feature 1 & 2 — Flow formula card
function FormulaCard({ formula, accentCol }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: `${accentCol}0c`, border: `1px solid ${accentCol}25`,
      borderRadius: 6, marginBottom: 6, overflow: 'hidden',
    }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ padding: '7px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: accentCol, fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700 }}>
          ƒ {formula.name}
        </span>
        <span style={{ color: C.muted, fontSize: 10 }}>
          {formula.dataType} {open ? '▲' : '▼'}
        </span>
      </div>
      {open && (
        <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${accentCol}20` }}>
          {/* Expression */}
          <div style={{
            background: C.bg, borderRadius: 4, padding: '6px 8px', marginTop: 8,
            fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted2,
            wordBreak: 'break-all', lineHeight: 1.6,
          }}>
            {formula.expression}
          </div>
          {/* Field refs */}
          {formula.fieldRefs?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, fontFamily: 'JetBrains Mono', letterSpacing: 1 }}>
                FIELD REFERENCES
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {formula.fieldRefs.map((r, i) => (
                  <span key={i} style={{
                    background: `${accentCol}15`, color: accentCol,
                    padding: '1px 6px', borderRadius: 3,
                    fontFamily: 'JetBrains Mono', fontSize: 9,
                  }}>
                    {r.prefix}.{r.field}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Used in decisions */}
          {formula.usedInDecisions?.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 10, color: C.muted, fontFamily: 'JetBrains Mono' }}>
              Used in: {formula.usedInDecisions.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Feature 3 & 4 — Custom Object formula field card
function FormulaFieldCard({ ff }) {
  const [open, setOpen] = useState(false);
  const col = C.formula;
  return (
    <div style={{
      background: `${col}0c`, border: `1px solid ${col}25`,
      borderRadius: 6, marginBottom: 6, overflow: 'hidden',
    }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ padding: '7px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: col, fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700 }}>
          ƒ {ff.fieldName}
        </span>
        <span style={{ color: C.muted, fontSize: 10 }}>
          {ff.returnType || 'Formula'} {open ? '▲' : '▼'}
        </span>
      </div>
      {open && (
        <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${col}20` }}>
          {ff.label && ff.label !== ff.fieldName && (
            <div style={{ color: C.muted, fontSize: 10, marginTop: 6, fontFamily: 'JetBrains Mono' }}>{ff.label}</div>
          )}
          {/* Expression */}
          <div style={{
            background: C.bg, borderRadius: 4, padding: '6px 8px', marginTop: 8,
            fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted2,
            wordBreak: 'break-all', lineHeight: 1.6,
          }}>
            {ff.expression}
          </div>
          {/* Cross-object refs (Feature 5) */}
          {ff.crossObjectRefs?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, fontFamily: 'JetBrains Mono', letterSpacing: 1 }}>
                CROSS-OBJECT REFS
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {ff.crossObjectRefs.map((r, i) => (
                  <span key={i} style={{
                    background: `${C.warning}15`, color: C.warning,
                    padding: '1px 6px', borderRadius: 3,
                    fontFamily: 'JetBrains Mono', fontSize: 9,
                  }}>
                    {r.objectRef}.{r.field}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Same-object field refs */}
          {ff.sameObjectRefs?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, fontFamily: 'JetBrains Mono', letterSpacing: 1 }}>
                SAME-OBJECT REFS
              </div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {ff.sameObjectRefs.map((f, i) => (
                  <span key={i} style={{
                    background: `${col}15`, color: col,
                    padding: '1px 6px', borderRadius: 3,
                    fontFamily: 'JetBrains Mono', fontSize: 9,
                  }}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Badges({ node }) {
  const badges = [];
  if (node.isBatch)        badges.push(['Batch',            C.accent3]);
  if (node.isQueueable)    badges.push(['Queueable',        C.accent3]);
  if (node.isSchedulable)  badges.push(['Schedulable',      C.accent3]);
  if (node.isFuture)       badges.push(['@future',          C.accent3]);
  if (node.isInvocable)    badges.push(['@InvocableMethod', C.accent ]);
  if (node.restResource)   badges.push(['REST Resource',    C.success ]);
  if (node.isTriggerHandler) badges.push(['TriggerHandler', C.accent2]);
  if (node.usesNavigation) badges.push(['NavigationMixin',  C.accent6]);
  if (node.formulaFields?.length > 0) badges.push([`${node.formulaFields.length} Formula Fields`, C.formula]);
  if (node.formulas?.length > 0)      badges.push([`${node.formulas.length} Flow Formulas`,       C.formula]);
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
