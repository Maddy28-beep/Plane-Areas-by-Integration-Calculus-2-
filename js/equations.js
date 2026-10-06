/* equations.js — exact arithmetic, polynomials, equation classification, number formatting.
   Loaded as a classic script; everything hangs off the global PA namespace. */
(function (g) {
  "use strict";
  const PA = (g.PA = g.PA || {});
  const M = g.math.create(g.math.all, { predictable: true });
  PA.M = M;

  /* ---------- Exact rationals ---------- */
  const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a; };
  class Fr {
    constructor(n, d = 1) {
      if (d < 0) { n = -n; d = -d; }
      const k = gcd(n, d) || 1;
      this.n = n / k; this.d = d / k;
    }
    add(o) { return new Fr(this.n * o.d + o.n * this.d, this.d * o.d); }
    sub(o) { return new Fr(this.n * o.d - o.n * this.d, this.d * o.d); }
    mul(o) { return new Fr(this.n * o.n, this.d * o.d); }
    div(o) { return new Fr(this.n * o.d, this.d * o.n); }
    neg() { return new Fr(-this.n, this.d); }
    isZero() { return this.n === 0; }
    isInt() { return this.d === 1; }
    num() { return this.n / this.d; }
    sign() { return Math.sign(this.n); }
    tex() {
      if (this.d === 1) return String(this.n);
      return (this.n < 0 ? "-" : "") + "\\frac{" + Math.abs(this.n) + "}{" + this.d + "}";
    }
    str() { return this.d === 1 ? "(" + this.n + ")" : "(" + this.n + "/" + this.d + ")"; }
    static fromNumber(v, maxDen = 10000, tol = 1e-9) {
      if (!Number.isFinite(v)) return null;
      const t = tol * Math.max(1, Math.abs(v));
      for (let q = 1; q <= maxDen; q++) {
        const p = Math.round(v * q);
        if (Math.abs(v - p / q) <= t) return new Fr(p, q);
      }
      return null;
    }
  }
  const ZERO = new Fr(0), ONE = new Fr(1);

  /* ---------- Two-variable polynomials (terms keyed "i,j" = x^i y^j) ---------- */
  class MP {
    constructor(t) { this.t = t || new Map(); }
    static konst(fr) { const m = new Map(); if (!fr.isZero()) m.set("0,0", fr); return new MP(m); }
    static sym(v) { return new MP(new Map([[v === "x" ? "1,0" : "0,1", ONE]])); }
    add(o) {
      const m = new Map(this.t);
      for (const [k, c] of o.t) { const s = (m.get(k) || ZERO).add(c); s.isZero() ? m.delete(k) : m.set(k, s); }
      return new MP(m);
    }
    neg() { return this.scale(new Fr(-1)); }
    sub(o) { return this.add(o.neg()); }
    scale(fr) {
      const m = new Map();
      if (!fr.isZero()) for (const [k, c] of this.t) m.set(k, c.mul(fr));
      return new MP(m);
    }
    mul(o) {
      const m = new Map();
      for (const [k1, c1] of this.t) for (const [k2, c2] of o.t) {
        const [i1, j1] = k1.split(",").map(Number), [i2, j2] = k2.split(",").map(Number);
        const k = (i1 + i2) + "," + (j1 + j2), s = (m.get(k) || ZERO).add(c1.mul(c2));
        s.isZero() ? m.delete(k) : m.set(k, s);
      }
      return new MP(m);
    }
    pow(n) { let r = MP.konst(ONE); for (let i = 0; i < n; i++) r = r.mul(this); return r; }
    isZero() { return this.t.size === 0; }
    isConst() { return this.t.size === 0 || (this.t.size === 1 && this.t.has("0,0")); }
    constVal() { return this.t.get("0,0") || ZERO; }
    deg(v) { let d = 0; for (const k of this.t.keys()) d = Math.max(d, Number(k.split(",")[v === "x" ? 0 : 1])); return d; }
    coef(v, p) { // coefficient of v^p (as a polynomial in the other variable)
      const m = new Map(), ix = v === "x" ? 0 : 1;
      for (const [k, c] of this.t) {
        const e = k.split(",").map(Number);
        if (e[ix] === p) { e[ix] = 0; m.set(e[0] + "," + e[1], c); }
      }
      return new MP(m);
    }
    /** coefficients [c0, c1, ...] in variable v; requires the other variable to be absent */
    uni(v) {
      const other = v === "x" ? "y" : "x";
      if (this.deg(other) > 0) return null;
      const out = [], d = this.deg(v);
      for (let i = 0; i <= d; i++) out.push(this.coef(v, i).constVal());
      return out;
    }
  }

  /** Convert a math.js node into an MP polynomial, or null if it is not a rational polynomial. */
  function mpFromNode(node) {
    switch (node.type) {
      case "ConstantNode": {
        if (typeof node.value !== "number") return null;
        const f = Fr.fromNumber(node.value, 10000, 1e-12);
        return f ? MP.konst(f) : null;
      }
      case "ParenthesisNode": return mpFromNode(node.content);
      case "SymbolNode": return node.name === "x" || node.name === "y" ? MP.sym(node.name) : null;
      case "OperatorNode": {
        const a = node.args.map(mpFromNode);
        if (a.some(z => z === null)) return null;
        switch (node.fn) {
          case "add": return a[0].add(a[1]);
          case "subtract": return a[0].sub(a[1]);
          case "multiply": return a[0].mul(a[1]);
          case "unaryMinus": return a[0].neg();
          case "unaryPlus": return a[0];
          case "divide":
            return a[1].isConst() && !a[1].constVal().isZero() ? a[0].scale(ONE.div(a[1].constVal())) : null;
          case "pow": {
            if (!a[1].isConst() || !a[1].constVal().isInt()) return null;
            const n = a[1].constVal().n;
            return n >= 0 && n <= 12 ? a[0].pow(n) : null;
          }
        }
        return null;
      }
    }
    return null;
  }

  /* ---------- Univariate coefficient arrays (Fr[]) ---------- */
  const evalCoefs = (c, t) => { let r = 0; for (let i = c.length - 1; i >= 0; i--) r = r * t + c[i].num(); return r; };
  const trim = c => { c = c.slice(); while (c.length > 1 && c[c.length - 1].isZero()) c.pop(); return c; };
  const subCoefs = (a, b) => trim(Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] || ZERO).sub(b[i] || ZERO)));
  function composeCoefs(outer, inner) { // outer(inner(t))
    let r = [ZERO];
    for (let i = outer.length - 1; i >= 0; i--) { r = mulCoefs(r, inner); r[0] = r[0].add(outer[i]); }
    return trim(r);
  }
  function mulCoefs(a, b) {
    const r = Array.from({ length: a.length + b.length - 1 }, () => ZERO);
    a.forEach((x, i) => b.forEach((y, j) => { r[i + j] = r[i + j].add(x.mul(y)); }));
    return trim(r);
  }
  function coefTerm(c, p, v) { // "3x^2" style term (absolute value of coefficient), tex
    const abs = c.sign() < 0 ? c.neg() : c;
    const coefTex = abs.d === 1 ? (abs.n === 1 && p > 0 ? "" : String(abs.n)) : abs.tex();
    const vt = p === 0 ? "" : p === 1 ? v : v + "^{" + p + "}";
    return coefTex + vt;
  }
  function polyTex(c, v) {
    let out = "";
    for (let p = c.length - 1; p >= 0; p--) {
      if (c[p].isZero()) continue;
      const neg = c[p].sign() < 0;
      out += (out ? (neg ? " - " : " + ") : (neg ? "-" : "")) + coefTerm(c[p], p, v);
    }
    return out || "0";
  }
  function polyString(c, v) { // math.js-parsable, e.g. "25-x^2", "(1/4)*y^2+2*y-3"
    let out = "";
    for (let p = c.length - 1; p >= 0; p--) {
      if (c[p].isZero()) continue;
      const neg = c[p].sign() < 0, a = neg ? c[p].neg() : c[p];
      const coef = a.d === 1 ? String(a.n) : "(" + a.n + "/" + a.d + ")";
      let term;
      if (p === 0) term = coef;
      else term = (a.d === 1 && a.n === 1 ? "" : coef + "*") + v + (p > 1 ? "^" + p : "");
      out += (out ? (neg ? "-" : "+") : (neg ? "-" : "")) + term;
    }
    return out || "0";
  }
  function mpString(mp) { // polynomial in x only (or y only), math.js-parsable
    const v = mp.deg("y") > 0 ? "y" : "x", u = mp.uni(v);
    return u ? polyString(u, v) : null;
  }
  /** polynomial with the variable replaced by a literal value, as tex: (1/3)(3)^3 ... */
  function polySubTex(c, valueTex) {
    let out = "";
    for (let p = c.length - 1; p >= 0; p--) {
      if (c[p].isZero()) continue;
      const neg = c[p].sign() < 0, abs = neg ? c[p].neg() : c[p];
      let term = abs.d === 1 ? (abs.n === 1 && p > 0 ? "" : String(abs.n)) : abs.tex();
      if (p > 0) term += (term && abs.d === 1 ? "\\cdot " : "") + "\\left(" + valueTex + "\\right)" + (p > 1 ? "^{" + p + "}" : "");
      out += (out ? (neg ? " - " : " + ") : (neg ? "-" : "")) + term;
    }
    return out || "0";
  }

  /* ---------- Number recognition / formatting ---------- */
  const SQRTS = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15];
  function recognize(v) {
    if (!Number.isFinite(v)) return { tex: "\\text{undefined}", exact: false };
    const fr = Fr.fromNumber(v, 2000, 1e-9);
    if (fr) return { tex: fr.tex(), exact: true, fr };
    const rp = Fr.fromNumber(v / Math.PI, 100, 1e-9);
    if (rp && !rp.isZero()) {
      const n = Math.abs(rp.n), pre = n === 1 ? "" : String(n), sgn = rp.n < 0 ? "-" : "";
      return { tex: rp.d === 1 ? sgn + pre + "\\pi" : sgn + "\\frac{" + pre + "\\pi}{" + rp.d + "}", exact: true };
    }
    for (const r of SQRTS) for (let s = 1; s <= 12; s++) for (let q = -12; q <= 12; q++) {
      if (!q) continue;
      const p = Math.round(v * s - q * Math.sqrt(r));
      if (Math.abs(v - (p + q * Math.sqrt(r)) / s) < 1e-9) {
        const gg = gcd(gcd(p, q), s), P = p / gg, Q = q / gg, S = s / gg;
        const sq = (Math.abs(Q) === 1 ? "" : Math.abs(Q)) + "\\sqrt{" + r + "}";
        const top = (P ? P + (Q < 0 ? " - " : " + ") : (Q < 0 ? "-" : "")) + sq;
        return { tex: S === 1 ? top : "\\frac{" + top + "}{" + S + "}", exact: true };
      }
    }
    return { tex: dec(v), exact: false };
  }
  const dec = (v, d = 4) => { const s = (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(/\.?0+$/, ""); return s === "-0" ? "0" : s; };
  const plainNum = v => { const r = recognize(v); return r.fr ? (r.fr.d === 1 ? String(r.fr.n) : r.fr.n + "/" + r.fr.d) : dec(v); };

  /* ---------- Curves ---------- */
  const superscripts = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  function pretty(s) {
    return s.replace(/\s*\^\s*\(?(-?\d+)\)?/g, (m, d) => d.split("").map(ch => superscripts[ch] || "⁻").join(""))
      .replace(/\*/g, "").replace(/\bsqrt\b/g, "√").replace(/\bpi\b/g, "π").replace(/\s+/g, " ").trim();
  }
  const texOf = n => n.toTex({ parenthesis: "keep", implicit: "hide" })
    .replace(/\{ ([a-z])\}/g, " $1").replace(/(\d)~\s*/g, "$1").replace(/(\d)\s*\\cdot\s*(?=[a-z\\(])/g, "$1").replace(/~\s*/g, " ").replace(/\s+/g, " ").trim();
  const freeOf = (node, name) => !node.filter(n => n.type === "SymbolNode" && n.name === name).length;

  function symbolsOK(node) {
    let bad = null;
    node.traverse((n, path) => {
      if (n.type === "SymbolNode" && path !== "fn" && !["x", "y", "pi", "e"].includes(n.name)) bad = n.name;
    });
    return bad;
  }

  let uid = 0;
  function makeCurve(o) {
    const c = Object.assign({ id: "c" + (uid++), coefs: null }, o);
    if (c.kind === "fx" || c.kind === "gy") {
      const code = c.node.compile(), v = c.kind === "fx" ? "x" : "y";
      c.indep = v;
      c.fn = t => { try { const r = code.evaluate({ [v]: t }); return typeof r === "number" ? r : NaN; } catch (e) { return NaN; } };
    } else { c.fn = () => c.value; }
    return c;
  }

  function lineCurve(kind, value, sourceId, tex) {
    const name = kind === "v" ? "x" : "y", vs = plainNum(value);
    return makeCurve({
      kind, value, sourceId, tex: tex || name + "=" + recognize(value).tex, plain: name + " = " + vs,
      node: M.parse(String(value)),
    });
  }

  function functionCurve(kind, node, sourceId, tex, plain, extra) {
    const v = kind === "fx" ? "x" : "y", mp = mpFromNode(node);
    return makeCurve(Object.assign({
      kind, node, sourceId, tex, plain,
      coefs: mp ? mp.uni(v) : null,
    }, extra || {}));
  }

  /** Turn "lhs = rhs" into one or two curves. Returns {curves} or {error}. */
  function classifyEquation(lhsSrc, rhsSrc, sourceId) {
    let L, R;
    try { L = M.parse(lhsSrc); R = M.parse(rhsSrc); } catch (e) { return { error: { code: "PARSE", detail: e.message } }; }
    const bad = symbolsOK(L) || symbolsOK(R);
    if (bad) return { error: { code: "UNSUPPORTED", detail: "unknown symbol “" + bad + "”" } };
    const tex = texOf(L) + "=" + texOf(R), plain = pretty(lhsSrc + " = " + rhsSrc);
    const isSym = (n, s) => n.type === "SymbolNode" && n.name === s;

    // put the lone variable on the left when written backwards (e.g. "4 = y")
    if ((isSym(R, "x") || isSym(R, "y")) && !(isSym(L, "x") || isSym(L, "y"))) [L, R] = [R, L];

    for (const [sym, kind, other] of [["y", "fx", "y"], ["x", "gy", "x"]]) {
      if (!isSym(L, sym) || !freeOf(R, other)) continue;
      const v = sym === "y" ? "x" : "y";
      if (freeOf(R, v)) { // constant: a line
        let val; try { val = M.evaluate(R.toString()); } catch (e) { return { error: { code: "PARSE", detail: e.message } }; }
        if (typeof val !== "number" || !Number.isFinite(val)) return { error: { code: "PARSE", detail: "not a number" } };
        return { curves: [lineCurve(sym === "y" ? "h" : "v", val, sourceId, tex)] };
      }
      return { curves: [functionCurve(kind, R, sourceId, tex, plain)] };
    }

    // implicit polynomial relations, e.g.  y^2 = 4x
    const l = mpFromNode(L), r = mpFromNode(R);
    if (!l || !r) return { error: { code: "UNSUPPORTED", detail: "equation form" } };
    const F = l.sub(r);
    if (F.isZero() || F.isConst()) return { error: { code: "UNSUPPORTED", detail: "no variables" } };
    const dx = F.deg("x"), dy = F.deg("y");

    if (dy === 0) { // polynomial in x only: x = a
      const u = F.uni("x");
      if (u.length === 2) return { curves: [lineCurve("v", u[0].neg().div(u[1]).num(), sourceId, tex)] };
      return { error: { code: "UNSUPPORTED", detail: "higher-degree vertical relation" } };
    }
    if (dx === 0) {
      const u = F.uni("y");
      if (u.length === 2) return { curves: [lineCurve("h", u[0].neg().div(u[1]).num(), sourceId, tex)] };
      return { error: { code: "UNSUPPORTED", detail: "higher-degree horizontal relation" } };
    }
    const mk = (kind, v, num) => { // single-valued solve: v-variable eliminated
      const other = v === "x" ? "y" : "x"; // F = c*other + F0(v)
      const c = F.coef(other, 1).constVal(), F0 = F.coef(other, 0);
      const rhs = F0.neg().scale(ONE.div(c));
      const node = M.parse(mpString(rhs) || "0");
      return functionCurve(kind, node, sourceId, tex, plain);
    };
    if (dy === 1 && F.coef("y", 1).isConst()) return { curves: [mk("fx", "x")] };
    if (dx === 1 && F.coef("x", 1).isConst()) return { curves: [mk("gy", "y")] };

    const branches = (other, kind) => { // F quadratic in `other`, constant leading coefficient
      const A = F.coef(other, 2);
      if (!A.isConst()) return null;
      const a = A.constVal(), B = mpString(F.coef(other, 1)) || "0", C = mpString(F.coef(other, 0)) || "0";
      const out = [];
      const Bmp = F.coef(other, 1), Cmp = F.coef(other, 0);
      for (const s of ["+", "-"]) {
        if (Bmp.isZero()) { // y = ±sqrt(-C/A): print it simply
          const rad = Cmp.neg().scale(ONE.div(a)), rs = mpString(rad) || "0", v = rad.deg("y") > 0 ? "y" : "x";
          const ru = rad.uni(v);
          out.push(functionCurve(kind, M.parse((s === "-" ? "-" : "") + "sqrt(" + rs + ")"), sourceId, tex, plain, {
            branch: s, texOverride: (s === "-" ? "-" : "") + "\\sqrt{" + (ru ? polyTex(ru, v) : rs) + "}",
          }));
          continue;
        }
        const expr = "(-(" + B + ") " + s + " sqrt((" + B + ")^2 - 4*" + a.str() + "*(" + C + ")))/(2*" + a.str() + ")";
        out.push(functionCurve(kind, M.parse(expr), sourceId, tex, plain, { branch: s }));
      }
      return out;
    };
    if (dy === 2) { const b = branches("y", "fx"); if (b) return { curves: b }; }
    if (dx === 2) { const b = branches("x", "gy"); if (b) return { curves: b }; }
    return { error: { code: "UNSUPPORTED", detail: "relation" } };
  }

  Object.assign(PA, {
    Fr, MP, mpFromNode, classifyEquation, lineCurve, makeCurve,
    coefs: { evalCoefs, subCoefs, composeCoefs, mulCoefs, polyTex, polyString, polySubTex, trim },
    fmt: { recognize, dec, plainNum, pretty },
    freeOf, texOf,
  });
})(globalThis);
