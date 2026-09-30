/* bounds.js — finds the bounded region(s) enclosed by the curves and splits them into
   slices (upper/lower for dx, right/left for dy) with their limits of integration. */
(function (g) {
  "use strict";
  const PA = (g.PA = g.PA || {});
  const { Fr, M } = PA;
  const { snap } = PA.intersections;

  const key = (x, y) => x.toFixed(6) + "," + y.toFixed(6);

  /* =====================  Region detection (planar arrangement)  ===================== */

  function detectRegion(curves, points, ranges) {
    if (!points.length) return { faces: [], all: 0 };
    const inCurve = new Map(curves.map(c => [c.id, new Map()])); // curve id -> (t key -> point)
    const tOf = (c, p) => (c.kind === "fx" || c.kind === "h" ? p.x : p.y);
    for (const p of points) for (const id of [p.a, p.b]) {
      const c = curves.find(z => z.id === id);
      inCurve.get(id).set(tOf(c, p).toFixed(9), p);
    }
    // viewing box that contains every intersection plus generous room for arcs that bulge out
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const grow = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
    points.forEach(p => grow(p.x, p.y));
    grow(0, 0);
    for (const c of curves) { // arcs between intersections may bulge beyond the points themselves
      if (c.kind !== "fx" && c.kind !== "gy") continue;
      const ts = [...inCurve.get(c.id).keys()].map(Number);
      if (!ts.length) continue;
      const a = Math.min(...ts), b = Math.max(...ts);
      for (let k = 0; k <= 200; k++) {
        const t = a + (b - a) * k / 200, v = c.fn(t);
        if (Number.isFinite(v)) c.kind === "fx" ? grow(t, v) : grow(v, t);
      }
    }
    const sx = Math.max(x1 - x0, 1), sy = Math.max(y1 - y0, 1);
    const box = { x0: x0 - sx, x1: x1 + sx, y0: y0 - sy, y1: y1 + sy };
    const diag = Math.hypot(box.x1 - box.x0, box.y1 - box.y0);
    const inside = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;

    const nodeId = new Map(), nodes = [], edges = new Map(); // edges: "a|b" -> Set(sourceId)
    const node = (x, y) => {
      const k = key(x, y);
      if (!nodeId.has(k)) { nodeId.set(k, nodes.length); nodes.push([x, y]); }
      return nodeId.get(k);
    };
    const addEdge = (a, b, src) => {
      if (a === b) return;
      const k = a < b ? a + "|" + b : b + "|" + a;
      if (!edges.has(k)) edges.set(k, new Set());
      edges.get(k).add(src);
    };

    for (const c of curves) {
      const alongX = c.kind === "fx" || c.kind === "h";
      const lo = Math.max(alongX ? box.x0 : box.y0, (alongX ? ranges.x : ranges.y)[0]);
      const hi = Math.min(alongX ? box.x1 : box.y1, (alongX ? ranges.x : ranges.y)[1]);
      if (!(hi > lo)) continue;
      const ts = new Set([lo, hi]);
      if (c.kind === "fx" || c.kind === "gy") for (let k = 0; k <= 1600; k++) ts.add(lo + (hi - lo) * k / 1600);
      const crit = inCurve.get(c.id);
      for (const k of crit.keys()) { const t = Number(k); if (t >= lo && t <= hi) ts.add(t); }
      const sorted = [...ts].sort((a, b) => a - b);
      let prev = null;
      for (const t of sorted) {
        let x, y;
        const cp = crit.get(t.toFixed(9));
        if (cp) { x = cp.x; y = cp.y; }
        else if (c.kind === "fx") { x = t; y = c.fn(t); }
        else if (c.kind === "gy") { y = t; x = c.fn(t); }
        else if (c.kind === "v") { x = c.value; y = t; }
        else { y = c.value; x = t; }
        if (!inside(x, y)) { prev = null; continue; }
        const id = node(x, y);
        if (prev !== null) {
          const [px, py] = nodes[prev];
          if (Math.hypot(x - px, y - py) < 0.5 * diag) addEdge(prev, id, c.sourceId);
        }
        prev = id;
      }
    }

    // adjacency, then prune dangling ends
    const adj = nodes.map(() => new Set());
    for (const k of edges.keys()) { const [a, b] = k.split("|").map(Number); adj[a].add(b); adj[b].add(a); }
    const stack = [];
    adj.forEach((s, i) => { if (s.size === 1) stack.push(i); });
    while (stack.length) {
      const i = stack.pop();
      if (adj[i].size !== 1) continue;
      const [j] = adj[i];
      adj[i].clear(); adj[j].delete(i);
      if (adj[j].size === 1) stack.push(j);
    }
    const order = adj.map((s, i) => [...s].sort((a, b) =>
      Math.atan2(nodes[a][1] - nodes[i][1], nodes[a][0] - nodes[i][0]) - Math.atan2(nodes[b][1] - nodes[i][1], nodes[b][0] - nodes[i][0])));

    const seen = new Set(), faces = [], minArea = 1e-9 * (box.x1 - box.x0) * (box.y1 - box.y0);
    const N = nodes.length;
    for (let u = 0; u < N; u++) for (const v0 of order[u]) {
      if (seen.has(u * N + v0)) continue;
      const loop = [], srcs = new Set();
      let a = u, b = v0, guard = 0;
      while (!seen.has(a * N + b) && guard++ < 4 * N) {
        seen.add(a * N + b);
        loop.push(a);
        const ek = a < b ? a + "|" + b : b + "|" + a;
        for (const s of edges.get(ek) || []) srcs.add(s);
        const nb = order[b], i = nb.indexOf(a);
        const w = nb[(i - 1 + nb.length) % nb.length];
        a = b; b = w;
      }
      let area = 0;
      for (let i = 0; i < loop.length; i++) {
        const [x, y] = nodes[loop[i]], [x2, y2] = nodes[loop[(i + 1) % loop.length]];
        area += x * y2 - x2 * y;
      }
      area /= 2;
      if (area > minArea) faces.push({ poly: loop.map(i => nodes[i]), area, sources: srcs });
    }
    if (!faces.length) return { faces: [], all: 0 };
    const most = Math.max(...faces.map(f => f.sources.size));
    const kept = faces.filter(f => f.sources.size === most);
    return { faces: kept, all: faces.length, box };
  }

  function inPoly(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }

  /* =====================  Slicing into integrals  ===================== */

  const fmtFr = (fr) => fr.str();
  function derivedBranch(c, sliceVar, sign) {
    // c is a polynomial in its own variable z; slice variable s; solve c(z) = s for z
    const cf = c.coefs, [a0, a1, a2] = cf;
    let expr;
    if (cf.length === 2) expr = "(" + sliceVar + " - " + fmtFr(a0) + ")/" + fmtFr(a1);
    else expr = "(-" + fmtFr(a1) + " " + (sign > 0 ? "+" : "-") + " sqrt(" + fmtFr(a1) + "^2 - 4*" + fmtFr(a2) + "*(" + fmtFr(a0) + " - " + sliceVar + ")))/(2*" + fmtFr(a2) + ")";
    const node = M.parse(expr), code = node.compile();
    return {
      coefs: cf.length === 2 ? [a0.neg().div(a1), new Fr(1).div(a1)] : null,
      key: c.id + (cf.length === 2 ? "L" : sign > 0 ? "+" : "-"), node, derived: true, sliceVar, curve: c, sign,
      fn: t => { const r = code.evaluate({ [sliceVar]: t }); return typeof r === "number" ? r : NaN; },
      plain: PA.fmt.pretty(expr),
    };
  }

  function directBranch(c, sliceVar) {
    const isLine = c.kind === "h" || c.kind === "v", cv = isLine ? Fr.fromNumber(c.value, 2000, 1e-9) : null;
    return { texOverride: c.texOverride, coefs: isLine ? (cv ? [cv] : null) : c.coefs, key: c.id, node: c.node, derived: false, sliceVar, curve: c, fn: c.fn, plain: c.kind === "h" || c.kind === "v" ? PA.fmt.plainNum(c.value) : PA.fmt.pretty(c.node.toString()) };
  }

  /** dir "x": vertical slices (t = x, values = y).  dir "y": horizontal slices (t = y, values = x). */
  function slicePieces(curves, faces, points, dir) {
    const s = dir;
    const direct = c => (dir === "x" ? c.kind === "fx" : c.kind === "gy");
    const constant = c => (dir === "x" ? c.kind === "h" : c.kind === "v");
    const across = c => (dir === "x" ? c.kind === "v" : c.kind === "h");
    const inverse = c => (dir === "x" ? c.kind === "gy" : c.kind === "fx");
    const tv = p => (dir === "x" ? [p[0], p[1]] : [p[1], p[0]]);
    const polys = faces.map(f => f.poly.map(tv));

    const direct_b = new Map();
    const getDirect = c => { if (!direct_b.has(c.id)) direct_b.set(c.id, directBranch(c, s)); return direct_b.get(c.id); };
    const inv = new Map();
    let derivedUsed = false;

    // critical slice positions
    const crit = new Set();
    polys.forEach(pl => pl.forEach(([t]) => crit.add(t)));
    points.forEach(p => crit.add(dir === "x" ? p.x : p.y));
    curves.filter(across).forEach(c => crit.add(c.value));
    for (const c of curves.filter(inverse)) {
      if (!c.coefs) return { unsupported: "no polynomial form for " + c.plain };
      if (c.coefs.length > 3) return { unsupported: "degree too high to invert: " + c.plain };
      if (c.coefs.length === 3) { // turning point of the parabola in this direction
        const zv = c.coefs[1].neg().div(c.coefs[2].mul(new Fr(2))).num();
        crit.add(PA.coefs.evalCoefs(c.coefs, zv));
      }
    }
    let tmin = Infinity, tmax = -Infinity;
    polys.forEach(pl => pl.forEach(([t]) => { tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }));
    const ts = [...crit].filter(t => t >= tmin - 1e-9 && t <= tmax + 1e-9).map(snap).sort((a, b) => a - b)
      .filter((t, i, a) => !i || t - a[i - 1] > 1e-9);

    const pieces = [];
    for (let i = 0; i + 1 < ts.length; i++) {
      const t0 = ts[i], t1 = ts[i + 1], m = (t0 + t1) / 2, bs = [];
      for (const c of curves) {
        if (direct(c)) { const b = getDirect(c); const v = b.fn(m); if (Number.isFinite(v)) bs.push({ b, v }); }
        else if (constant(c)) { const b = getDirect(c); bs.push({ b, v: c.value }); }
        else if (inverse(c)) {
          const cf = c.coefs;
          if (cf.length === 2) {
            const kk = c.id + "L";
            if (!inv.has(kk)) inv.set(kk, derivedBranch(c, s, 1));
            const b = inv.get(kk); bs.push({ b, v: b.fn(m) });
          } else if (cf.length === 3) {
            for (const sg of [1, -1]) {
              const kk = c.id + (sg > 0 ? "+" : "-");
              if (!inv.has(kk)) inv.set(kk, derivedBranch(c, s, sg));
              const b = inv.get(kk), v = b.fn(m);
              if (Number.isFinite(v)) bs.push({ b, v });
            }
          }
        }
      }
      bs.sort((p, q) => p.v - q.v);
      for (let k = 0; k + 1 < bs.length; k++) {
        const lo = bs[k], hi = bs[k + 1];
        if (hi.v - lo.v < 1e-9) continue;
        const mid = (lo.v + hi.v) / 2;
        if (polys.some(pl => inPoly(pl, m, mid))) {
          pieces.push({ t0, t1, upper: hi.b, lower: lo.b });
          if (hi.b.derived || lo.b.derived) derivedUsed = true;
        }
      }
    }
    // merge neighbours that share the same boundary curves
    const merged = [];
    for (const p of pieces) {
      const last = merged[merged.length - 1];
      if (last && last.upper.key === p.upper.key && last.lower.key === p.lower.key && Math.abs(last.t1 - p.t0) < 1e-9) last.t1 = p.t1;
      else merged.push({ ...p });
    }
    const derivedCount = merged.filter(p => p.upper.derived || p.lower.derived).length;
    return { dir, pieces: merged, derivedCount, faceArea: faces.reduce((a, f) => a + f.area, 0) };
  }

  PA.bounds = { detectRegion, slicePieces, inPoly };
})(globalThis);
