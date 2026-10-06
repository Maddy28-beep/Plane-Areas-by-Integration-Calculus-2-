/* exportPptx.js — builds a PowerPoint (.pptx) of the current solution, entirely in the browser.
   PptxGenJS and html2canvas are loaded from a CDN only when the button is pressed.
   Equations are typeset with KaTeX and captured as images so they look exactly like on screen. */
(function (g) {
  "use strict";
  const PA = (g.PA = g.PA || {});

  const URLS = {
    pptx: "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js",
    h2c: "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
  };
  const pending = {};
  function loadScript(url) {
    if (!pending[url]) {
      pending[url] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url; s.onload = resolve;
        s.onerror = () => { delete pending[url]; reject(new Error("could not load a required library (check your internet connection)")); };
        document.head.appendChild(s);
      });
    }
    return pending[url];
  }

  const TEAL = "0A3F3C", TEAL2 = "0F5C58", GOLD = "C9A227", INK = "1B2A2A", MUTED = "5B6B6B", SOFT = "E5F1F0";
  const W = 13.333, H = 7.5, TOP = 1.15, BOTTOM = 6.75, LEFT = 0.7, WIDTH = W - 2 * LEFT;

  const unesc = s => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  function runs(html, base) {
    const out = []; let bold = false, ital = false;
    html.split(/(<\/?[bi]>)/).forEach(part => {
      if (part === "<b>") bold = true; else if (part === "</b>") bold = false;
      else if (part === "<i>") ital = true; else if (part === "</i>") ital = false;
      else if (part) out.push({ text: unesc(part.replace(/<[^>]+>/g, "")), options: Object.assign({ bold, italic: ital }, base) });
    });
    return out;
  }
  const plainLen = html => unesc(html.replace(/<[^>]+>/g, "")).length;

  /** typeset one TeX string with KaTeX and capture it as a PNG */
  async function mathImage(tex, host) {
    const el = document.createElement("div");
    el.style.cssText = "display:inline-block;padding:6px 12px;font-size:30px;line-height:1.45;color:#1b2a2a;background:#fff;";
    el.innerHTML = g.katex.renderToString(tex, { displayMode: false, throwOnError: false, strict: "ignore" });
    host.appendChild(el);
    try {
      const canvas = await g.html2canvas(el, { scale: 2, backgroundColor: "#ffffff", logging: false });
      return { data: canvas.toDataURL("image/png"), w: canvas.width / 2, h: canvas.height / 2 };
    } finally { host.removeChild(el); }
  }

  function decorate(pres, slide, title) {
    slide.background = { color: "FFFFFF" };
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.9, fill: { color: TEAL } });
    slide.addShape(pres.ShapeType.rect, { x: 0, y: 0.9, w: W, h: 0.06, fill: { color: GOLD } });
    slide.addText(title, { x: LEFT, y: 0.1, w: WIDTH, h: 0.7, fontFace: "Calibri", fontSize: 26, bold: true, color: "FFFFFF", valign: "middle" });
    slide.addText("PlaneArea Solver — Plane Areas by Integration", { x: LEFT, y: 7.05, w: 7, h: 0.3, fontFace: "Calibri", fontSize: 10, color: MUTED });
    slide.addText("Maddy Cordova", { x: W - LEFT - 3.2, y: 7.0, w: 2.7, h: 0.35, fontFace: "Georgia", italic: true, fontSize: 13, color: TEAL2, align: "right" });
    slide.slideNumber = { x: W - LEFT - 0.4, y: 7.05, w: 0.4, h: 0.3, fontFace: "Calibri", fontSize: 10, color: MUTED };
  }

  /** flowing layout: starts a continuation slide when a block no longer fits */
  class Flow {
    constructor(pres, title) { this.pres = pres; this.title = title; this.n = 0; this.next(); }
    next() {
      this.slide = this.pres.addSlide();
      decorate(this.pres, this.slide, this.n ? this.title + " (continued)" : this.title);
      this.y = TOP; this.n++;
    }
    need(h) { if (this.y + h > BOTTOM && this.y > TOP + 0.01) this.next(); }
    text(html) {
      const lines = Math.max(1, Math.ceil(plainLen(html) / 100)), h = 0.1 + lines * 0.3;
      this.need(h);
      this.slide.addText(runs(html, { fontFace: "Calibri", fontSize: 16, color: INK }), { x: LEFT, y: this.y, w: WIDTH, h, valign: "top", margin: 2 });
      this.y += h + 0.04;
    }
    image(img, scale = 0.85, maxW = 11, maxH = 1.7, center = true) {
      let w = img.w / 96 * scale, h = img.h / 96 * scale;
      const k = Math.min(1, maxW / w, maxH / h); w *= k; h *= k;
      this.need(h + 0.05);
      this.slide.addImage({ data: img.data, x: center ? (W - w) / 2 : LEFT + 0.35, y: this.y, w, h });
      this.y += h + 0.08;
    }
    points(rows) {
      const h = 0.4 + rows.length * 0.36;
      this.need(h);
      const cell = (t, o) => ({ text: t, options: Object.assign({ fontFace: "Calibri", fontSize: 15, align: "center", valign: "middle" }, o) });
      const data = [[cell("Intersection point", { bold: true, color: "FFFFFF", fill: { color: TEAL2 } })]]
        .concat(rows.map(r => [cell(r, { color: INK })]));
      this.slide.addTable(data, { x: LEFT + 0.35, y: this.y, w: 4.2, colW: [4.2], rowH: 0.36, border: { type: "solid", pt: 0.75, color: "C5D3D3" } });
      this.y += h + 0.1;
    }
  }

  async function exportPptx(res, sol, plot, onProgress) {
    const say = m => { if (onProgress) onProgress(m); };
    say("Loading libraries…");
    await Promise.all([loadScript(URLS.pptx), loadScript(URLS.h2c)]);
    if (!g.PptxGenJS || !g.html2canvas || !g.katex) throw new Error("a required library is unavailable");
    if (g.document.fonts && g.document.fonts.ready) await g.document.fonts.ready;

    const pres = new g.PptxGenJS();
    pres.layout = "LAYOUT_WIDE";
    pres.title = "Plane Areas by Integration — solution";
    pres.author = "PlaneArea Solver";

    /* 1 — title slide */
    {
      const s = pres.addSlide();
      s.background = { color: TEAL };
      s.addShape(pres.ShapeType.rect, { x: 0, y: 3.15, w: W, h: 0.06, fill: { color: GOLD } });
      s.addText("PlaneArea Solver", { x: 0.8, y: 0.7, w: W - 1.6, h: 0.9, fontFace: "Calibri", fontSize: 44, bold: true, color: "FFFFFF" });
      s.addText("Plane Areas by Integration", { x: 0.8, y: 1.55, w: W - 1.6, h: 0.5, fontFace: "Calibri", fontSize: 22, color: "BFD8D6" });
      s.addText(res.text, { x: 0.8, y: 2.1, w: W - 1.6, h: 1.0, fontFace: "Calibri", fontSize: 18, italic: true, color: "FFFFFF", valign: "top", fit: "shrink" });
      s.addText("Final answer", { x: 0.8, y: 3.55, w: 6, h: 0.4, fontFace: "Calibri", fontSize: 14, color: "BFD8D6" });
      s.addText("A = " + sol.answerPlain, { x: 0.8, y: 3.95, w: W - 1.6, h: 0.9, fontFace: "Calibri", fontSize: 36, bold: true, color: "F2D675" });
      s.addText("Created by Maddy Cordova", { x: 0.8, y: 6.5, w: W - 1.6, h: 0.5, fontFace: "Georgia", italic: true, fontSize: 20, color: "F2D675" });
    }

    /* 2 — graph + result card */
    say("Capturing the graph…");
    if (g.Plotly && plot && plot.data) {
      const gw = 900, gh = 600; // small canvas + scale 2: text stays large on the slide and the image stays sharp
      const url = await g.Plotly.toImage(plot, { format: "png", width: gw, height: gh, scale: 2 });
      const s = pres.addSlide();
      decorate(pres, s, "Graph of the bounded region");
      const h = 5.6, w = h * gw / gh;
      s.addShape(pres.ShapeType.roundRect, { x: 0.45, y: 1.1, w: w + 0.2, h: h + 0.2, fill: { color: "FFFFFF" }, line: { color: "C5D3D3", width: 1 }, rectRadius: 0.08 });
      s.addImage({ data: url, x: 0.55, y: 1.2, w, h });
      const cx = 0.45 + w + 0.5, cw = W - cx - 0.45;
      s.addShape(pres.ShapeType.roundRect, { x: cx, y: 1.1, w: cw, h: h + 0.2, fill: { color: SOFT }, line: { color: "C5D3D3", width: 1 }, rectRadius: 0.08 });
      s.addShape(pres.ShapeType.rect, { x: cx, y: 1.1, w: 0.09, h: h + 0.2, fill: { color: GOLD } });
      const lim = res.pieces.map(p => PA.fmt.plainNum(p.t0) + " ≤ " + res.dir + " ≤ " + PA.fmt.plainNum(p.t1)).join("\n");
      const pts = res.points.map(p => "(" + PA.fmt.plainNum(p.x) + ", " + PA.fmt.plainNum(p.y) + ")").join("   ");
      const label = (t, y) => s.addText(t, { x: cx + 0.3, y, w: cw - 0.45, h: 0.3, fontFace: "Calibri", fontSize: 11, bold: true, color: MUTED, charSpacing: 2 });
      label("FINAL ANSWER", 1.35);
      s.addText("A = " + sol.answerPlain.replace(" square units", ""), { x: cx + 0.3, y: 1.65, w: cw - 0.45, h: 0.8, fontFace: "Calibri", fontSize: 30, bold: true, color: TEAL, fit: "shrink" });
      s.addText("square units", { x: cx + 0.3, y: 2.4, w: cw - 0.45, h: 0.3, fontFace: "Calibri", fontSize: 13, color: MUTED });
      label("INTEGRATION", 3.0);
      s.addText("with respect to " + res.dir + (res.dir === "x" ? "  (upper − lower)" : "  (right − left)"), { x: cx + 0.3, y: 3.28, w: cw - 0.45, h: 0.4, fontFace: "Calibri", fontSize: 15, color: INK });
      label("LIMITS", 3.85);
      s.addText(lim, { x: cx + 0.3, y: 4.13, w: cw - 0.45, h: 0.7, fontFace: "Calibri", fontSize: 15, color: INK, valign: "top" });
      label("INTERSECTION POINTS", 5.0);
      s.addText(pts || "—", { x: cx + 0.3, y: 5.28, w: cw - 0.45, h: 0.9, fontFace: "Calibri", fontSize: 15, color: INK, valign: "top" });
    }

    /* 3… — the solution, section by section */
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;z-index:-1;background:#fff;";
    document.body.appendChild(host);
    try {
      const total = sol.sections.reduce((a, sec) => a + sec.blocks.filter(b => b.t === "math").length, 0);
      let done = 0;
      for (const sec of sol.sections) {
        const isFinal = /Final answer/i.test(sec.title);
        const flow = new Flow(pres, sec.title);
        for (const b of sec.blocks) {
          if (b.t === "text") flow.text(b.html);
          else if (b.t === "points") flow.points(b.rows.map(r => "(" + PA.fmt.plainNum(r.x) + ", " + PA.fmt.plainNum(r.y) + ")"));
          else if (b.t === "math") {
            say("Typesetting equations… " + Math.round(100 * (++done) / Math.max(total, 1)) + "%");
            const img = await mathImage(b.tex, host);
            if (isFinal) flow.image(img, 1.5, 11, 2.4, true); else flow.image(img);
          }
        }
      }
    } finally { document.body.removeChild(host); }

    say("Saving…");
    await pres.writeFile({ fileName: "PlaneArea-Solution.pptx" });
  }

  PA.exportPptx = exportPptx;
})(globalThis);
