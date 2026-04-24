import React, { useMemo, useState } from 'react';
import { C, TYPE_COLOR, TYPE_ICON, EDGE_LABELS } from '../constants.js';

/**
 * Object-Centric View
 * Pick any CustomObject or PlatformEvent → see everything that touches it
 * rendered as concentric rings.
 *
 * Ring 0 (center): The selected object
 * Ring 1: Direct automations (Triggers, Flows with trigger on this object)
 * Ring 2: Things called by ring 1 (Handlers, Services, Subflows)
 * Ring 3: Things called by ring 2 (Batches, Queueables, Events, etc.)
 * Ring 4: Downstream triggers fired by DML in ring 2/3
 */

const RING_RADII  = [0, 110, 210, 310, 410];
const CENTER_X    = 500;
const CENTER_Y    = 460;
const SVG_W       = 1000;
const SVG_H       = 920;
const NODE_R      = 22;

export default function ObjectCentricView({ nodes, edges, selected, onSelect }) {
  const [focusObject, setFocusObject] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  // Objects and Platform Events are selectable as focus
  const focusableNodes = useMemo(
    () => nodes.filter(n => n.type === 'CustomObject' || n.type === 'PlatformEvent'),
    [nodes]
  );

  const focus = focusObject || focusableNodes[0];

  // Build concentric rings from focus outward
  const rings = useMemo(() => {
    if (!focus) return [];
    const byName = Object.fromEntries(nodes.map(n => [n.name, n]));
    const placed  = new Set([focus.name]);
    const result  = [[focus]]; // ring 0

    // Ring 1: anything with a direct edge to/from focus
    const ring1 = nodes.filter(n => {
      if (placed.has(n.name)) return false;
      return edges.some(e =>
        (e.from === focus.name && e.to === n.name) ||
        (e.to === focus.name && e.from === n.name)
      );
    });
    ring1.forEach(n => placed.add(n.name));
    result.push(ring1);

    // Ring 2: reachable from ring 1
    const ring2 = nodes.filter(n => {
      if (placed.has(n.name)) return false;
      return ring1.some(r1 =>
        edges.some(e =>
          (e.from === r1.name && e.to === n.name) ||
          (e.to === r1.name && e.from === n.name)
        )
      );
    });
    ring2.forEach(n => placed.add(n.name));
    result.push(ring2);

    // Ring 3: reachable from ring 2
    const ring3 = nodes.filter(n => {
      if (placed.has(n.name)) return false;
      return ring2.some(r2 =>
        edges.some(e =>
          (e.from === r2.name && e.to === n.name) ||
          (e.to === r2.name && e.from === n.name)
        )
      );
    });
    ring3.forEach(n => placed.add(n.name));
    result.push(ring3);

    // Ring 4: reachable from ring 3
    const ring4 = nodes.filter(n => {
      if (placed.has(n.name)) return false;
      return ring3.some(r3 =>
        edges.some(e =>
          (e.from === r3.name && e.to === n.name) ||
          (e.to === r3.name && e.from === n.name)
        )
      );
    });
    result.push(ring4);

    return result;
  }, [focus, nodes, edges]);

  // Compute positions for each node in its ring
  const positions = useMemo(() => {
    const pos = {};
    rings.forEach((ring, ri) => {
      const r = RING_RADII[ri] || (RING_RADII[RING_RADII.length - 1] + 80 * (ri - RING_RADII.length + 1));
      if (ri === 0) {
        pos[ring[0].name] = { x: CENTER_X, y: CENTER_Y, ring: ri };
        return;
      }
      ring.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / ring.length - Math.PI / 2;
        pos[n.name] = {
          x: CENTER_X + r * Math.cos(angle),
          y: CENTER_Y + r * Math.sin(angle),
          ring: ri,
        };
      });
    });
    return pos;
  }, [rings]);

  // Edges to draw — only between placed nodes
  const placedNames = useMemo(() => new Set(Object.keys(positions)), [positions]);
  const visibleEdges = useMemo(
    () => edges.filter(e => placedNames.has(e.from) && placedNames.has(e.to)),
    [edges, placedNames]
  );

  const activeNode = hoveredNode || selected;

  const highlightEdges = useMemo(() => {
    if (!activeNode) return null;
    return new Set(visibleEdges.map((e, i) =>
      (e.from === activeNode.name || e.to === activeNode.name) ? i : -1
    ).filter(i => i >= 0));
  }, [activeNode, visibleEdges]);

  const ringLabels = ['Focus', 'Direct Automations', 'Handlers & Services', 'Async & Events', 'Downstream'];

  if (!focus) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: C.muted, fontFamily: 'JetBrains Mono' }}>
        No Custom Objects or Platform Events found in index.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Object selector toolbar */}
      <div style={{
        padding: '8px 16px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        background: C.panel, flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: C.muted, flexShrink: 0 }}>Focus object:</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {focusableNodes.map(n => {
            const col   = TYPE_COLOR[n.type];
            const isFoc = focus?.name === n.name;
            return (
              <button key={n.name} onClick={() => { setFocusObject(n); onSelect(null); }}
                style={{
                  background: isFoc ? col : C.panel2,
                  color:      isFoc ? C.bg : col,
                  border:     `1px solid ${isFoc ? col : `${col}40`}`,
                  padding:    '4px 12px', borderRadius: 5,
                  fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>
                {TYPE_ICON[n.type]} {n.name}
              </button>
            );
          })}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, flexShrink: 0 }}>
          {rings.map((ring, ri) => ring.length > 0 && (
            <span key={ri} style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: C.muted }}>
              <span style={{ color: C.muted2 }}>Ring {ri}:</span> {ring.length}
            </span>
          ))}
        </div>
      </div>

      {/* SVG canvas */}
      <div style={{ flex: 1, overflow: 'auto', background: C.bg, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
        <svg width={SVG_W} height={SVG_H} style={{ display: 'block' }}>
          <defs>
            <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#0d1f3c" stopOpacity="1" />
              <stop offset="100%" stopColor={C.bg}    stopOpacity="1" />
            </radialGradient>
            <marker id="oc-arr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill={C.muted} opacity="0.6" />
            </marker>
            <marker id="oc-arr-hi" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill={C.accent} opacity="0.9" />
            </marker>
            <marker id="oc-arr-inf" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L7,3 z" fill={C.warning} opacity="0.8" />
            </marker>
          </defs>

          {/* Background */}
          <rect width={SVG_W} height={SVG_H} fill="url(#bgGrad)" />

          {/* Ring circles (guide lines) */}
          {RING_RADII.slice(1).map((r, i) => (
            <g key={r}>
              <circle cx={CENTER_X} cy={CENTER_Y} r={r}
                fill="none" stroke={C.border} strokeWidth={1} opacity={0.4}
                strokeDasharray="4,6" />
              <text x={CENTER_X} y={CENTER_Y - r + 12}
                textAnchor="middle" fill={C.muted} fontSize={9}
                fontFamily="JetBrains Mono" opacity={0.6}>
                {ringLabels[i + 1]}
              </text>
            </g>
          ))}

          {/* Edges */}
          {visibleEdges.map((e, i) => {
            const a = positions[e.from], b = positions[e.to];
            if (!a || !b) return null;
            const isHi = highlightEdges?.has(i);
            const col  = e.inferred ? C.warning : isHi ? C.accent : C.muted;
            const opacity = activeNode ? (isHi ? 0.9 : 0.05) : 0.3;

            // Slight curve
            const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.1;
            const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.1;

            return (
              <g key={i} opacity={opacity}>
                <path d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
                  stroke={col} strokeWidth={isHi ? 2 : 1} fill="none"
                  strokeDasharray={e.inferred ? '5,3' : 'none'}
                  markerEnd={`url(#oc-arr${e.inferred ? '-inf' : isHi ? '-hi' : ''})`}
                />
                {isHi && (
                  <text x={mx} y={my - 5} fill={col} fontSize={9}
                    textAnchor="middle" fontFamily="JetBrains Mono" fontWeight="700">
                    {EDGE_LABELS[e.edgeType] || e.edgeType}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {Object.entries(positions).map(([name, p]) => {
            const n      = nodes.find(x => x.name === name);
            if (!n) return null;
            const col    = TYPE_COLOR[n.type] || C.muted;
            const isFocus= n.name === focus?.name;
            const isSel  = selected?.name === n.name;
            const isHov  = hoveredNode?.name === n.name;
            const isLinkd= activeNode ? visibleEdges.some(e =>
              (e.from === activeNode.name && e.to === n.name) ||
              (e.to === activeNode.name && e.from === n.name)
            ) : false;
            const dimmed = activeNode && !isSel && !isHov && !isLinkd && n.name !== activeNode.name;
            const r      = isFocus ? 38 : NODE_R;

            return (
              <g key={name} style={{ cursor: 'pointer' }}
                opacity={dimmed ? 0.12 : 1}
                onClick={() => onSelect(isSel ? null : n)}
                onMouseEnter={() => setHoveredNode(n)}
                onMouseLeave={() => setHoveredNode(null)}>
                {/* Glow */}
                {(isSel || isHov) && (
                  <circle cx={p.x} cy={p.y} r={r + 12} fill={col} opacity={0.12} />
                )}
                {isFocus && (
                  <circle cx={p.x} cy={p.y} r={r + 6} fill={col} opacity={0.15} />
                )}

                <circle cx={p.x} cy={p.y} r={r}
                  fill={isSel || isFocus ? col : C.panel}
                  stroke={col}
                  strokeWidth={isSel || isFocus ? 3 : isLinkd ? 2.5 : 1.5}
                />

                {/* Icon */}
                <text x={p.x} y={p.y + (isFocus ? 0 : -3)}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={isFocus ? 18 : 13}
                  fill={isSel || isFocus ? C.bg : col}
                  fontWeight="800">
                  {TYPE_ICON[n.type]}
                </text>

                {/* Name label */}
                <text x={p.x} y={p.y + r + 14}
                  textAnchor="middle" fontSize={isFocus ? 11 : 9}
                  fill={isSel || isFocus ? C.text : isLinkd ? C.muted2 : C.muted}
                  fontFamily="JetBrains Mono"
                  fontWeight={isFocus || isSel ? '700' : '400'}>
                  {name.length > 20 ? name.slice(0, 18) + '…' : name}
                </text>

                {/* Type sub-label (only for non-focus) */}
                {!isFocus && (
                  <text x={p.x} y={p.y + r + 25}
                    textAnchor="middle" fontSize={8}
                    fill={col} fontFamily="JetBrains Mono" opacity={0.65}>
                    {n.type}
                  </text>
                )}

                {/* Badge for async */}
                {(n.isBatch || n.isQueueable) && (
                  <rect x={p.x + r - 4} y={p.y - r - 2} width={26} height={10} rx={3} fill={C.accent3} opacity={0.9} />
                )}
                {n.isBatch && (
                  <text x={p.x + r + 9} y={p.y - r + 6} fontSize={7} fill={C.bg}
                    textAnchor="middle" fontFamily="JetBrains Mono" fontWeight="800">BAT</text>
                )}
                {n.isQueueable && !n.isBatch && (
                  <text x={p.x + r + 9} y={p.y - r + 6} fontSize={7} fill={C.bg}
                    textAnchor="middle" fontFamily="JetBrains Mono" fontWeight="800">Q</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
