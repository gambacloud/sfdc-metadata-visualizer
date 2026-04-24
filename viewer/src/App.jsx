import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { C, TYPE_COLOR, TYPE_ICON } from './constants.js';
import DAGView          from './components/DAGView.jsx';
import ObjectCentricView from './components/ObjectCentricView.jsx';
import TableView        from './components/TableView.jsx';
import DetailPanel      from './components/DetailPanel.jsx';

const ALL_TYPES = ['Flow', 'Trigger', 'ApexClass', 'CustomObject', 'PlatformEvent', 'LWC', 'Aura'];
const VIEWS = [
  { id: 'dag',    label: '⬡ DAG',     title: 'Layered execution flow' },
  { id: 'object', label: '◎ Object',  title: 'Object-centric impact view' },
  { id: 'table',  label: '▤ Table',   title: 'Searchable index' },
];

export default function App() {
  const [graphData,   setGraphData]   = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [view,        setView]        = useState('dag');
  const [selected,    setSelected]    = useState(null);
  const [typeFilters, setTypeFilters] = useState(new Set());

  useEffect(() => {
    fetch('/index.json')
      .then(r => {
        if (!r.ok) throw new Error(
          `HTTP ${r.status} — run the parser first:\n  cd parser && npm install && node index.js --zip ../demo-metadata.zip\nthen copy data/index.json to viewer/public/index.json`
        );
        return r.json();
      })
      .then(data => { setGraphData(data); setLoading(false); })
      .catch(e  => { setError(e.message); setLoading(false); });
  }, []);

  const toggleType = useCallback((type) => {
    setTypeFilters(prev => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    if (!graphData) return null;
    const counts = {};
    ALL_TYPES.forEach(t => (counts[t] = 0));
    graphData.nodes.forEach(n => { if (counts[n.type] !== undefined) counts[n.type]++; });
    return { counts, ...graphData.meta };
  }, [graphData]);

  if (loading) return <LoadingScreen />;
  if (error)   return <ErrorScreen message={error} />;

  const { nodes, edges } = graphData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: C.bg }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: `1px solid ${C.border}`,
        background: C.panel, flexShrink: 0, height: 56,
      }}>
        {/* Logo */}
        <div style={{
          padding: '0 20px', borderRight: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontSize: 18 }}>☁️</span>
          <div>
            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 12, color: C.accent, letterSpacing: 1 }}>SFDC·KB</div>
            <div style={{ fontFamily: 'JetBrains Mono', fontSize: 8,  color: C.muted,  letterSpacing: 2 }}>METADATA VISUALIZER</div>
          </div>
        </div>

        {/* Type filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', flex: 1 }}>
          {ALL_TYPES.map(type => {
            const count  = stats?.counts[type] || 0;
            if (count === 0) return null;
            const col    = TYPE_COLOR[type];
            const active = typeFilters.has(type);
            return (
              <button key={type} onClick={() => toggleType(type)}
                title={`${active ? 'Hide' : 'Show'} ${type}`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '0 16px', height: '100%', flexShrink: 0,
                  background:   active ? `${col}18` : 'transparent',
                  border:       'none',
                  borderBottom: active ? `3px solid ${col}` : '3px solid transparent',
                  borderRight:  `1px solid ${C.border}`,
                  cursor:       'pointer', gap: 1,
                }}>
                <span style={{ fontSize: 14 }}>{TYPE_ICON[type]}</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 13, color: active ? col : C.muted2, lineHeight: 1 }}>{count}</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 8,  color: active ? col : C.muted, letterSpacing: 0.5 }}>{type}</span>
              </button>
            );
          })}
        </div>

        {/* Meta */}
        <div style={{
          padding: '0 16px', borderLeft: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted2 }}>
            <span style={{ color: C.text, fontWeight: 700 }}>{edges.length}</span> edges ·{' '}
            <span style={{ color: C.warning, fontWeight: 700 }}>{edges.filter(e => e.inferred).length}</span> inferred
          </span>
          {stats?.generatedAt && (
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: C.muted }}>
              {new Date(stats.generatedAt).toLocaleString()}
            </span>
          )}
        </div>

        {/* View tabs */}
        <div style={{ display: 'flex', borderLeft: `1px solid ${C.border}`, flexShrink: 0 }}>
          {VIEWS.map(v => (
            <button key={v.id} onClick={() => setView(v.id)} title={v.title}
              style={{
                padding: '0 20px', height: '100%',
                background:   view === v.id ? `${C.accent}15` : 'transparent',
                color:        view === v.id ? C.accent : C.muted,
                border:       'none',
                borderBottom: view === v.id ? `3px solid ${C.accent}` : '3px solid transparent',
                borderLeft:   `1px solid ${C.border}`,
                fontFamily:   'JetBrains Mono', fontWeight: 700, fontSize: 12,
                cursor:       'pointer', flexShrink: 0,
              }}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {view === 'dag' && (
            <DAGView
              nodes={nodes} edges={edges}
              selected={selected} onSelect={setSelected}
              typeFilters={typeFilters}
            />
          )}
          {view === 'object' && (
            <ObjectCentricView
              nodes={nodes} edges={edges}
              selected={selected} onSelect={setSelected}
            />
          )}
          {view === 'table' && (
            <TableView
              nodes={nodes} edges={edges}
              selected={selected} onSelect={setSelected}
              typeFilters={typeFilters}
            />
          )}
        </div>

        {selected && (
          <DetailPanel
            node={selected}
            edges={edges}
            allNodes={nodes}
            onClose={() => setSelected(null)}
            onNavigate={setSelected}
          />
        )}
      </div>
    </div>
  );
}

// ── Screens ───────────────────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, gap: 16 }}>
      <div style={{ fontSize: 36, animation: 'spin 1.2s linear infinite' }}>⚙️</div>
      <div style={{ fontFamily: 'JetBrains Mono', color: C.accent, fontWeight: 700 }}>Loading metadata index...</div>
      <style>{`@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function ErrorScreen({ message }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg, gap: 16, padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 36 }}>⚠️</div>
      <div style={{ fontFamily: 'JetBrains Mono', color: C.danger, fontWeight: 700, fontSize: 15 }}>Could not load index.json</div>
      <pre style={{ fontFamily: 'JetBrains Mono', color: C.muted, fontSize: 11, maxWidth: 580, whiteSpace: 'pre-wrap', lineHeight: 1.8, background: C.panel, padding: 20, borderRadius: 8, border: `1px solid ${C.border}` }}>
        {message}
      </pre>
    </div>
  );
}
