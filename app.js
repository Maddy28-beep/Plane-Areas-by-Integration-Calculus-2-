/* app.js — UI: navigation, solver workspace, history. All maths lives in js/. */
(function () {
  "use strict";
  const PA = window.PA;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const app = $("#app");

  if (!PA || !PA.solve) {
    app.innerHTML = '<div class="card error-card"><h2>Could not start</h2><p>The math library (math.js) failed to load. Check your internet connection and reload the page.</p></div>';
    return;
  }

  /* ---------- KaTeX helper ---------- */
  function math(tex, display = true) {
    try { return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: "ignore" }); }
    catch (e) { return "<code>" + esc(tex) + "</code>"; }
  }

  /* ---------- History (localStorage, optional) ---------- */
  const HKEY = "planearea.history.v1";
  const history = {
    load() { try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch (e) { return []; } },
    save(list) { try { localStorage.setItem(HKEY, JSON.stringify(list.slice(0, 25))); } catch (e) { /* storage unavailable: app still works */ } },
    add(problem, answer) {
      const list = this.load().filter(h => h.problem !== problem);
      list.unshift({ id: Date.now().toString(36), problem, answer, ts: Date.now() });
      this.save(list);
    },
    remove(id) { this.save(this.load().filter(h => h.id !== id)); },
    clear() { this.save([]); },
  };

  /* ---------- Fullscreen graph ----------
     The SAME Plotly element is moved into an overlay (not copied), so the curves, shading, points, legend,
     zoom/pan state and every other detail are identical by construction. */
  let fs = null;
  const resizePlot = el => { if (window.Plotly && el && el.data) { try { window.Plotly.Plots.resize(el); } catch (e) { /* ignore */ } } };

  function setGraphFonts(plot, tick, label) { // text sizes only; data and view are untouched
    if (!window.Plotly || !plot.data) return;
    window.Plotly.relayout(plot, {
      "xaxis.tickfont.size": tick, "yaxis.tickfont.size": tick,
      "xaxis.title.font.size": tick, "yaxis.title.font.size": tick, "legend.font.size": Math.round(tick * 0.85),
    });
    window.Plotly.restyle(plot, { "textfont.size": label }, [plot.data.length - 1]);
  }

  const gEl = f => (f && (f.g ? f.g.el : f.kind === "graph" ? f.plot : null));
  const resizeAll = () => resizePlot(gEl(fs));
  const div = cls => { const d = document.createElement("div"); d.className = cls; return d; };

  /* kind "graph": just the graph.  kind "solution": the final answer + computation AND the graph (side by side
     on wide screens, graph below the computation on narrow ones). Elements are moved, never copied. */
  function openFullscreen(el, opener, kind = "graph", gplot = null) {
    if (fs) return;
    const isGraph = kind === "graph";
    const overlay = document.createElement("div");
    overlay.className = "fs-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", isGraph ? "Graph, fullscreen" : "Solution and graph, fullscreen");
    overlay.innerHTML =
      '<div class="fs-panel"><div class="fs-head"><strong>PlaneArea Solver</strong>' +
      '<button type="button" class="fs-exit">✕ Exit Fullscreen</button></div>' +
      '<div class="fs-body"></div>' +
      '<div class="fs-foot"><span>' + (isGraph ? "Scroll to zoom • Drag to pan • Click legend to hide/show • Esc to exit" : "Computation and graph • Scroll to zoom the graph • Esc to exit") + '</span><span class="signature"><b>Maddy Cordova</b></span></div></div>';
    const body = $(".fs-body", overlay);
    fs = { overlay, plot: el, opener, kind, home: el.parentNode, next: el.nextSibling, native: false, g: null };
    document.body.appendChild(overlay);
    document.body.classList.add("fs-lock");

    if (isGraph) {
      body.appendChild(el);
      el.classList.add("is-fs");
      setGraphFonts(el, 23, 26);
    } else {
      body.classList.add("fs-split");
      const sol = div("fs-sol"); sol.appendChild(el); el.classList.add("is-fs-sol"); body.appendChild(sol);
      if (gplot) {
        const gw = div("fs-graph");
        fs.g = { el: gplot, home: gplot.parentNode, next: gplot.nextSibling, wrap: gw };
        gw.appendChild(gplot); gplot.classList.add("is-fs"); body.appendChild(gw);
        setGraphFonts(gplot, 23, 26);
      }
    }

    fs.ro = typeof ResizeObserver === "function" ? new ResizeObserver(resizeAll) : null;
    if (fs.ro) { fs.ro.observe(body); if (fs.g) fs.ro.observe(fs.g.wrap); }
    $(".fs-exit", overlay).addEventListener("click", () => closeFullscreen());
    fs.onKey = e => { if (e.key === "Escape") { e.preventDefault(); closeFullscreen(); } };
    document.addEventListener("keydown", fs.onKey);
    window.addEventListener("resize", resizeAll);
    window.addEventListener("orientationchange", resizeAll);

    // real browser fullscreen when available; otherwise the overlay already fills the viewport
    const req = overlay.requestFullscreen || overlay.webkitRequestFullscreen;
    if (req) {
      try {
        const p = req.call(overlay);
        if (p && p.then) p.then(() => { if (fs) fs.native = true; resizeAll(); }, () => { /* overlay fallback */ });
        else fs.native = true;
      } catch (e) { /* overlay fallback */ }
    }
    requestAnimationFrame(() => { resizeAll(); $(".fs-exit", overlay).focus(); });
    setTimeout(resizeAll, 250);
  }

  function restore(el, home, next) { if (home && home.isConnected) home.insertBefore(el, next && next.parentNode === home ? next : null); }

  function closeFullscreen(silent) {
    if (!fs) return;
    const f = fs; fs = null;
    document.removeEventListener("keydown", f.onKey);
    window.removeEventListener("resize", resizeAll);
    window.removeEventListener("orientationchange", resizeAll);
    if (f.ro) f.ro.disconnect();
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (fsEl) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* ignore */ } }
    // put everything back exactly where it was (graph first so the solution card keeps its slot)
    if (f.g) { f.g.el.classList.remove("is-fs"); restore(f.g.el, f.g.home, f.g.next); setGraphFonts(f.g.el, 18, 19); }
    f.plot.classList.remove("is-fs", "is-fs-sol");
    restore(f.plot, f.home, f.next);
    if (f.kind === "graph") setGraphFonts(f.plot, 18, 19);
    f.overlay.remove();
    document.body.classList.remove("fs-lock");
    const g = f.g ? f.g.el : f.kind === "graph" ? f.plot : null;
    requestAnimationFrame(() => resizePlot(g));
    setTimeout(() => resizePlot(g), 250);
    if (!silent && f.opener && f.opener.isConnected) f.opener.focus();
  }
  // the browser's own Esc / exit gesture leaves native fullscreen: keep the overlay in sync
  ["fullscreenchange", "webkitfullscreenchange"].forEach(ev => document.addEventListener(ev, () => {
    const active = document.fullscreenElement || document.webkitFullscreenElement;
    if (fs && fs.native && !active) closeFullscreen();
    else if (fs && active) resizeAll();
  }));

  /* ---------- Solution rendering ---------- */
  function blocksHTML(blocks) {
    return blocks.map(b => {
      if (b.t === "text") return "<p>" + b.html + "</p>";
      if (b.t === "math") return '<div class="math">' + math(b.tex) + "</div>";
      if (b.t === "points") {
        return '<table class="pts"><thead><tr><th>Point</th></tr></thead><tbody>' +
          b.rows.map(r => "<tr><td>" + math(r.tex, false) + "</td></tr>").join("") + "</tbody></table>";
      }
      return "";
    }).join("");
  }

  function renderSuccess(out, res) {
    const sol = PA.generate(res);
    out.innerHTML =
      '<section class="card problem-card"><div class="label">Problem</div><p>' + esc(res.text) + "</p></section>" +
      '<div class="layout">' +
      '<section class="card graph-card"><div class="graph-tools"><h2 style="margin:0">Graph</h2>' +
      '<div class="tool-btns"><button class="secondary small" id="resetView" type="button">Reset view</button>' +
      '<button class="secondary small" id="fsBtn" type="button" aria-haspopup="dialog">⛶ Fullscreen</button></div></div>' +
      '<div id="plot" class="plot" role="img" aria-label="Graph of the bounded region"></div>' +
      '<p class="hint">Scroll to zoom, drag to pan, click legend entries to show or hide curves. Shaded: the exact region integrated.</p></section>' +
      '<section class="card sol-card"><div class="graph-tools"><h2 style="margin:0">Solution</h2>' +
      '<div class="tool-btns"><button class="secondary small" id="dlPptx" type="button">⬇ Download PowerPoint</button>' +
      '<button class="secondary small" id="fsSolBtn" type="button" aria-haspopup="dialog">⛶ Fullscreen</button></div></div>' +
      '<p class="hint ppt-status" id="pptStatus" role="status" hidden></p>' +
      '<div class="answer-banner"><span class="lab">Final answer</span><span>' +
      math("A=" + sol.answerTex + "\\ \\text{sq. units}", false) + "</span></div>" +
      sol.sections.map(s => '<div class="sec"><h3>' + esc(s.title) + "</h3>" + blocksHTML(s.blocks) + "</div>").join("") +
      "</section></div>";
    closeFullscreen(true);
    const plot = $("#plot", out);
    PA.graph.render(plot, res);
    $("#resetView", out).addEventListener("click", () => PA.graph.reset(plot));
    $("#fsBtn", out).addEventListener("click", () => openFullscreen(plot, $("#fsBtn", out)));
    const dl = $("#dlPptx", out), st = $("#pptStatus", out);
    dl.addEventListener("click", async () => {
      const label = dl.textContent;
      dl.disabled = true; st.hidden = false; st.classList.remove("bad"); st.textContent = "Preparing your PowerPoint…";
      try {
        await PA.exportPptx(res, sol, plot, m => { st.textContent = m; });
        st.textContent = "Done — PlaneArea-Solution.pptx was downloaded.";
      } catch (e) {
        console.error(e); st.classList.add("bad"); st.textContent = "Could not create the PowerPoint: " + (e && e.message ? e.message : e);
      } finally { dl.disabled = false; dl.textContent = label; }
    });
    $("#fsSolBtn", out).addEventListener("click", () => openFullscreen($(".sol-card", out), $("#fsSolBtn", out), "solution", plot));
    return sol;
  }

  function renderError(out, text, r) {
    out.innerHTML =
      '<section class="card problem-card"><div class="label">Problem</div><p>' + esc(text) + "</p></section>" +
      '<section class="card error-card" role="alert"><h2>Unable to automatically solve this problem</h2><p>' + esc(r.message) + "</p>" +
      (r.detail ? '<p class="detail">Detail: ' + esc(r.detail) + "</p>" : "") + "</section>";
  }

  /* ---------- Developer debug panel (off by default) ---------- */
  function debugHTML(d) {
    if (!d) return "";
    const list = a => (a && a.length ? a.map(esc).join("\n") : "—");
    const rows = [
      ["Original Input", d.original],
      ["Extracted Equations", list(d.extracted)],
      ["Normalized Equations", list(d.normalized)],
      ["Detected Boundaries", d.boundaries ? list(d.boundaries) : esc(JSON.stringify(d.model))],
      ["Integration Variable", d.integrationVariable || "—"],
      ["Limits", Array.isArray(d.limits) ? list(d.limits) : esc(JSON.stringify(d.limits))],
      ["Integral", d.integral || "—"],
      ["Parsed model", JSON.stringify(d.model, null, 1)],
    ];
    return '<section class="card debug"><h2>Developer debug</h2>' +
      rows.map(r => "<h4>" + r[0] + "</h4><pre>" + (r[0] === "Original Input" ? esc(r[1]) : r[1]) + "</pre>").join("") + "</section>";
  }
  const DBGKEY = "planearea.debug";
  const dbgGet = () => { try { return localStorage.getItem(DBGKEY) === "1"; } catch (e) { return false; } };
  const dbgSet = on => { try { localStorage.setItem(DBGKEY, on ? "1" : "0"); } catch (e) { /* ignore */ } };

  /* ---------- Solver workspace ---------- */
  let exampleIdx = 0;
  function mountWorkspace(root, opts) {
    root.innerHTML =
      '<section class="card input-card"><label for="problem" class="sr-only" style="position:absolute;left:-999px">Problem</label>' +
      '<textarea id="problem" spellcheck="false" placeholder="Example:\nFind the area bounded by y = x², the x-axis, x = 1 and x = 3."></textarea>' +
      '<div class="btns"><button type="button" id="solve">Solve Problem</button>' +
      '<button type="button" class="secondary" id="clear">Clear</button>' +
      '<button type="button" class="secondary" id="example">Load Example</button>' +
      '<label class="dbg"><input type="checkbox" id="dbg"> Developer debug</label></div>' +
      '<p class="hint">Type ² or ^ for powers (y = x^2), use “x-axis” / “y-axis”, and give limits like “x = 1 and x = 3” or “from x = 0 to x = 3”.</p></section>' +
      '<div id="output" aria-live="polite"></div>' +
      (opts.history ? '<section class="card history" id="history"></section>' : "");
    const ta = $("#problem", root), out = $("#output", root), dbg = $("#dbg", root);
    dbg.checked = dbgGet();
    dbg.addEventListener("change", () => { dbgSet(dbg.checked); if (ta.value.trim()) run(); });

    function run() {
      const text = ta.value.trim();
      if (!text) { out.innerHTML = ""; ta.focus(); return; }
      let r;
      try { r = PA.solve(text); } catch (e) { console.error(e); r = { ok: false, message: PA.MESSAGES.UNSUPPORTED, detail: String(e.message) }; }
      if (r.ok) {
        const sol = renderSuccess(out, r);
        history.add(text, sol.answerPlain);
        if (opts.history) renderHistory();
      } else renderError(out, text, r);
      if (dbg.checked) out.insertAdjacentHTML("beforeend", debugHTML(r.debug));
      out.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderHistory() {
      const box = $("#history", root), list = history.load();
      box.innerHTML = '<div class="head-row"><h2 style="margin:0">Recent problems</h2>' +
        (list.length ? '<button class="secondary small" id="clearHist" type="button">Clear history</button>' : "") + "</div>" +
        (list.length ? "<ul>" + list.map(h =>
          '<li><div class="txt"><b title="' + esc(h.problem) + '">' + esc(h.problem) + "</b><small>A = " + esc(h.answer) + " · " +
          new Date(h.ts).toLocaleString() + '</small></div><button class="secondary small" data-view="' + h.id + '">View</button>' +
          '<button class="secondary small" data-del="' + h.id + '" aria-label="Delete">Delete</button></li>').join("") + "</ul>"
          : '<p class="muted">Solved problems are remembered in this browser only (no account, no server).</p>');
      const c = $("#clearHist", box); if (c) c.onclick = () => { history.clear(); renderHistory(); };
      box.querySelectorAll("[data-view]").forEach(b => b.onclick = () => {
        const h = history.load().find(x => x.id === b.dataset.view); if (h) { ta.value = h.problem; run(); }
      });
      box.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { history.remove(b.dataset.del); renderHistory(); });
    }

    $("#solve", root).onclick = run;
    $("#clear", root).onclick = () => { ta.value = ""; out.innerHTML = ""; ta.focus(); };
    $("#example", root).onclick = () => { ta.value = PA.examples[exampleIdx++ % PA.examples.length].text; run(); };
    ta.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); });
    if (opts.history) renderHistory();
    if (opts.initial) { ta.value = opts.initial; run(); }
  }

  /* ---------- Pages ---------- */
  const pages = {
    home(root) {
      root.innerHTML =
        '<section class="hero"><h1>PlaneArea Solver</h1><p>Plane Areas by Integration. Enter a problem and let the system analyze, solve, and visualize the bounded region.</p></section><div id="ws"></div>' +
        '<section class="card" style="margin-top:16px"><h2>What it does</h2><p class="prose">Type a problem in plain words. The solver finds the curves and lines, locates their intersection points, works out which region they enclose, chooses <i>dx</i> or <i>dy</i>, builds the definite integral, evaluates it exactly when it can, and draws the shaded region — showing every step so you can check the work.</p></section>';
      mountWorkspace($("#ws", root), { history: false });
    },
    solver(root, q) {
      root.innerHTML = '<section class="hero"><h1>Solver</h1><p>Type or paste any Plane Areas by Integration problem.</p></section><div id="ws"></div>';
      mountWorkspace($("#ws", root), { history: true, initial: q });
    },
    examples(root) {
      root.innerHTML = '<section class="hero"><h1>Examples</h1><p>Each one is solved from scratch by the same general solver. Open it in the Solver to see the graph and full working.</p></section><div class="cards">' +
        PA.examples.map((e, i) =>
          '<article class="card">' + (e.worksheet ? '<span class="tag">Worksheet problem</span>' : "") + "<h3>" + esc(e.title) + "</h3><p>" + esc(e.text) +
          '</p><div class="expected">Expected: ' + math(e.expected, false) + '</div><div><a class="btn" href="#/solver?q=' + encodeURIComponent(e.text) + '">Solve this</a></div></article>').join("") + "</div>";
    },
    how(root) {
      const steps = [
        ["Enter the problem", "Write the question in words or just the equations. Superscripts (x²), “x-axis”, “y-axis” and limits such as “x = 1 and x = 3” are understood."],
        ["Detect the boundaries", "Each equation becomes a curve: y = f(x), x = g(y), a vertical line, a horizontal line, or an implicit relation like y² = 4x that is solved for one variable. The axes are added when mentioned."],
        ["Find the intersections", "Every pair of boundaries is intersected (exact factoring for polynomials, numeric root finding otherwise). These points are the corners of the region and supply the limits."],
        ["Select dx or dy", "The enclosed region is cut into slices both ways. Vertical slices give Upper − Lower; horizontal slices give Right − Left. The direction needing fewer integrals and no ± square-root branches wins, and the reason is shown."],
        ["Determine the limits", "Where the upper/lower (or right/left) curve changes, the region is split at that point and the areas are added."],
        ["Create the integral", "A = ∫ [upper − lower] dx  or  A = ∫ [right − left] dy, written with the actual curves."],
        ["Evaluate the integral", "Polynomials are integrated exactly with fractions (power rule, then F(b) − F(a)). Common trig, exponential and root functions use a table; anything else falls back to numerical integration and says so."],
        ["Graph the region", "The shaded region is drawn from the very same curves and limits used in the integral. Before an answer is shown it is checked against the detected region; if the checks fail you get an honest error instead."],
      ];
      root.innerHTML = '<section class="hero"><h1>How It Works</h1><p>The same eight steps a student follows on paper — done transparently.</p></section><ol class="how-steps">' +
        steps.map(s => "<li><h3>" + s[0] + "</h3><p>" + s[1] + "</p></li>").join("") + "</ol>";
    },
    about(root) {
      root.innerHTML = '<section class="hero"><h1>About</h1></section><section class="card prose"><p>PlaneArea Solver is an educational tool for the topic <b>Plane Areas by Integration</b> in Integral Calculus. It is not a general calculus system: it focuses on areas under curves, between curves, and bounded by the axes and by vertical or horizontal lines.</p>' +
        "<p>Everything runs in your browser. There is no server, no database, no account and no AI service: the parsing, intersection finding, region detection and integration are ordinary, verifiable mathematics (math.js for expression handling, Plotly for graphs, KaTeX for notation).</p>" +
        "<p><b>Honest limits.</b> If the boundaries do not enclose a finite region, or the region is ambiguous, or an equation is outside the supported types, the solver says so instead of guessing.</p>" +
        "<p>Created by <b>Maddy Cordova</b>.</p>" +
        "<p>Solved problems can be remembered in this browser only (localStorage); you can delete them at any time from the Solver page.</p></section>";
    },
  };

  /* ---------- Router ---------- */
  function route() {
    const hash = location.hash.replace(/^#\/?/, "") || "home";
    const [name, query] = hash.split("?");
    const page = pages[name] ? name : "home";
    closeFullscreen(true);
    const params = new URLSearchParams(query || "");
    document.querySelectorAll("#nav a").forEach(a => {
      if (a.dataset.page === page) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    pages[page](app, params.get("q") || "");
    document.title = "PlaneArea Solver — " + (page === "home" ? "Plane Areas by Integration" : page[0].toUpperCase() + page.slice(1));
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  route();
})();
