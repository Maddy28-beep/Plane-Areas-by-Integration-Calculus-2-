/* parser.js — natural-language problem -> equations, axes, limits.
   Pipeline:  user input -> normalise Unicode -> isolate equations -> normalise each expression
              (superscripts, operators, implicit multiplication) -> validate -> math.js. */
(function (g) {
  "use strict";
  const PA = (g.PA = g.PA || {});

  const SUPERSCRIPT = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
  const FUNCS = ["sin", "cos", "tan", "asin", "acos", "atan", "sqrt", "cbrt", "abs", "ln", "log", "log10", "log2", "exp"];

  class ParseError extends Error {}

  /** Symbol-level clean-up that is safe to run on a whole sentence (never touches letters). */
  function normalizeUnicode(s) {
    return String(s)
      // superscript runs: x² -> x^2, x⁻² -> x^(-2), x²³ -> x^23
      .replace(/([⁺⁻]?)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (m, sign, digits) => {
        const d = digits.split("").map(c => SUPERSCRIPT[c]).join("");
        return sign === "⁻" ? "^(-" + d + ")" : "^" + d;
      })
      .replace(/[ˆ＾∧]/g, "^").replace(/\*\*/g, "^")
      .replace(/[−–—‐‑‒﹣－]/g, "-").replace(/＋/g, "+")
      .replace(/[×·⋅∙✕]/g, "*").replace(/[÷∕⁄]/g, "/")
      .replace(/π/g, "pi").replace(/\\pi\b/g, "pi")
      .replace(/√\s*\(/g, "sqrt(").replace(/√\s*([a-z0-9.]+)/gi, "sqrt($1)")
      .replace(/[“”]/g, '"').replace(/[’‘]/g, "'")
      .replace(/[  -​  　]/g, " ");
  }

  /** Text-level normalisation used before equations are isolated. */
  function normalize(text) { return normalizeUnicode(text).replace(/\s+/g, " ").trim(); }

  /**
   * Turn one mathematical expression into canonical math.js syntax with no spaces.
   *   "x ²" -> "x^2",  "4 − x²" -> "4-x^2",  "3x² + 2x - 5" -> "3*x^2+2*x-5",  "2(x+1)" -> "2*(x+1)"
   * A variable followed by a separated integer is a power, as written on the worksheet: "x 2" -> "x^2".
   * Throws ParseError for things it cannot read unambiguously (e.g. "2 3").
   */
  function normalizeMathExpression(expr) {
    let s = normalizeUnicode(expr).toLowerCase().replace(/\s*\^\s*/g, "^");
    const raw = [];
    const re = /\s*(\d*\.\d+|\d+\.?|[a-z]+|[-+*/^()])/gy;
    let pos = 0, m;
    while (pos < s.length && (m = re.exec(s))) { raw.push(m[1]); pos = re.lastIndex; }
    if (s.slice(pos).trim()) throw new ParseError("unrecognized character “" + s.slice(pos).trim()[0] + "” in “" + expr.trim() + "”");

    // classify tokens; split letter runs such as "xy" or "sinx"
    const toks = [];
    const push = (t, type) => toks.push({ t, type });
    for (let i = 0; i < raw.length; i++) {
      const t = raw[i];
      if (/^[\d.]/.test(t)) { push(t.replace(/\.$/, ""), "num"); continue; }
      if (/^[-+*/^]$/.test(t)) { push(t, "op"); continue; }
      if (t === "(") { push(t, "open"); continue; }
      if (t === ")") { push(t, "close"); continue; }
      let word = t;
      if ((word === "log") && /^(10|2)$/.test(raw[i + 1] || "") && raw[i + 2] !== ".") { word = "log" + raw[++i]; }
      while (word) {
        const f = FUNCS.filter(n => word.startsWith(n)).sort((a, b) => b.length - a.length)[0];
        if (f) { push(f === "ln" ? "log" : f, "func"); word = word.slice(f.length); }
        else if (word.startsWith("pi")) { push("pi", "var"); word = word.slice(2); }
        else if (/^[xye]/.test(word)) { push(word[0], "var"); word = word.slice(1); }
        else throw new ParseError("unknown name “" + word + "” in “" + expr.trim() + "”");
      }
    }

    // functions written without parentheses: "sin x", "cos 2x", "sqrt x" -> sin(x), cos(2*x) ...
    const tk = [];
    for (let i = 0; i < toks.length; i++) {
      tk.push(toks[i]);
      if (toks[i].type === "func" && toks[i + 1] && toks[i + 1].type !== "open") {
        let j = i + 1, depth = 0;
        const arg = [];
        while (j < toks.length) {
          const x = toks[j];
          if (x.type === "open") depth++;
          if (x.type === "close") { if (depth === 0) break; depth--; }
          if (depth === 0 && x.type === "op" && "+-*/".includes(x.t) && arg.length && !(arg[arg.length - 1].t === "^")) break;
          arg.push(x); j++;
        }
        if (!arg.length) throw new ParseError("missing argument for " + toks[i].t);
        tk.push({ t: "(", type: "open" }, ...arg, { t: ")", type: "close" });
        i = j - 1;
      }
    }

    // implicit multiplication + adjacency validation
    const out = [];
    for (let i = 0; i < tk.length; i++) {
      const p = out[out.length - 1], c = tk[i];
      if (p) {
        const pv = p.type === "num" || p.type === "var" || p.type === "close";
        if (pv && (c.type === "var" || c.type === "func" || c.type === "open")) out.push({ t: "*", type: "op" });
        else if (p.type === "close" && c.type === "num") out.push({ t: "*", type: "op" });
        else if (p.type === "var" && c.type === "num" && /^\d+$/.test(c.t)) {
          // worksheet notation: a variable followed by a separated integer is a power ("x 2" = x^2, "y 3" = y^3)
          out.push({ t: "^", type: "op" });
        }
        else if ((p.type === "num" || p.type === "var") && c.type === "num") {
          throw new ParseError("missing operator between “" + p.t + "” and “" + c.t + "”");
        }
        else if (p.type === "func" && c.type !== "open") throw new ParseError("function “" + p.t + "” needs an argument");
        else if (p.type === "op" && c.type === "op" && !("-+".includes(c.t) || p.t === "^")) throw new ParseError("two operators in a row: “" + p.t + c.t + "”");
      }
      out.push(c);
    }
    if (!out.length) throw new ParseError("empty expression");
    const last = out[out.length - 1];
    if (last.type === "op") throw new ParseError("expression ends with “" + last.t + "”");
    return out.map(x => x.t).join("");
  }

  // a run of "math characters" that does not start or end inside an English word
  const FN = "(?:sin|cos|tan|sqrt|ln|log|exp|abs)(?![a-z])";
  const TOK = "(?:" + FN + "|(?<![a-z])(?:pi|e)(?![a-z])|[xy](?![a-z])|[\\d.+\\-*/^()\\s])";
  const EQ = new RegExp("(?<![a-z])(" + TOK + "+?)=(" + TOK + "+)", "gi");
  const NUM = "(-?\\d*\\.?\\d+(?:/\\d+)?|-?pi(?:/\\d+)?|-?\\d*pi(?:/\\d+)?)";

  function parse(raw) {
    const out = {
      raw, equations: [], xAxis: false, yAxis: false, xLimits: [], yLimits: [], under: false,
      errors: [], extracted: [], model: { curves: [], boundaries: [] },
    };
    let t = normalize(raw || "").toLowerCase();
    if (!t) return out;

    out.xAxis = /\bx[\s-]*axis\b/.test(t);
    out.yAxis = /\by[\s-]*axis\b/.test(t);
    out.under = /\b(under|beneath)\b/.test(t);
    t = t.replace(/\b[xy][\s-]*axis\b/g, " ");

    const lim = (v, a, b) => { (v === "x" ? out.xLimits : out.yLimits).push(a, b); };
    t = t.replace(new RegExp("\\bfrom\\s+([xy])\\s*=\\s*" + NUM + "\\s+to\\s+(?:[xy]\\s*=\\s*)?" + NUM, "g"), (m, v, a, b) => (lim(v, a, b), " "));
    t = t.replace(new RegExp("\\b([xy])\\s+from\\s+" + NUM + "\\s+to\\s+" + NUM, "g"), (m, v, a, b) => (lim(v, a, b), " "));
    t = t.replace(new RegExp(NUM + "\\s*(?:<=|≤)\\s*([xy])\\s*(?:<=|≤)\\s*" + NUM, "g"), (m, a, v, b) => (lim(v, a, b), " "));

    let m;
    EQ.lastIndex = 0;
    while ((m = EQ.exec(t))) {
      const before = t[m.index - 1], after = t[EQ.lastIndex];
      // an equation must end at a clean boundary; otherwise part of it was not understood
      const strayAfter = after && /[^\sa-z,;.:!?)"']/.test(after), strayBefore = before && /[^\sa-z,;:!?("'\-]/.test(before);
      const L = m[1].trim().replace(/[.,;:]+$/, ""), R = m[2].trim().replace(/[.,;:]+$/, "");
      if (!L || !R || !/[xy\d]/.test(L + R)) continue;
      if (strayAfter || strayBefore) {
        out.errors.push("unrecognized symbol “" + (strayAfter ? after : before) + "” next to “" + L + " = " + R + "”");
        continue;
      }
      out.extracted.push(L + " = " + R);
      try {
        const lhs = normalizeMathExpression(L), rhs = normalizeMathExpression(R);
        out.equations.push({ lhs, rhs, raw: L + " = " + R, norm: lhs + " = " + rhs });
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        out.errors.push(e.message);
      }
    }
    out.limitsRaw = { x: out.xLimits.slice(), y: out.yLimits.slice() };
    out.xLimits = out.xLimits.map(v => { try { return normalizeMathExpression(v); } catch (e) { out.errors.push(e.message); return v; } });
    out.yLimits = out.yLimits.map(v => { try { return normalizeMathExpression(v); } catch (e) { out.errors.push(e.message); return v; } });
    out.model = buildModel(out);
    return out;
  }

  /** Simple structured view of what was found (also used by the debug panel). */
  function buildModel(spec) {
    const curves = [], boundaries = [];
    if (spec.xAxis) boundaries.push({ type: "x-axis" });
    if (spec.yAxis) boundaries.push({ type: "y-axis" });
    for (const e of spec.equations) {
      const num = /^-?\d*\.?\d+(?:\/\d+)?$/.test(e.rhs) ? Number(eval_frac(e.rhs)) : null;
      if ((e.lhs === "x" || e.lhs === "y") && num !== null) boundaries.push({ type: e.lhs === "x" ? "vertical" : "horizontal", value: num });
      else if (e.lhs === "x" || e.lhs === "y") curves.push({ variable: e.lhs, expression: e.rhs });
      else curves.push({ relation: e.lhs + " = " + e.rhs });
    }
    spec.xLimits.forEach(v => boundaries.push({ type: "vertical", value: v }));
    spec.yLimits.forEach(v => boundaries.push({ type: "horizontal", value: v }));
    return { curves, boundaries };
  }
  function eval_frac(s) { const [a, b] = s.split("/"); return b ? Number(a) / Number(b) : Number(a); }

  PA.parser = { parse, normalize, normalizeMathExpression, normalizeUnicode, ParseError };
})(globalThis);
