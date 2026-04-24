import React, { useRef, useState, useCallback } from 'react';
import { C, TYPE_COLOR, TYPE_ICON, EDGE_LABELS, EDGE_COLOR } from '../constants.js';
import { useForceLayout } from '../useForceLayout.js';

const W = 1400, H = 700;

export default function GraphView({ nodes, edges, selected, onSelect, typeFilters }) {
  const svgRef = useRef(null);
  const [zoom, setZoom]     = useState(1);
  const [pan, setPan]       = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(null);

  const visibleNodes = nodes.filter(n => typeFilters.size === 0 || typeFilters.has(n.type));
  const visibleNames = new Set(visibleNodes.map(n => n.name));
  const visibleEdges = edges.filter(e => visibleNames.has(e.from) && visibleNames.has(e.to));

  const positions = useForceLayout(visibleNodes, visibleEdges, W, H);

  const selectedEdgeIdxs = selected
    ? new Set(visibleEdges.map((e, i) => (e.from === selected.name || e.to === selected.name) ? i : -1).filter(i => i >= 0))
    : null;

  const onMouseDown = useCallback((e) => {
    if (e.target.closest('.node')) return;
    setDragging({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [pan]);
  const onMouseMove = useCallback((e) => {
    if (!dragging) return;
    setPan({ x: e.clientX - dragging.x, y: e.clientY - dragging.y });
  }, [dragging]);
  const onMouseUp = useCallback(() => setDragging(null), []);
  const onWheel   = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.max(0.25, Math.min(3, z - e.deltaY * 0.001)));
  }, []);

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden', background: C.bg }}>
      {/* Zoom controls */}
      <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[['＋', () => setZoom(z => Math.min(3, z + 0.2))],
          ['－', () => setZoom(z => Math.max(0.25, z - 0.2))],
          ['⌂',  () => { setZoom(1); setPan({ x: 0, y: 0 }); }]
        ].map(([label, fn]) => (
          <button key={label} onClick={fn} style={{
            width: 32, height: 32, background: C.panel2, border: `1px solid ${C.border}`,
            color: C.muted2, borderRadius: 6, fontSize: 14, fontWeight: 700,
          }}>{label}</button>
        ))}
      </div>

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 10, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          [C.muted,    'direct edge',              false],
          [C.warning,  'inferred (DML→Trigger)',   true ],
          [C.external, 'external callout',         true ],
        ].map(([col, lbl, dash]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: C.muted, fontFamily: 'JetBrains Mono' }}>
            <svg width={28} height={10}>
              <line x1={0} y1={5} x2={28} y2={5} stroke={col} strokeWidth={1.5} strokeDasharray={dash ? '4,2' : 'none'} />
            </svg>
            {lbl}
          </div>
        ))}
      </div>

      <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}
        style={{ cursor: dragging ? 'grabbing' : 'grab', display: 'block' }}
        onMouseDown={onMouseDown} onMouseMove={onMouseMove}
        onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}>
        <defs>
          {[...Object.keys(EDGE_COLOR), 'inferred', 'external'].map(type => {
            const col = type === 'inferred' ? C.warning : type === 'external' ? C.external : (EDGE_COLOR[type] || C.muted);
            return (
              <marker key={type} id={`arr-${type}`} markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                <path d="M0,0 L0,6 L8,3 z" fill={col} opacity="0.75" />
              </marker>
            );
          })}
        </defs>

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {/* Edges */}
          {visibleEdges.map((e, i) => {
            const a = positions[e.from], b = positions[e.to];
            if (!a || !b) return null;
            const isHighlit = selectedEdgeIdxs?.has(i);
            const col = e.inferred ? C.warning : e.external ? C.external : (EDGE_COLOR[e.edgeType] || C.muted);
            const opacity = selected ? (isHighlit ? 1 : 0.06) : 0.4;
            const dx = b.x - a.x, dy = b.y - a.y;
            const mx = (a.x + b.x) / 2 - dy * 0.18;
            const my = (a.y + b.y) / 2 + dx * 0.18;
            const markerId = e.inferred ? 'inferred' : e.external ? 'external' : (e.edgeType || 'class-call');

            return (
              <g key={i} opacity={opacity}>
                <path d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                  stroke={col} strokeWidth={isHighlit ? 2 : 1} fill="none"
                  strokeDasharray={e.inferred || e.external ? '5,3' : 'none'}
                  markerEnd={`url(#arr-${markerId})`}
                />
                {isHighlit && (
                  <text x={mx} y={my - 6} fill={col} fontSize={9} textAnchor="middle"
                    fontFamily="JetBrains Mono" fontWeight="600">
                    {EDGE_LABELS[e.edgeType] || e.edgeType}{e.inferred ? ' ⚠' : ''}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {visibleNodes.map(n => {
            const p = positions[n.name];
            if (!p) return null;
            const col     = TYPE_COLOR[n.type] || C.muted;
            const isSel   = selected?.name === n.name;
            const isLinked = selected
              ? visibleEdges.some(e => (e.from === selected.name && e.to === n.name) || (e.to === selected.name && e.from === n.name))
              : false;
            const dimmed  = selected && !isSel && !isLinked;
            const r       = isSel ? 26 : 20;

            return (
              <g key={n.name} className="node" style={{ cursor: 'pointer' }} opacity={dimmed ? 0.15 : 1}
                onClick={() => onSelect(isSel ? null : n)}>
                {isSel && <circle cx={p.x} cy={p.y} r={r + 10} fill={col} opacity={0.12} />}
                {isLinked && !isSel && <circle cx={p.x} cy={p.y} r={r + 5} fill={col} opacity={0.08} />}
                <circle cx={p.x} cy={p.y} r={r}
                  fill={isSel ? col : C.panel2}
                  stroke={col}
                  strokeWidth={isSel ? 3 : isLinked ? 2.5 : 1.5}
                />
                <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle"
                  fontSize={isSel ? 14 : 12} fill={isSel ? C.bg : col}
                  fontWeight="800" fontFamily="JetBrains Mono">
                  {TYPE_ICON[n.type]}
                </text>
                <text x={p.x} y={p.y + r + 14} textAnchor="middle"
                  fontSize={9} fill={isSel ? C.text : isLinked ? C.muted2 : C.muted}
                  fontFamily="JetBrains Mono" fontWeight={isSel ? '700' : '400'}>
                  {n.name.length > 24 ? n.name.slice(0, 22) + '…' : n.name}
                </text>
                {n.object && (
                  <text x={p.x} y={p.y + r + 26} textAnchor="middle"
                    fontSize={8} fill={C.accent} fontFamily="JetBrains Mono" opacity={0.75}>
                    {n.object}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
