import React, { useMemo, useState } from 'react';
import { C, TYPE_COLOR, TYPE_ICON, EDGE_LABELS, EDGE_COLOR } from '../constants.js';

/**
 * Layered DAG View
 * Arranges nodes in fixed swim-lanes by type, left→right execution order.
 * Edges rendered as curved SVG paths between lanes.
 *
 * Lane order (left → right = typical execution flow):
 *   LWC / Aura  →  Screen Flow  →  Record Flow  →  Trigger  →  ApexClass  →  PlatformEvent  →  Batch/Queueable  →  CustomObject
 */

const LANES = [
  { key: 'ui',       label: 'UI Layer',        types: ['LWC', 'Aura'],                           color: '#ec4899' },
  { key: 'screen',   label: 'Screen Flows',     types: ['Flow'],  filter: n => n.processType === 'Flow', color: '#00d4ff' },
  { key: 'rflow',    label: 'Record Flows',     types: ['Flow'],  filter: n => n.processType !== 'Flow', color: '#06b6d4' },
  { key: 'trigger',  label: 'Triggers',         types: ['Trigger'],                               color: '#ff6b35' },
  { key: 'apex',     label: 'Apex Classes',     types: ['ApexClass'],                             color: '#7c3aed' },
  { key: 'event',    label: 'Platform Events',  types: ['PlatformEvent'],                         color: '#f59e0b' },
  { key: 'async',    label: 'Async / Batch',    types: ['ApexClass'], filter: n => n.isBatch || n.isQueueable || n.isSchedulable || n.isFuture, color: '#8b5cf6' },
  { key: 'object',   label: 'Objects',          types: ['CustomObject'],                          color: '#10b981' },
];

const NODE_H = 36;
const NODE_W = 180;
const LANE_PAD_Y = 48;
const LANE_GAP_X = 60;

function assignLanes(nodes) {
  // Build a name→node map for quick lookup
  const byName = {};
  nodes.forEach(n => (byName[n.name] = n));

  // Async classes should go to async lane, not apex
  const asyncNames = new Set(
    nodes.filter(n => n.type === 'ApexClass' && (n.isBatch || n.isQueueable || n.isSchedulable || n.isFuture)).map(n => n.name)
  );

  const result = {};  // lanKey → [node]

  LANES.forEach(lane => {
    result[lane.key] = nodes.filter(n => {
      if (!lane.types.includes(n.type)) return false;
      // Async lane: only async classes
      if (lane.key === 'async') return asyncNames.has(n.name);
      // Apex lane: exclude async classes
      if (lane.key === 'apex') return !asyncNames.has(n.name);
      // Screen flow lane
      if (lane.key === 'screen') return n.processType === 'Flow';
      // Record flow lane
      if (lane.key === 'rflow') return n.processType !== 'Flow';
      return true;
    });
  });

  return result;
}

function layoutLanes(laneMap) {
  // Compute x position per lane (skip empty lanes)
  const activeLanes = LANES.filter(l => laneMap[l.key]?.length > 0);
  const laneX = {};
  let x = 20;
  activeLanes.forEach(lane => {
    laneX[lane.key] = x;
    x += NODE_W + LANE_GAP_X;
  });
  const totalW = x;

  // Compute y positions per node within lane
  const nodePos = {};
  activeLanes.forEach(lane => {
    const nodes = laneMap[lane.key];
    nodes.forEach((n, i) => {
      nodePos[n.name] = {
        x: laneX[lane.key],
        y: LANE_PAD_Y + i * (NODE_H + 10),
        laneKey: lane.key,
      };
    });
  });

  const totalH = Math.max(
    ...activeLanes.map(l => LANE_PAD_Y + laneMap[l.key].length * (NODE_H + 10) + 40)
  );

  return { activeLanes, laneX, nodePos, totalW, totalH };
}

export default function DAGView({ nodes, edges, selected, onSelect, typeFilters }) {
  const [showInferred, setShowInferred] = useState(true);

  const filteredNodes = useMemo(
    () => nodes.filter(n => typeFilters.size === 0 || typeFilters.has(n.type)),
    [nodes, typeFilters]
  );
  const filteredNames = useMemo(() => new Set(filteredNodes.map(n => n.name)), [filteredNodes]);
  const filteredEdges = useMemo(
    () => edges.filter(e => filteredNames.has(e.from) && filteredNames.has(e.to) && (showInferred || !e.inferred)),
    [edges, filteredNames, showInferred]
  );

  const laneMap  = useMemo(() => assignLanes(filteredNodes), [filteredNodes]);
  const layout   = useMemo(() => layoutLanes(laneMap), [laneMap]);
  const { activeLanes, nodePos, totalW, totalH } = layout;

  const selectedEdgeIdxs = useMemo(() => {
    if (!selected) return null;
    return new Set(filteredEdges.map((e, i) =>
      (e.from === selected.name || e.to === selected.name) ? i : -1
    ).filter(i => i >= 0));
  }, [selected, filteredEdges]);

  // Scroll container
  const SVG_W = Math.max(totalW + 40, 800);
  const SVG_H = Math.max(totalH + 40, 400);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '8px 16px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 16, background: C.panel, flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted }}>
          Execution flow — left → right
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: C.muted, fontFamily: 'JetBrains Mono' }}>
          <input type="checkbox" checked={showInferred} onChange={e => setShowInferred(e.target.checked)}
            style={{ accentColor: C.warning }} />
          Show inferred edges (DML→Trigger)
        </label>
        <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted }}>
          {filteredNodes.length} nodes · {filteredEdges.length} edges
        </span>
      </div>

      {/* SVG canvas — scrollable */}
      <div style={{ flex: 1, overflow: 'auto', background: C.bg }}>
        <svg width={SVG_W} height={SVG_H} style={{ display: 'block' }}>
          <defs>
            {['direct','inferred','external'].map(k => {
              const col = k === 'inferred' ? C.warning : k === 'external' ? C.muted : C.muted2;
              return (
                <marker key={k} id={`dag-arr-${k}`} markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill={col} opacity="0.8" />
                </marker>
              );
            })}
          </defs>

          {/* Lane backgrounds */}
          {activeLanes.map(lane => {
            const laneNodes = laneMap[lane.key];
            const x = nodePos[laneNodes[0]?.name]?.x ?? 0;
            const laneH = LANE_PAD_Y + laneNodes.length * (NODE_H + 10) + 20;
            return (
              <g key={lane.key}>
                <rect x={x - 10} y={0} width={NODE_W + 20} height={SVG_H}
                  fill={`${lane.color}08`} rx={8} />
                <rect x={x - 10} y={0} width={NODE_W + 20} height={30}
                  fill={`${lane.color}18`} rx={4} />
                <text x={x + NODE_W / 2} y={20} textAnchor="middle"
                  fill={lane.color} fontSize={10} fontWeight="800"
                  fontFamily="JetBrains Mono" letterSpacing={1}>
                  {lane.label.toUpperCase()}
                </text>
              </g>
            );
          })}

          {/* Edges */}
          {filteredEdges.map((e, i) => {
            const a = nodePos[e.from], b = nodePos[e.to];
            if (!a || !b) return null;

            const isHighlit = selectedEdgeIdxs?.has(i);
            const col = e.inferred ? C.warning : e.external ? C.muted : (EDGE_COLOR[e.edgeType] || C.muted2);
            const opacity = selected ? (isHighlit ? 1 : 0.04) : 0.35;

            const x1 = a.x + NODE_W;
            const y1 = a.y + NODE_H / 2;
            const x2 = b.x;
            const y2 = b.y + NODE_H / 2;

            // If same lane, draw a loop arc above
            const sameLane = a.laneKey === b.laneKey;
            let d;
            if (sameLane) {
              const mx = x1 + 30;
              const my = Math.min(y1, y2) - 30;
              d = `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
            } else if (x1 < x2) {
              // Forward edge — bezier
              const cx1 = x1 + (x2 - x1) * 0.45;
              const cx2 = x1 + (x2 - x1) * 0.55;
              d = `M ${x1} ${y1} C ${cx1} ${y1} ${cx2} ${y2} ${x2} ${y2}`;
            } else {
              // Backward edge — arc over the top
              const cx = (x1 + x2) / 2;
              const cy = Math.min(y1, y2) - 50;
              d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
            }

            const markerId = e.inferred ? 'inferred' : e.external ? 'external' : 'direct';

            return (
              <g key={i} opacity={opacity}>
                <path d={d} stroke={col} strokeWidth={isHighlit ? 2.5 : 1}
                  fill="none" strokeDasharray={e.inferred ? '5,3' : 'none'}
                  markerEnd={`url(#dag-arr-${markerId})`} />
                {isHighlit && (
                  <text x={(x1 + x2) / 2} y={Math.min(y1, y2) - 6}
                    fill={col} fontSize={9} textAnchor="middle" fontFamily="JetBrains Mono" fontWeight="700">
                    {EDGE_LABELS[e.edgeType] || e.edgeType}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {filteredNodes.map(n => {
            const p = nodePos[n.name];
            if (!p) return null;
            const col    = TYPE_COLOR[n.type] || C.muted;
            const isSel  = selected?.name === n.name;
            const isLinked = selected
              ? filteredEdges.some(e => (e.from === selected.name && e.to === n.name) || (e.to === selected.name && e.from === n.name))
              : false;
            const dimmed = selected && !isSel && !isLinked;

            return (
              <g key={n.name} style={{ cursor: 'pointer' }} opacity={dimmed ? 0.15 : 1}
                onClick={() => onSelect(isSel ? null : n)}>
                {/* Node box */}
                <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={6}
                  fill={isSel ? col : C.panel}
                  stroke={isLinked ? col : isSel ? col : `${col}50`}
                  strokeWidth={isSel ? 2.5 : isLinked ? 2 : 1}
                />
                {/* Left color bar */}
                <rect x={p.x} y={p.y} width={4} height={NODE_H} rx={3}
                  fill={col} opacity={isSel ? 0 : 0.9} />

                {/* Icon */}
                <text x={p.x + 14} y={p.y + NODE_H / 2 + 1}
                  dominantBaseline="middle" textAnchor="middle"
                  fontSize={12} fill={isSel ? C.bg : col} fontWeight="700">
                  {TYPE_ICON[n.type]}
                </text>

                {/* Name */}
                <text x={p.x + 26} y={p.y + NODE_H / 2 + 1}
                  dominantBaseline="middle" fontSize={10}
                  fill={isSel ? C.bg : C.text}
                  fontFamily="JetBrains Mono" fontWeight={isSel ? '700' : '400'}>
                  {n.name.length > 20 ? n.name.slice(0, 18) + '…' : n.name}
                </text>

                {/* Object sub-label */}
                {n.object && (
                  <text x={p.x + 26} y={p.y + NODE_H - 6}
                    fontSize={8} fill={isSel ? `${C.bg}99` : C.muted}
                    fontFamily="JetBrains Mono">
                    {n.object}
                  </text>
                )}

                {/* Async badges */}
                {(n.isBatch || n.isQueueable || n.isFuture) && !isSel && (
                  <text x={p.x + NODE_W - 6} y={p.y + 8}
                    fontSize={8} fill={C.accent3} textAnchor="end"
                    fontFamily="JetBrains Mono" fontWeight="700">
                    {n.isBatch ? 'BATCH' : n.isQueueable ? 'Q' : '@FUT'}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
