/* areaSolver.js — the pipeline: parse → curves → intersections → region → dx/dy → integrals → validation. */
(function (g) {
  "use strict";
  const PA = (g.PA = g.PA || {});
  const { M, Fr } = PA;

  const MESSAGES = {
    PARSE: "I could not identify the mathematical equations in your problem.\nTry entering the equations explicitly, for example: y = x² and y = 2x.",
    UNSUPPORTED: "This equation type is currently outside the supported Plane Areas by Integration solver.\nSupported: lines, parabolas and other polynomial curves, x = f(y) curves, sin/cos/tan, exp, sqrt, the axes, and vertical/horizontal lines.",
    AMBIGUOUS: "The system could not uniquely determine the bounded region.\nPlease specify the missing boundary or limits (for example another curve, the x-axis, or x = a and x = b).",
    NO_REGION: "No finite bounded region was detected from the given equations.",
    VALIDATION: "The computed region failed the consistency checks, so no answer is shown rather than a wrong one.\nPlease rephrase the problem or specify the boundaries explicitly.",
  };
  const failWith = (code, detail, debug) => ({ ok: false, code, message: MESSAGES[code], detail, debug });

  function sameCurve(a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === "v" || a.kind === "h") return Math.abs(a.value - b.value) < 1e-12;
    if (a.coefs && b.coefs) return a.coefs.length === b.coefs.length && a.coefs.every((c, i) => c.sub(b.coefs[i]).isZero());
    return a.node.toString() === b.node.toString();
  }

  function buildCurves(spec) {
    const curves = [];
    const add = c => { if (!curves.some(z => sameCurve(z, c))) curves.push(c); };
    for (let i = 0; i < spec.equations.length; i++) {
      const eq = spec.equations[i], r = PA.classifyEquation(eq.lhs, eq.rhs, "eq" + i);
      if (r.error) return { error: r.error };
      r.curves.forEach(add);
    }
    const lim = (arr, kind, tag) => {
      for (let i = 0; i < arr.length; i++) {
        let v; try { v = M.evaluate(arr[i].replace(/(\d)pi/g, "$1*pi")); } catch (e) { return { code: "PARSE" }; }
        if (typeof v !== "number" || !Number.isFinite(v)) return { code: "PARSE" };
        add(PA.lineCurve(kind, v, tag + i));
      }
    };
    let e = lim(spec.xLimits, "v", "xl") || lim(spec.yLimits, "h", "yl");
    if (e) return { error: e };
    if (spec.xAxis || (spec.under && !curves.some(c => c.kind === "h" && c.value === 0))) add(PA.lineCurve("h", 0, "xaxis", "y=0"));
    if (spec.yAxis) add(PA.lineCurve("v", 0, "yaxis", "x=0"));
    return { curves };
  }

  /** Never throws: any unexpected internal error becomes an honest error result. */
  function solve(text) {
    try { return solveUnsafe(text); }
    catch (e) { return { ok: false, code: "UNSUPPORTED", message: MESSAGES.UNSUPPORTED, detail: String((e && e.message) || e).split(/\r?\n/)[0] }; }
  }

  function solveUnsafe(text) {
    let spec;
    try { spec = PA.parser.parse(text); } catch (e) { return failWith("PARSE", e.message); }
    const debug = {
      original: text, extracted: spec.extracted, normalized: spec.equations.map(e => e.norm),
      limits: { x: spec.xLimits, y: spec.yLimits }, model: spec.model,
    };
    const fail = (code, detail) => failWith(code, detail, debug);
    if (spec.errors.length) return fail("PARSE", spec.errors.join("; "));
    if (!spec.equations.length && !spec.xAxis && !spec.yAxis && !spec.xLimits.length && !spec.yLimits.length) return fail("PARSE");

    const built = buildCurves(spec);
    if (built.error) return fail(built.error.code === "PARSE" ? "PARSE" : "UNSUPPORTED", built.error.detail);
    const curves = built.curves;
    if (curves.length < 2) return fail("AMBIGUOUS", "only one boundary");
    if (!curves.some(c => c.kind === "fx" || c.kind === "gy")) return fail("NO_REGION", "only straight lines parallel to the axes");

    const vs = curves.filter(c => c.kind === "v").map(c => c.value), hs = curves.filter(c => c.kind === "h").map(c => c.value);
    const ranges = {
      x: vs.length >= 2 ? [Math.min(...vs), Math.max(...vs)] : [-60, 60],
      y: hs.length >= 2 ? [Math.min(...hs), Math.max(...hs)] : [-60, 60],
    };

    // intersections of every pair
    const points = [];
    for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
      for (const p of PA.intersections.pair(curves[i], curves[j], ranges)) points.push({ ...p, a: curves[i].id, b: curves[j].id });
    }
    if (!points.length) return fail("NO_REGION", "the boundaries never meet");

    const region = PA.bounds.detectRegion(curves, points, ranges);
    if (!region.faces.length) return fail("NO_REGION", "the boundaries do not enclose an area");

    // try both slicing directions and keep the simpler valid one
    const cands = [];
    let unsupported = null;
    for (const dir of ["x", "y"]) {
      const sl = PA.bounds.slicePieces(curves, region.faces, points, dir);
      if (sl.unsupported) { unsupported = sl.unsupported; continue; }
      if (!sl.pieces.length) continue;
      const integ = PA.integration.integrate(sl.pieces, dir);
      const score = sl.derivedCount * 100 + sl.pieces.length * 10 +
        integ.parts.reduce((a, p) => a + (p.kind === "numeric" ? 50 : p.kind === "table" ? 3 : 0), 0) + (dir === "y" ? 0.5 : 0);
      cands.push({ dir, sl, integ, score });
    }
    if (!cands.length) return fail(unsupported ? "UNSUPPORTED" : "AMBIGUOUS", unsupported);
    cands.sort((a, b) => a.score - b.score);
    const best = cands[0], other = cands[1] || null;

    // ---- validation ----
    const { integ, sl } = best;
    if (!Number.isFinite(integ.value) || integ.value < -1e-9) return fail("VALIDATION", "negative or undefined area");
    for (const p of sl.pieces) {
      if (!(p.t1 > p.t0)) return fail("VALIDATION", "invalid limits");
      const m = (p.t0 + p.t1) / 2;
      if (!(p.upper.fn(m) > p.lower.fn(m))) return fail("VALIDATION", "upper/lower order");
    }
    if (Math.abs(integ.value - sl.faceArea) > 0.02 * Math.max(sl.faceArea, 1e-9) + 1e-6) return fail("VALIDATION", "integral does not match the detected region");
    if (other && Math.abs(other.integ.value - integ.value) > 1e-4 * Math.max(1, integ.value)) return fail("VALIDATION", "dx and dy disagree");

    // boundary vertices for the intersection table
    const verts = region.faces.flatMap(f => f.poly);
    const onBoundary = points.filter(p => verts.some(v => Math.hypot(v[0] - p.x, v[1] - p.y) < 1e-5));
    const uniq = [];
    for (const p of onBoundary) {
      let u = uniq.find(q => Math.hypot(q.x - p.x, q.y - p.y) < 1e-6);
      if (!u) uniq.push(u = { x: p.x, y: p.y, pairs: [] });
      u.pairs.push([p.a, p.b]);
    }
    uniq.sort((p, q) => p.x - q.x || p.y - q.y);

    const notes = [];
    if (region.faces.length > 1) notes.push("The boundaries enclose " + region.faces.length + " separate regions that all use the given boundaries; their areas are added together.");
    if (region.all > region.faces.length) notes.push("Other enclosed regions exist, but they do not use all of the given boundaries, so they were not included.");
    if (sl.pieces.length > 1) {
      const cuts = sl.pieces.slice(1).map(p => PA.fmt.plainNum(p.t0));
      notes.push("The bounding curve changes at " + best.dir + " = " + cuts.join(", ") + ", so the area is divided into " + sl.pieces.length + " integrals.");
    }

    const v = best.dir;
    const why = v === "y"
      ? "Integration with respect to y is used because the region is naturally described by a right boundary and a left boundary (horizontal slices)."
      : "Integration with respect to x is used because the region is naturally described by an upper boundary and a lower boundary (vertical slices).";
    let compare = "";
    if (other) {
      const o = other.dir, od = other.sl;
      if (od.derivedCount > 0 && sl.derivedCount === 0) compare = " Using d" + o + " instead would require solving each curve for " + (o === "x" ? "y" : "x") + " (with ± square-root branches).";
      else if (od.pieces.length > sl.pieces.length) compare = " Using d" + o + " instead would need " + od.pieces.length + " integrals instead of " + sl.pieces.length + ".";
      else compare = " Both directions give the same area; d" + v + " gives the simpler setup.";
    }

    debug.boundaries = curves.map(c => c.kind + ": " + c.plain);
    debug.integrationVariable = v;
    debug.limits = sl.pieces.map(p => PA.fmt.plainNum(p.t0) + " <= " + v + " <= " + PA.fmt.plainNum(p.t1));
    debug.integral = sl.pieces.map(p => "∫[" + PA.fmt.plainNum(p.t0) + "," + PA.fmt.plainNum(p.t1) + "] (" + p.upper.node.toString() + ") - (" + p.lower.node.toString() + ") d" + v).join("  +  ");
    return {
      ok: true, debug, text, spec, curves, ranges, points: uniq, allPoints: points, faces: region.faces,
      dir: v, pieces: sl.pieces, integ, exact: integ.exact, value: integ.value,
      notes, reason: why + compare, alt: other ? { dir: other.dir, pieces: other.sl.pieces.length, value: other.integ.value } : null,
    };
  }

  PA.solve = solve;
  PA.MESSAGES = MESSAGES;
})(globalThis);
