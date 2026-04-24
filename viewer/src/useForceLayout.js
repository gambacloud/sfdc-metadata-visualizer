import { useEffect, useRef, useState } from 'react';

/**
 * Simple force-directed layout hook.
 * Returns stable positions — reruns only when node/edge count changes.
 * Saves/loads positions from localStorage by graph signature for consistency.
 */
export function useForceLayout(nodes, edges, width, height) {
  const [positions, setPositions] = useState({});
  const simRef = useRef(null);

  useEffect(() => {
    if (!nodes.length || !width || !height) return;

    const sig = `sfkb_pos_${nodes.length}_${edges.length}`;

    // Try to restore saved positions
    try {
      const saved = localStorage.getItem(sig);
      if (saved) {
        setPositions(JSON.parse(saved));
        return;
      }
    } catch {}

    // Initialise positions in a circle
    const pos = {};
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      pos[n.name] = {
        x: width  / 2 + width  * 0.38 * Math.cos(angle),
        y: height / 2 + height * 0.38 * Math.sin(angle),
      };
    });

    const edgeIndex = {};
    edges.forEach(e => {
      if (!edgeIndex[e.from]) edgeIndex[e.from] = [];
      if (!edgeIndex[e.to])   edgeIndex[e.to]   = [];
      edgeIndex[e.from].push(e.to);
      edgeIndex[e.to].push(e.from);
    });

    let iter = 0;
    const ITERS = 180;
    const REPULSION = 4500;
    const ATTRACTION = 250;

    const tick = () => {
      if (iter++ >= ITERS) {
        // Save to localStorage for next run
        try { localStorage.setItem(sig, JSON.stringify(pos)); } catch {}
        setPositions({ ...pos });
        return;
      }

      const delta = {};
      nodes.forEach(n => { delta[n.name] = { x: 0, y: 0 }; });

      // Repulsion between all pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i].name, b = nodes[j].name;
          const dx = pos[a].x - pos[b].x;
          const dy = pos[a].y - pos[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          delta[a].x += fx; delta[a].y += fy;
          delta[b].x -= fx; delta[b].y -= fy;
        }
      }

      // Attraction along edges
      edges.forEach(e => {
        const a = pos[e.from], b = pos[e.to];
        if (!a || !b) return;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
        const force = dist / ATTRACTION;
        const fx = dx * force, fy = dy * force;
        if (delta[e.from]) { delta[e.from].x += fx; delta[e.from].y += fy; }
        if (delta[e.to])   { delta[e.to].x   -= fx; delta[e.to].y   -= fy; }
      });

      // Apply with damping + clamp
      const damp = 1 - iter / ITERS;
      nodes.forEach(n => {
        pos[n.name].x = Math.max(70, Math.min(width  - 70, pos[n.name].x + delta[n.name].x * damp));
        pos[n.name].y = Math.max(50, Math.min(height - 50, pos[n.name].y + delta[n.name].y * damp));
      });

      if (iter % 10 === 0) setPositions({ ...pos });
      simRef.current = requestAnimationFrame(tick);
    };

    simRef.current = requestAnimationFrame(tick);
    return () => { if (simRef.current) cancelAnimationFrame(simRef.current); };
  }, [nodes.length, edges.length, width, height]);

  return positions;
}
