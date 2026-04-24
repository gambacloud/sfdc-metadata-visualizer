import React, { useState, useMemo } from 'react';
import { C, TYPE_COLOR, TYPE_ICON, EDGE_LABELS } from '../constants.js';

const ALL_TYPES = ['Flow', 'Trigger', 'ApexClass', 'CustomObject', 'PlatformEvent', 'LWC', 'Aura'];

// ── Built-in smart filters ────────────────────────────────────────────────────
const SMART_FILTERS = [
  { id: 'all', label: 'All', icon: '∗', fn: () => true },
  {
    id: 'high_connectivity', label: 'High Connectivity', icon: '⚡',
    description: 'Nodes with 5+ edges — likely hotspots',
    fn: (n, edgeMap) => ((edgeMap[n.name]?.out.length || 0) + (edgeMap[n.name]?.in.length || 0)) >= 5,
  },
  {
    id: 'chain_risk', label: 'Chain Risk', icon: '⚠',
    description: 'Has inferred DML→Trigger edges (potential recursion)',
    fn: (n, edgeMap) => edgeMap[n.name]?.out.some(e => e.inferred) || edgeMap[n.name]?.in.some(e => e.inferred),
  },
  {
    id: 'async', label: 'Async / Batch', icon: '⏳',
    description: 'Batch, Queueable, @future, Schedulable',
    fn: (n) => n.isBatch || n.isQueueable || n.isFuture || n.isSchedulable,
  },
  {
    id: 'rest', label: 'REST / Callout', icon: '↗',
    description: 'REST endpoints or outbound callouts',
    fn: (n) => !!n.restResource || (n.callouts?.length > 0),
  },
  {
    id: 'event_driven', label: 'Event Driven', icon: '📡',
    description: 'Publishes or subscribes to Platform Events',
    fn: (n, edgeMap) =>
      n.type === 'PlatformEvent' ||
      edgeMap[n.name]?.out.some(e => e.edgeType === 'event-publish') ||
      edgeMap[n.name]?.in.some(e => e.edgeType === 'event-subscribe'),
  },
  {
    id: 'no_connections', label: 'Isolated', icon: '○',
    description: 'No edges — dead code candidates',
    fn: (n, edgeMap) => !edgeMap[n.name] || (edgeMap[n.name].out.length + edgeMap[n.name].in.length === 0),
  },
  {
    id: 'trigger_handlers', label: 'Trigger Handlers', icon: '{}',
    description: 'Classes extending TriggerHandler',
    fn: (n) => n.isTriggerHandler,
  },
  {
    id: 'invocable', label: 'Invocable Apex', icon: '⚙',
    description: '@InvocableMethod — called from Flows',
    fn: (n) => n.isInvocable,
  },
  {
    id: 'screen_flows', label: 'Screen Flows', icon: '🖥',
    description: 'User-facing screen flows',
    fn: (n) => n.type === 'Flow' && n.processType === 'Flow',
  },
  {
    id: 'record_flows', label: 'Record Flows', icon: '⚡',
    description: 'Record-triggered automation flows',
    fn: (n) => n.type === 'Flow' && n.processType !== 'Flow',
  },
  {
    id: 'has_formulas', label: 'Has Formulas', icon: 'ƒ',
    description: 'Objects with formula fields or Flows with formula variables',
    fn: (n) => (n.formulaFields?.length > 0) || (n.formulas?.length > 0),
  },
  {
    id: 'cross_object_formula', label: 'Cross-Object Formula', icon: '↗ƒ',
    description: 'Objects whose formula fields reference other objects (hidden dependencies)',
    fn: (n) => n.formulaFields?.some(ff => ff.crossObjectRefs?.length > 0),
  },
];

export default function TableView({ nodes, edges, selected, onSelect, typeFilters }) {
  const [search,       setSearch]      = useState('');
  const [smartFilter,  setSmartFilter] = useState('all');
  const [objectFilter, setObjectFilter]= useState('');
  const [sortBy,       setSortBy]      = useState('type');
  const [sortDir,      setSortDir]     = useState(1);
  const [sidebarOpen,  setSidebarOpen] = useState(true);

  const edgeMap = useMemo(() => {
    const m = {};
    edges.forEach(e => {
      if (!m[e.from]) m[e.from] = { out: [], in: [] };
      if (!m[e.to])   m[e.to]   = { out: [], in: [] };
      m[e.from].out.push(e);
      m[e.to].in.push(e);
    });
    return m;
  }, [edges]);

  const allObjects = useMemo(() => {
    const objs = new Set(nodes.map(n => n.object).filter(Boolean));
    return [...objs].sort();
  }, [nodes]);

  const smartCounts = useMemo(() => {
    const counts = {};
    SMART_FILTERS.forEach(sf => { counts[sf.id] = nodes.filter(n => sf.fn(n, edgeMap)).length; });
    return counts;
  }, [nodes, edgeMap]);

  const filtered = useMemo(() => {
    const q  = search.toLowerCase();
    const sf = SMART_FILTERS.find(f => f.id === smartFilter) || SMART_FILTERS[0];
    return nodes
      .filter(n => typeFilters.size === 0 || typeFilters.has(n.type))
      .filter(n => sf.fn(n, edgeMap))
      .filter(n => !objectFilter || n.object === objectFilter)
      .filter(n =>
        !q ||
        n.name.toLowerCase().includes(q) ||
        (n.object || '').toLowerCase().includes(q) ||
        (n.label  || '').toLowerCase().includes(q) ||
        (n.type   || '').toLowerCase().includes(q) ||
        n.events?.some(ev => ev.toLowerCase().includes(q)) ||
        n.classCalls?.some(c => c.toLowerCase().includes(q)) ||
        n.dmlObjects?.some(o => o.toLowerCase().includes(q)) ||
        n.formulaFields?.some(ff => ff.expression?.toLowerCase().includes(q))
      )
      .sort((a, b) => {
        if (sortBy === 'edges') {
          const va = (edgeMap[a.name]?.out.length || 0) + (edgeMap[a.name]?.in.length || 0);
          const vb = (edgeMap[b.name]?.out.length || 0) + (edgeMap[b.name]?.in.length || 0);
          return (vb - va) * sortDir;
        }
        const va = (a[sortBy] || '').toString().toLowerCase();
        const vb = (b[sortBy] || '').toString().toLowerCase();
        return va < vb ? -sortDir : va > vb ? sortDir : 0;
      });
  }, [nodes, search, smartFilter, objectFilter, sortBy, sortDir, typeFilters, edgeMap]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => -d);
    else { setSortBy(col); setSortDir(col === 'edges' ? -1 : 1); }
  };

  const Th = ({ id, label, style = {} }) => (
    <th onClick={() => toggleSort(id)} style={{
      padding: '9px 12px', textAlign: 'left', whiteSpace: 'nowrap',
      color: sortBy === id ? C.accent : C.muted,
      fontWeight: 600, fontSize: 10, letterSpacing: 1,
      textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', ...style,
    }}>
      {label}{sortBy === id ? (sortDir > 0 ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

      {/* ── Filter Sidebar ─────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div style={{
          width: 220, flexShrink: 0,
          background: C.panel, borderRight: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700 }}>
              Filters
            </span>
            <button onClick={() => setSidebarOpen(false)}
              style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>
              ‹
            </button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
            <div style={{ padding: '4px 14px 8px', fontFamily: 'JetBrains Mono', fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Smart Filters
            </div>
            {SMART_FILTERS.map(sf => {
              const active = smartFilter === sf.id;
              const count  = smartCounts[sf.id];
              if (count === 0 && sf.id !== 'all') return null;
              return (
                <button key={sf.id} onClick={() => setSmartFilter(sf.id)}
                  title={sf.description}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '7px 14px', background: active ? `${C.accent}15` : 'transparent',
                    border: 'none', borderLeft: `3px solid ${active ? C.accent : 'transparent'}`,
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <span style={{ fontSize: 12, width: 16, textAlign: 'center', flexShrink: 0 }}>{sf.icon}</span>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: active ? C.accent : C.muted2, flex: 1 }}>
                    {sf.label}
                  </span>
                  <span style={{
                    fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
                    color: active ? C.accent : C.muted,
                    background: active ? `${C.accent}20` : C.bg,
                    padding: '1px 6px', borderRadius: 4,
                  }}>
                    {count}
                  </span>
                </button>
              );
            })}

            {allObjects.length > 0 && (
              <>
                <div style={{ padding: '12px 14px 6px', fontFamily: 'JetBrains Mono', fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                  By Object
                </div>
                <button onClick={() => setObjectFilter('')}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 14px', background: !objectFilter ? `${C.accent4}15` : 'transparent',
                    border: 'none', borderLeft: `3px solid ${!objectFilter ? C.accent4 : 'transparent'}`,
                    cursor: 'pointer',
                  }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: !objectFilter ? C.accent4 : C.muted }}>All objects</span>
                </button>
                {allObjects.map(obj => (
                  <button key={obj} onClick={() => setObjectFilter(obj === objectFilter ? '' : obj)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 14px', background: objectFilter === obj ? `${C.accent4}15` : 'transparent',
                      border: 'none', borderLeft: `3px solid ${objectFilter === obj ? C.accent4 : 'transparent'}`,
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: objectFilter === obj ? C.accent4 : C.muted2 }}>
                      🗄 {obj}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>

          {(smartFilter !== 'all' || objectFilter) && (
            <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}` }}>
              <button onClick={() => { setSmartFilter('all'); setObjectFilter(''); }}
                style={{
                  width: '100%', background: `${C.danger}15`, border: `1px solid ${C.danger}30`,
                  color: C.danger, padding: '5px 10px', borderRadius: 5,
                  fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, cursor: 'pointer',
                }}>
                ✕ Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Main table ───────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{
          padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', gap: 8, alignItems: 'center', background: C.panel, flexShrink: 0,
        }}>
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)}
              style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.muted, padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              ›
            </button>
          )}
          <input
            placeholder="🔍  Search name, object, label, DML, formula expression..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, background: C.bg, border: `1px solid ${C.border}`,
              color: C.text, padding: '7px 14px', borderRadius: 6,
              fontSize: 12, fontFamily: 'JetBrains Mono', outline: 'none',
            }}
          />
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>
            <span style={{ color: C.text, fontWeight: 700 }}>{filtered.length}</span> / {nodes.length}
          </span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'JetBrains Mono' }}>
            <thead style={{ position: 'sticky', top: 0, background: C.panel, zIndex: 2 }}>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <Th id="type"   label="Type"    />
                <Th id="name"   label="Name"    />
                <Th id="object" label="Object"  />
                <Th id="events" label="Context" />
                <Th id="edges"  label="Edges ↓" style={{ textAlign: 'center' }} />
                <th style={{ padding: '9px 12px', color: C.muted, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', textAlign: 'left' }}>Flags</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(n => {
                const col   = TYPE_COLOR[n.type] || C.muted;
                const isSel = selected?.name === n.name;
                const rels  = edgeMap[n.name] || { out: [], in: [] };
                const total = rels.out.length + rels.in.length;
                const flags = getFlags(n, rels);
                return (
                  <tr key={n.name}
                    onClick={() => onSelect(isSel ? null : n)}
                    style={{ borderBottom: `1px solid ${C.border}`, background: isSel ? `${col}12` : 'transparent', cursor: 'pointer' }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = `${C.border}28`; }}
                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ background: `${col}18`, color: col, padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, border: `1px solid ${col}28` }}>
                        {TYPE_ICON[n.type]} {n.type}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: C.text, fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.name}
                    </td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      {n.object ? <span style={{ color: C.accent4, fontSize: 11 }}>🗄 {n.object}</span> : <span style={{ color: C.muted }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px', color: C.muted, fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.events?.join(', ') || n.triggerType || n.processType || n.recTrigType || '—'}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      {total > 0
                        ? <span style={{ fontWeight: 700, color: total >= 8 ? C.danger : total >= 5 ? C.warning : C.muted2, fontSize: 12 }}>
                            {total}
                            <span style={{ color: C.muted, fontWeight: 400, fontSize: 9 }}> ({rels.out.length}↑{rels.in.length}↓)</span>
                          </span>
                        : <span style={{ color: C.muted }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {flags.map(f => (
                          <span key={f.label} title={f.title} style={{
                            background: `${f.col}18`, color: f.col,
                            padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                            border: `1px solid ${f.col}28`, whiteSpace: 'nowrap',
                          }}>
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', color: C.muted, padding: 60, fontFamily: 'JetBrains Mono', fontSize: 13 }}>
              No results
              {(smartFilter !== 'all' || objectFilter || search) && (
                <div style={{ marginTop: 10, fontSize: 11 }}>
                  <button onClick={() => { setSmartFilter('all'); setObjectFilter(''); setSearch(''); }}
                    style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 11 }}>
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getFlags(n, rels) {
  const flags = [];
  const totalEdges  = rels.out.length + rels.in.length;
  const hasInferred = rels.out.some(e => e.inferred) || rels.in.some(e => e.inferred);
  const hasCrossObjFormula = n.formulaFields?.some(ff => ff.crossObjectRefs?.length > 0);

  if (totalEdges >= 8)       flags.push({ label: '🔥 Hub',         col: C.danger,   title: `${totalEdges} total edges` });
  if (hasInferred)            flags.push({ label: '⚠ DML Chain',   col: '#f59e0b',  title: 'Has inferred DML→Trigger edge' });
  if (n.isBatch)              flags.push({ label: 'Batch',          col: '#7c3aed',  title: 'Database.Batchable' });
  if (n.isQueueable)          flags.push({ label: 'Queueable',      col: '#7c3aed',  title: 'Queueable' });
  if (n.isSchedulable)        flags.push({ label: 'Scheduled',      col: '#7c3aed',  title: 'Schedulable' });
  if (n.isFuture)             flags.push({ label: '@future',        col: '#7c3aed',  title: '@future method' });
  if (n.isInvocable)          flags.push({ label: 'Invocable',      col: '#00d4ff',  title: '@InvocableMethod' });
  if (n.restResource)         flags.push({ label: 'REST',           col: '#10b981',  title: n.restResource });
  if (n.callouts?.length)     flags.push({ label: 'Callout',        col: '#f59e0b',  title: n.callouts.join(', ') });
  if (n.publishes?.length)    flags.push({ label: '📡 Event',       col: '#f59e0b',  title: `Publishes: ${n.publishes.join(', ')}` });
  if (n.isTriggerHandler)     flags.push({ label: 'Handler',        col: '#ff6b35',  title: `extends ${n.extendsClass}` });
  if (n.processType === 'Flow') flags.push({ label: 'Screen',       col: '#ec4899',  title: 'User-facing screen flow' });
  if (n.formulas?.length)     flags.push({ label: `ƒ ${n.formulas.length} Flow Formula${n.formulas.length > 1 ? 's' : ''}`, col: '#a78bfa', title: 'Has flow formula variables' });
  if (n.formulaFields?.length)flags.push({ label: `ƒ ${n.formulaFields.length} Formula Field${n.formulaFields.length > 1 ? 's' : ''}`, col: '#a78bfa', title: 'Has formula fields' });
  if (hasCrossObjFormula)     flags.push({ label: '↗ƒ Cross-Obj',  col: '#f59e0b',  title: 'Formula references another object' });
  if (totalEdges === 0)       flags.push({ label: 'Isolated',       col: '#64748b',  title: 'No connections found' });

  return flags;
}
