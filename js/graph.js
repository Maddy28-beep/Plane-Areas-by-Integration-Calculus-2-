/* graph.js — Plotly rendering. Everything drawn comes from the same pieces/curves used in the integral. */
(function (g) {
  "use strict";
  const PA = (g.PA = g.PA || {});
  const COLORS = ["#b3261e", "#1b6ca8", "#7a4fb5", "#c26a00", "#2e7d32", "#ad1457"];

  function shadeTrace(res, piece, first) {
    const N = 240, xs = [], ys = [], dir = res.dir;
    const pt = (t, b) => { const v = b.fn(t); return dir === "x" ? [t, v] : [v, t]; };
    const pushPt = ([x, y]) => { xs.push(x); ys.push(y); };
    for (let k = 0; k <= N; k++) pushPt(pt(piece.t0 + (piece.t1 - piece.t0) * k / N, piece.upper));
    for (let k = N; k >= 0; k--) pushPt(pt(piece.t0 + (piece.t1 - piece.t0) * k / N, piece.lower));
    return {
      x: xs, y: ys, type: "scatter", mode: "lines", fill: "toself", fillcolor: "rgba(15,92,88,0.30)",
      line: { color: "rgba(15,92,88,0.9)", width: 1 }, name: "Bounded region", legendgroup: "region", showlegend: first,
      hoverinfo: "skip",
    };
  }

  function viewBox(res) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const dir = res.dir;
    for (const p of res.pieces) for (let k = 0; k <= 60; k++) {
      const t = p.t0 + (p.t1 - p.t0) * k / 60;
      for (const b of [p.upper, p.lower]) {
        const v = b.fn(t); if (!Number.isFinite(v)) continue;
        const [x, y] = dir === "x" ? [t, v] : [v, t];
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6), m = Math.max(w, h);
    // keep the origin in view when it is reasonably close, so the axes are visible
    for (const [lo, hi, set] of [[x0, x1, v => (x0 = Math.min(x0, v), x1 = Math.max(x1, v))], [y0, y1, v => (y0 = Math.min(y0, v), y1 = Math.max(y1, v))]]) {
      if (0 < lo && lo < 1.5 * m) set(0); else if (0 > hi && -hi < 1.5 * m) set(0);
    }
    const px = (x1 - x0) * 0.16 + 0.05 * m, py = (y1 - y0) * 0.16 + 0.05 * m;
    return { x: [x0 - px, x1 + px], y: [y0 - py, y1 + py] };
  }

  function curveTraces(res, view) {
    const out = [], dir = res.dir;
    res.curves.forEach((c, i) => {
      const color = COLORS[i % COLORS.length], alongX = c.kind === "fx" || c.kind === "h";
      const rg = alongX ? view.x : view.y, span = rg[1] - rg[0];
      let xs = [], ys = [];
      if (c.kind === "v") { xs = [c.value, c.value]; ys = view.y; }
      else if (c.kind === "h") { xs = view.x; ys = [c.value, c.value]; }
      else {
        const n = 700;
        for (let k = 0; k <= n; k++) {
          const t = rg[0] - span * 0.5 + (span * 2) * k / n, v = c.fn(t);
          const ok = Number.isFinite(v) && Math.abs(v) < 1e6;
          if (alongX) { xs.push(ok ? t : null); ys.push(ok ? v : null); } else { xs.push(ok ? v : null); ys.push(ok ? t : null); }
        }
      }
      const isLine = c.kind === "v" || c.kind === "h";
      out.push({
        x: xs, y: ys, type: "scatter", mode: "lines", name: c.plain, connectgaps: false,
        line: { color, width: isLine ? 2 : 2.6, dash: isLine ? "dash" : "solid" },
        legendgroup: c.sourceId, showlegend: !(c.branch === "-"),
        hovertemplate: "(%{x:.3f}, %{y:.3f})<extra>" + c.plain + "</extra>",
      });
    });
    return out;
  }

  function sliceTrace(res, view) {
    const p = res.pieces.reduce((a, b) => (b.t1 - b.t0 > a.t1 - a.t0 ? b : a));
    const m = (p.t0 + p.t1) / 2, dt = (p.t1 - p.t0) * 0.04;
    const t0 = m - dt / 2, t1 = m + dt / 2, u0 = p.upper.fn(t0), u1 = p.upper.fn(t1), l0 = p.lower.fn(t0), l1 = p.lower.fn(t1);
    const pts = res.dir === "x" ? [[t0, l0], [t0, u0], [t1, u1], [t1, l1], [t0, l0]] : [[l0, t0], [u0, t0], [u1, t1], [l1, t1], [l0, t0]];
    return {
      x: pts.map(q => q[0]), y: pts.map(q => q[1]), type: "scatter", mode: "lines", fill: "toself",
      fillcolor: "rgba(201,162,39,0.55)", line: { color: "#9a7b10", width: 1.5 },
      name: "Representative slice (d" + res.dir + ")", hoverinfo: "skip",
    };
  }

  function render(el, res) {
    if (!g.Plotly) { el.innerHTML = '<p class="muted">The graphing library (Plotly) could not be loaded. Check your internet connection and reload.</p>'; return; }
    const view = viewBox(res), traces = [];
    res.pieces.forEach((p, i) => traces.push(shadeTrace(res, p, i === 0)));
    traces.push(...curveTraces(res, view));
    traces.push(sliceTrace(res, view));
    traces.push({
      x: res.points.map(p => p.x), y: res.points.map(p => p.y), type: "scatter", mode: "markers+text", name: "Intersection points",
      text: res.points.map(p => "<b>(" + PA.fmt.plainNum(p.x) + ", " + PA.fmt.plainNum(p.y) + ")</b>"), textposition: "top right",
      cliponaxis: false, textfont: { size: 19, color: "#0b3d3a", family: "Segoe UI, Arial, sans-serif" }, marker: { size: 9, color: "#c9a227", line: { color: "#0b3d3a", width: 1.5 } },
      hovertemplate: "%{text}<extra>intersection</extra>",
    });
    const dark = "#8a949b", grid = "#e3e8ea";
    const layout = {
      margin: { l: 70, r: 24, t: 14, b: 60 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "#ffffff",
      xaxis: { range: view.x, zeroline: true, zerolinecolor: dark, zerolinewidth: 2, gridcolor: grid, automargin: true, title: { text: "<b>x</b>", font: { size: 18 }, standoff: 10 }, tickfont: { size: 18, color: "#1b2a2a", weight: 700 }, showline: false },
      yaxis: { range: view.y, zeroline: true, zerolinecolor: dark, zerolinewidth: 2, gridcolor: grid, automargin: true, title: { text: "<b>y</b>", font: { size: 18 }, standoff: 12 }, tickfont: { size: 18, color: "#1b2a2a", weight: 700 }, scaleanchor: "x", scaleratio: 1 },
      legend: { orientation: "h", y: -0.2, font: { size: 15 } }, hovermode: "closest", dragmode: "pan",
    };
    const config = { responsive: true, displaylogo: false, scrollZoom: true, modeBarButtonsToRemove: ["select2d", "lasso2d"] };
    g.Plotly.react(el, traces, layout, config);
    el._paView = view;
  }

  function reset(el) {
    if (g.Plotly && el._paView) g.Plotly.relayout(el, { "xaxis.range": el._paView.x, "yaxis.range": el._paView.y });
  }

  PA.graph = { render, reset };
})(globalThis);
