/* integration.js — definite integrals. Exact for rational polynomials; a small antiderivative
   table for common functions; adaptive Simpson only as a clearly-labelled fallback. */
(function (g) {
  "use strict";
  const PA = (g.PA = g.PA || {});
  const { Fr, M, mpFromNode, freeOf, texOf } = PA;
  const C = PA.coefs;

  function simpson(f, a, b, tol = 1e-11) {
    function rec(a, b, fa, fc, fb, S, tol, d) {
      const c = (a + b) / 2, l = (a + c) / 2, r = (c + b) / 2, fl = f(l), fr = f(r);
      const SL = (c - a) / 6 * (fa + 4 * fl + fc), SR = (b - c) / 6 * (fc + 4 * fr + fb);
      if (d <= 0 || Math.abs(SL + SR - S) <= 15 * tol) return SL + SR + (SL + SR - S) / 15;
      return rec(a, c, fa, fl, fc, SL, tol / 2, d - 1) + rec(c, b, fc, fr, fb, SR, tol / 2, d - 1);
    }
    const c = (a + b) / 2, fa = f(a), fb = f(b), fc = f(c);
    return rec(a, b, fa, fc, fb, (b - a) / 6 * (fa + 4 * fc + fb), tol, 24);
  }

  /* ---- antiderivative table for non-polynomial integrands (returns a math.js string or null) ---- */
  function linear(node, s) { // node = a*s + b ?
    try {
      const code = node.compile(), f = v => code.evaluate({ [s]: v });
      const b = f(0), a = f(1) - b;
      if (![a, b].every(Number.isFinite) || Math.abs(a) < 1e-12) return null;
      return Math.abs(f(2) - (2 * a + b)) < 1e-9 && Math.abs(f(-3) - (-3 * a + b)) < 1e-9 ? { a, b } : null;
    } catch (e) { return null; }
  }
  const S = n => "(" + n.toString() + ")";
  function anti(n, s) {
    if (freeOf(n, s)) return S(n) + "*" + s;
    switch (n.type) {
      case "SymbolNode": return s + "^2/2";
      case "ParenthesisNode": return anti(n.content, s);
      case "OperatorNode": {
        const [p, q] = n.args;
        switch (n.fn) {
          case "unaryMinus": { const a = anti(p, s); return a && "-(" + a + ")"; }
          case "unaryPlus": return anti(p, s);
          case "add": case "subtract": {
            const a = anti(p, s), b = anti(q, s);
            return a && b && "(" + a + ")" + (n.fn === "add" ? "+" : "-") + "(" + b + ")";
          }
          case "multiply":
            if (freeOf(p, s)) { const a = anti(q, s); return a && S(p) + "*(" + a + ")"; }
            if (freeOf(q, s)) { const a = anti(p, s); return a && S(q) + "*(" + a + ")"; }
            return null;
          case "divide": {
            if (freeOf(q, s)) { const a = anti(p, s); return a && "(" + a + ")/" + S(q); }
            const l = freeOf(p, s) && linear(q, s);
            return l ? S(p) + "/" + l.a + "*log(abs" + S(q) + ")" : null;
          }
          case "pow": {
            if (freeOf(q, s)) {
              const l = linear(p, s); if (!l) return null;
              const e = M.evaluate(q.toString());
              if (typeof e !== "number") return null;
              return Math.abs(e + 1) < 1e-12 ? "log(abs" + S(p) + ")/" + l.a : S(p) + "^" + (e + 1) + "/" + (l.a * (e + 1));
            }
            if (freeOf(p, s)) {
              const l = linear(q, s), base = M.evaluate(p.toString());
              return l && base > 0 && base !== 1 ? S(p) + "^" + S(q) + "/(" + l.a + "*log(" + base + "))" : null;
            }
            return null;
          }
        }
        return null;
      }
      case "FunctionNode": {
        const arg = n.args[0], l = linear(arg, s), name = n.fn.name;
        if (!l) return null;
        switch (name) {
          case "sin": return "-cos" + S(arg) + "/" + l.a;
          case "cos": return "sin" + S(arg) + "/" + l.a;
          case "exp": return "exp" + S(arg) + "/" + l.a;
          case "sqrt": return "(2/3)*" + S(arg) + "^(3/2)/" + l.a;
          case "tan": return "-log(abs(cos" + S(arg) + "))/" + l.a;
        }
      }
    }
    return null;
  }

  /** Integrate (upper - lower) over [t0, t1]; returns everything the solution writer needs. */
  function integratePiece(piece, s) {
    const u = piece.upper, l = piece.lower;
    const str = "(" + u.node.toString() + ") - (" + l.node.toString() + ")";
    const node = M.parse(str), a = piece.t0, b = piece.t1;
    const fa = Fr.fromNumber(a, 2000, 1e-9), fb = Fr.fromNumber(b, 2000, 1e-9);
    const res = {
      t0: a, t1: b, fa, fb, upper: u, lower: l, sliceVar: s, integrandNode: node,
      integrandTex: texOf(node),
    };
    const mp = mpFromNode(node), cf = mp && mp.uni(s);
    if (cf) { // exact polynomial route
      const F = [new Fr(0), ...cf.map((c, i) => c.div(new Fr(i + 1)))];
      res.kind = "poly"; res.expanded = cf; res.anti = F;
      res.antiTex = C.polyTex(F, s);
      res.simplifiedTex = C.polyTex(cf, s);
      const Fa = PA.coefs.evalCoefs(F, a), Fb = PA.coefs.evalCoefs(F, b);
      res.Fa = Fa; res.Fb = Fb; res.value = Fb - Fa;
      if (fa && fb) {
        const ev = (x) => F.reduce((acc, c, i) => acc.add(c.mul(powFr(x, i))), new Fr(0));
        res.FaFr = ev(fa); res.FbFr = ev(fb); res.exact = res.FbFr.sub(res.FaFr);
        res.value = res.exact.num();
      }
      return res;
    }
    const as = anti(node, s);
    if (as) {
      const code = M.compile(as), F = v => { const r = code.evaluate({ [s]: v }); return typeof r === "number" ? r : NaN; };
      const v = F(b) - F(a);
      if (Number.isFinite(v) && Math.abs(v - simpson(t => res_eval(node, s, t), a, b)) < 1e-6 * (1 + Math.abs(v))) {
        res.kind = "table"; res.antiTex = M.parse(as).toTex({ parenthesis: "keep", implicit: "hide" });
        res.Fa = F(a); res.Fb = F(b); res.value = v;
        return res;
      }
    }
    res.kind = "numeric";
    res.value = simpson(t => res_eval(node, s, t), a, b);
    return res;
  }
  const evalCache = new WeakMap();
  function res_eval(node, s, t) {
    let code = evalCache.get(node);
    if (!code) { code = node.compile(); evalCache.set(node, code); }
    const r = code.evaluate({ [s]: t });
    return typeof r === "number" ? r : NaN;
  }
  function powFr(x, n) { let r = new Fr(1); for (let i = 0; i < n; i++) r = r.mul(x); return r; }

  function integrate(pieces, s) {
    const parts = pieces.map(p => integratePiece(p, s));
    const value = parts.reduce((a, p) => a + p.value, 0);
    const exact = parts.every(p => p.exact) ? parts.reduce((a, p) => a.add(p.exact), new Fr(0)) : null;
    const numeric = parts.some(p => p.kind === "numeric");
    return { parts, value, exact, numeric };
  }

  PA.integration = { integrate, integratePiece, simpson, anti };
})(globalThis);
