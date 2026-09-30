/* solutionGenerator.js — turns a solved result into the step-by-step write-up (KaTeX strings). */
(function (g) {
  "use strict";
  const PA = (g.PA = g.PA || {});
  const { Fr, M, texOf } = PA;
  const C = PA.coefs, R = PA.fmt.recognize;

  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const T = html => ({ t: "text", html });
  const MATH = (tex, label) => ({ t: "math", tex, label });
  const num = v => R(v).tex;
  const par = tex => (/[+\-]/.test(tex.replace(/^-/, "")) ? "\\left(" + tex + "\\right)" : tex);
  const neg = tex => (tex.startsWith("-") ? "\\left(" + tex + "\\right)" : tex);

  function factored(d, v, roots) {
    if (d.length - 1 !== roots.length || !roots.length) return null;
    const rs = roots.map(R);
    if (!rs.every(r => r.fr)) return null;
    const lead = d[d.length - 1];
    let out = lead.n === 1 && lead.d === 1 ? "" : lead.n === -1 && lead.d === 1 ? "-" : (lead.d === 1 ? String(lead.n) : "\\left(" + lead.tex() + "\\right)");
    for (const r of rs) {
      const f = r.fr;
      out += f.isZero() ? v : "(" + v + (f.sign() > 0 ? " - " : " + ") + (f.sign() > 0 ? f : f.neg()).tex() + ")";
    }
    return out;
  }

  /** Lines (tex) that show how the intersection(s) of two curves were found. */
  function pairLines(A, B, pts, dir) {
    const lines = [], rootsOf = vr => [...new Set(pts.map(p => vr === "x" ? p.x : p.y))].sort((a, b) => a - b);
    const sol = (v, rs) => rs.map(r => v + "=" + num(r)).join(",\\ ");
    const solve = (d, v, extra) => {
      if (extra) lines.push(...extra);
      lines.push(C.polyTex(d, v) + "=0");
      const rs = rootsOf(v), f = factored(d, v, rs);
      if (f) lines.push(f + "=0");
      lines.push(sol(v, rs));
    };
    const kinds = [A.kind, B.kind].sort().join(",");
    if (A.kind > B.kind) [A, B] = [B, A];
    const fn = c => texOf(c.node);
    if ((kinds === "fx,fx" || kinds === "gy,gy") && A.coefs && B.coefs) {
      const v = A.kind === "fx" ? "x" : "y";
      lines.push(fn(A) + "=" + fn(B));
      solve(C.subCoefs(A.coefs, B.coefs), v);
    } else if (kinds === "fx,h" && A.coefs) {
      const b = Fr.fromNumber(B.value); if (b) { lines.push(fn(A) + "=" + b.tex()); solve(C.subCoefs(A.coefs, [b]), "x"); }
    } else if (kinds === "gy,v" && A.coefs) {
      const b = Fr.fromNumber(B.value); if (b) { lines.push(fn(A) + "=" + b.tex()); solve(C.subCoefs(A.coefs, [b]), "y"); }
    } else if (kinds === "fx,v") {
      pts.forEach(p => lines.push("x=" + num(p.x) + "\\ \\Rightarrow\\ y=" + fn(A).replace(/x/g, "\\left(" + num(p.x) + "\\right)") + "=" + num(p.y)));
    } else if (kinds === "gy,h") {
      pts.forEach(p => lines.push("y=" + num(p.y) + "\\ \\Rightarrow\\ x=" + num(p.x)));
    } else if (kinds === "h,v") {
      lines.push("(" + num(B.value) + ",\\ " + num(A.value) + ")");
    } else if (kinds === "fx,gy" && A.coefs && B.coefs) { // A is fx (y = f(x)), B is gy (x = g(y))
      const fl = A.coefs.length === 2 ? A.coefs : null, gl = B.coefs.length === 2 ? B.coefs : null;
      if (fl && dir === "y" || fl && !gl) { // eliminate x using the line: x = (y - a0)/a1
        const L = [fl[0].neg().div(fl[1]), ONE(fl[1])];
        solve(C.subCoefs(B.coefs, L), "y", ["x=" + C.polyTex(L, "y") + "\\quad\\text{(from } y=" + C.polyTex(A.coefs, "x") + "\\text{)}", C.polyTex(B.coefs, "y") + "=" + C.polyTex(L, "y")]);
      } else if (gl) {
        const L = [gl[0].neg().div(gl[1]), ONE(gl[1])];
        solve(C.subCoefs(A.coefs, L), "x", ["y=" + C.polyTex(L, "x") + "\\quad\\text{(from } x=" + C.polyTex(B.coefs, "y") + "\\text{)}", C.polyTex(A.coefs, "x") + "=" + C.polyTex(L, "x")]);
      } else {
        const d = C.subCoefs(C.composeCoefs(B.coefs, A.coefs), [new Fr(0), new Fr(1)]);
        solve(d, "x", ["\\text{Substitute } y=" + C.polyTex(A.coefs, "x") + " \\text{ into } x=" + C.polyTex(B.coefs, "y")]);
      }
    } else {
      lines.push("\\text{solved numerically: } " + pts.map(p => "(" + num(p.x) + ",\\ " + num(p.y) + ")").join(",\\ "));
    }
    return lines;
  }
  const ONE = f => new Fr(1).div(f);
  /** F(t) for a single-term antiderivative shown as the worksheet does, e.g. 27/3 - 1/3 (not reduced to 9 - 1/3). */
  function unreduced(p, val, t) {
    const terms = p.anti.map((c, i) => [c, i]).filter(([c]) => !c.isZero());
    if (terms.length !== 1 || !Number.isInteger(t)) return val.tex();
    const [c, k] = terms[0];
    if (c.d === 1 || k === 0) return val.tex();
    const n = c.n * Math.pow(t, k);
    return n === 0 ? "0" : (n < 0 ? "-" : "") + "\\frac{" + Math.abs(n) + "}{" + c.d + "}";
  }
  const boundTex = (b, v) => (b.texOverride ? b.texOverride : b.coefs ? C.polyTex(b.coefs, v) : texOf(b.node));

  function generate(res) {
    const dir = res.dir, v = dir, other = dir === "x" ? "y" : "x";
    const byId = new Map(res.curves.map(c => [c.id, c]));
    const label = c => c.plain;
    const sections = [];

    /* Given */
    const given = [T("<b>Problem:</b> " + esc(res.text))];
    given.push(T("Equations and boundaries identified:"));
    res.curves.forEach(c => {
      const tag = c.sourceId === "xaxis" ? "\\quad(x\\text{-axis})" : c.sourceId === "yaxis" ? "\\quad(y\\text{-axis})" : "";
      given.push(MATH(c.tex + tag));
    });
    sections.push({ title: "Given", blocks: given });

    /* Step 1 */
    const b1 = [];
    const side = (t, kind) => {
      const line = res.curves.find(c => c.kind === kind && Math.abs(c.value - t) < 1e-9);
      return line ? line.tex : v + "=" + num(t) + "\\ \\text{(where the boundary curves meet)}";
    };
    const rel = other === "y" ? ["Upper", "Lower", "Left", "Right"] : ["Right", "Left", "Lower", "Upper"];
    res.integ.parts.forEach((p, i) => {
      const nm = res.pieces.length > 1 ? T("<b>For " + limitText(p, v) + ":</b>") : null;
      if (nm) b1.push(nm);
      b1.push(T(dir === "x" ? "Upper boundary:" : "Right boundary:"), MATH(other + "=" + boundTex(p.upper, v)));
      b1.push(T(dir === "x" ? "Lower boundary:" : "Left boundary:"), MATH(other + "=" + boundTex(p.lower, v)));
    });
    const first = res.integ.parts[0], last = res.integ.parts[res.integ.parts.length - 1];
    const lk = dir === "x" ? "v" : "h";
    b1.push(T(dir === "x" ? "Left boundary:" : "Lower boundary:"), MATH(side(first.t0, lk)));
    b1.push(T(dir === "x" ? "Right boundary:" : "Upper boundary:"), MATH(side(last.t1, lk)));
    sections.push({ title: "Step 1 — Identify the boundaries", blocks: b1 });

    /* Step 2 */
    const b2 = [];
    if (res.points.length) {
      b2.push(T("The boundary curves meet at these points, which fix the limits of the region:"));
      const pairs = new Map();
      for (const p of res.points) for (const [a, b] of p.pairs) {
        const k = a + "|" + b;
        if (!pairs.has(k)) pairs.set(k, { a, b, pts: [] });
        pairs.get(k).pts.push(p);
      }
      for (const { a, b, pts } of pairs.values()) {
        const A = byId.get(a), B = byId.get(b);
        b2.push(T("<b>" + esc(label(A)) + "</b> and <b>" + esc(label(B)) + "</b>:"));
        pairLines(A, B, pts, dir).forEach(l => b2.push(MATH(l)));
      }
      b2.push({ t: "points", rows: res.points.map(p => ({ tex: "(" + num(p.x) + ",\\ " + num(p.y) + ")", x: p.x, y: p.y })) });
    } else b2.push(T("No intersection points are needed; the limits are given explicitly."));
    sections.push({ title: "Step 2 — Find intersection points", blocks: b2 });

    /* Step 3 */
    const b3 = [
      MATH("\\text{Integration variable: } " + v),
      MATH("\\text{Method: } \\text{" + (dir === "x" ? "Upper} - \\text{Lower" : "Right} - \\text{Left") + "}"),
      T(esc(res.reason)),
    ];
    res.notes.forEach(n => b3.push(T("<i>" + esc(n) + "</i>")));
    sections.push({ title: "Step 3 — Choose integration direction", blocks: b3 });

    /* Step 4 */
    const b4 = [T("The region extends over:")];
    res.integ.parts.forEach(p => b4.push(MATH(num(p.t0) + "\\le " + v + "\\le " + num(p.t1))));
    sections.push({ title: "Step 4 — Determine the limits", blocks: b4 });

    /* Step 5 */
    const b5 = [MATH(dir === "x" ? "A=\\int_a^b\\left[f(x)-g(x)\\right]dx" : "A=\\int_c^d\\left[R(y)-L(y)\\right]dy", "General formula")];
    const setup = res.integ.parts.map(p =>
      "\\int_{" + num(p.t0) + "}^{" + num(p.t1) + "}\\left(" + texOf(p.upper.node) + " - " + par(texOf(p.lower.node)) + "\\right)d" + v);
    b5.push(MATH("A=" + setup.join(" + ")));
    sections.push({ title: "Step 5 — Set up the integral", blocks: b5 });

    /* Step 6 */
    const b6 = [];
    res.integ.parts.forEach(p => {
      if (p.kind === "poly") {
        b6.push(T("Simplify the integrand and use the power rule:"));
        b6.push(MATH("\\int\\left(" + p.simplifiedTex + "\\right)d" + v + "=" + p.antiTex));
      } else if (p.kind === "table") {
        b6.push(MATH("\\int\\left(" + p.integrandTex + "\\right)d" + v + "=" + p.antiTex));
      } else {
        b6.push(T("No closed-form antiderivative is available in this solver for this integrand, so its value is found by adaptive Simpson numerical integration (accurate to many digits)."));
      }
    });
    sections.push({ title: "Step 6 — Find the antiderivative", blocks: b6 });

    /* Step 7 */
    const b7 = [];
    const partNames = [];
    res.integ.parts.forEach((p, i) => {
      const name = res.integ.parts.length > 1 ? "A_{" + (i + 1) + "}" : "A";
      partNames.push(name);
      const a = num(p.t0), b = num(p.t1);
      if (p.kind === "poly") {
        let l = name + "=\\left[" + p.antiTex + "\\right]_{" + a + "}^{" + b + "}";
        b7.push(MATH(l));
        b7.push(MATH(name + "=\\left(" + C.polySubTex(p.anti, b) + "\\right)-\\left(" + C.polySubTex(p.anti, a) + "\\right)"));
        if (p.exact) {
          b7.push(MATH(name + "=" + unreduced(p, p.FbFr, p.t1) + "-" + neg(unreduced(p, p.FaFr, p.t0))));
          b7.push(MATH(name + "=" + p.exact.tex()));
        } else {
          b7.push(MATH(name + "=" + num(p.Fb) + "-" + neg(num(p.Fa)) + "=" + num(p.value)));
        }
      } else if (p.kind === "table") {
        b7.push(MATH(name + "=\\left[" + p.antiTex + "\\right]_{" + a + "}^{" + b + "}=" + num(p.Fb) + "-" + neg(num(p.Fa)) + "=" + num(p.value)));
      } else {
        b7.push(MATH(name + "=\\int_{" + a + "}^{" + b + "}\\left(" + p.integrandTex + "\\right)d" + v + "\\approx " + PA.fmt.dec(p.value, 6)));
      }
    });
    if (res.integ.parts.length > 1) {
      const total = res.exact ? res.exact.tex() : num(res.value);
      b7.push(MATH("A=" + partNames.join("+") + "=" + total));
    }
    sections.push({ title: "Step 7 — Evaluate", blocks: b7 });

    /* Step 8 */
    const rec = res.exact ? { tex: res.exact.tex(), exact: true } : R(res.value);
    const approx = PA.fmt.dec(res.value, 4);
    const b8 = [MATH("\\boxed{A=" + rec.tex + "\\ \\text{square units}}")];
    if (rec.exact && !/^-?\d+$/.test(rec.tex) && Math.abs(Number(approx) - res.value) < 1e-3) b8.push(MATH("A\\approx " + approx + "\\ \\text{square units}"));
    if (res.integ.numeric) b8.push(T("<i>Value obtained by numerical integration.</i>"));
    sections.push({ title: "Step 8 — Final answer", blocks: b8 });

    return { sections, answerTex: rec.tex, answerPlain: (res.exact ? (res.exact.d === 1 ? res.exact.n : res.exact.n + "/" + res.exact.d) : approx) + " square units", approx };
  }

  function limitText(p, v) { return PA.fmt.plainNum(p.t0) + " ≤ " + v + " ≤ " + PA.fmt.plainNum(p.t1); }

  PA.generate = generate;
})(globalThis);
