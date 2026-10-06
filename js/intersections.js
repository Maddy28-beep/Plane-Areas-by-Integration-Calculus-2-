/* intersections.js — numeric root finding and curve/curve intersection points. */
(function (g) {
  "use strict";
  const PA = (g.PA = g.PA || {});
  const { Fr } = PA;

  /** snap a value to a nearby simple rational so exact work stays exact */
  function snap(v) {
    const fr = Fr.fromNumber(v, 2000, 1e-9);
    return fr ? fr.num() : v;
  }

  /** All roots of h on [a,b]: sign changes (bisection) and tangential touches (local minima of |h|). */
  function roots(h, a, b, n = 6000) {
    const step = (b - a) / n, xs = new Array(n + 1), ys = new Array(n + 1), out = [];
    for (let k = 0; k <= n; k++) { xs[k] = a + k * step; ys[k] = h(xs[k]); }
    for (let k = 0; k <= n; k++) {
      const y = ys[k];
      if (!Number.isFinite(y)) continue;
      if (y === 0) { out.push(xs[k]); continue; }
      if (k < n && Number.isFinite(ys[k + 1]) && y * ys[k + 1] < 0) {
        let lo = xs[k], hi = xs[k + 1], flo = y;
        for (let it = 0; it < 100; it++) {
          const mid = (lo + hi) / 2, fm = h(mid);
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
        }
        const r = (lo + hi) / 2;
        if (Math.abs(h(r)) < 1e-6 * (1 + Math.abs(y) + Math.abs(ys[k + 1]))) out.push(r); // reject poles
      } else if (k > 0 && k < n && Number.isFinite(ys[k - 1]) && Number.isFinite(ys[k + 1]) &&
        Math.abs(y) <= Math.abs(ys[k - 1]) && Math.abs(y) <= Math.abs(ys[k + 1]) && y * ys[k - 1] > 0 && y * ys[k + 1] > 0) {
        // possible tangency: golden-section search for the minimum of |h|
        let lo = xs[k - 1], hi = xs[k + 1];
        const gr = (Math.sqrt(5) - 1) / 2;
        for (let it = 0; it < 120; it++) {
          const c = hi - gr * (hi - lo), d = lo + gr * (hi - lo);
          if (Math.abs(h(c)) < Math.abs(h(d))) hi = d; else lo = c;
        }
        const r = (lo + hi) / 2;
        if (Math.abs(h(r)) < 1e-9) out.push(r);
      }
    }
    out.sort((p, q) => p - q);
    const uniq = [];
    for (const r of out) if (!uniq.length || Math.abs(r - uniq[uniq.length - 1]) > 1e-6) uniq.push(r);
    return uniq.map(snap);
  }

  /** Where a branch function stops being defined (e.g. the ends of a sideways parabola's two branches). */
  function domainEdges(fn, a, b, n = 6000) {
    const out = [], step = (b - a) / n;
    let pt = a, prev = fn(a);
    for (let k = 1; k <= n; k++) {
      const t = a + k * step, cur = fn(t);
      if (Number.isFinite(prev) !== Number.isFinite(cur)) {
        let lo = pt, hi = t; // lo/hi are the real previous and current grid points; bisect to the last defined point
        const loFinite = Number.isFinite(prev);
        for (let it = 0; it < 100; it++) {
          const mid = (lo + hi) / 2;
          if (Number.isFinite(fn(mid)) === loFinite) lo = mid; else hi = mid;
        }
        out.push(loFinite ? lo : hi);
      }
      pt = t; prev = cur;
    }
    return out;
  }

  /** Intersection points of two curves inside the ranges {x:[a,b], y:[c,d]} */
  function pair(A, B, ranges) {
    const pts = [];
    const push = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x: snap(x), y: snap(y) }); };
    let k1 = A.kind, k2 = B.kind;
    if (k1 > k2) { [A, B] = [B, A]; [k1, k2] = [k2, k1]; } // order: fx < gy < h < v
    const key = k1 + "," + k2, X = ranges.x, Y = ranges.y;
    if (A.sourceId === B.sourceId && A.branch && B.branch && k1 === k2) { // the two halves of one relation meet at its turning points
      const rg = k1 === "fx" ? X : Y;
      domainEdges(A.fn, rg[0], rg[1]).forEach(t => (k1 === "fx" ? push(t, A.fn(t)) : push(A.fn(t), t)));
      return pts;
    }
    switch (key) {
      case "fx,fx": roots(t => A.fn(t) - B.fn(t), X[0], X[1]).forEach(x => push(x, A.fn(x))); break;
      case "gy,gy": roots(t => A.fn(t) - B.fn(t), Y[0], Y[1]).forEach(y => push(A.fn(y), y)); break;
      case "fx,gy": roots(x => x - B.fn(A.fn(x)), X[0], X[1]).forEach(x => push(x, A.fn(x))); break;
      case "fx,h": roots(x => A.fn(x) - B.value, X[0], X[1]).forEach(x => push(x, B.value)); break;
      case "fx,v": if (B.value >= X[0] && B.value <= X[1]) push(B.value, A.fn(B.value)); break;
      case "gy,h": if (B.value >= Y[0] && B.value <= Y[1]) push(A.fn(B.value), B.value); break;
      case "gy,v": roots(y => A.fn(y) - B.value, Y[0], Y[1]).forEach(y => push(B.value, y)); break;
      case "h,v": push(B.value, A.value); break;
      default: break; // parallel lines never meet
    }
    return pts;
  }

  PA.intersections = { roots, pair, snap };
})(globalThis);
