const test = require("node:test");
const assert = require("node:assert/strict");
const PA = require("./load.cjs");

const ok = q => { const r = PA.solve(q); assert.equal(r.ok, true, q + " -> " + (r.code || "") + " " + (r.detail || "")); return r; };
const frac = (r, n, d = 1) => { assert.ok(r.exact, "exact result expected"); assert.equal(r.exact.n, n); assert.equal(r.exact.d, d); };
const fails = (q, code) => { const r = PA.solve(q); assert.equal(r.ok, false, q); assert.equal(r.code, code); return r; };

/* ---- teacher worksheet (acceptance tests) ---- */
test("worksheet 1: y=x^2, x-axis, x=1, x=3 -> 26/3", () => {
  const r = ok("Find the area bounded by the curve y = x², the x-axis, and the ordinates x = 1 and x = 3.");
  frac(r, 26, 3); assert.equal(r.dir, "x"); assert.equal(r.pieces.length, 1);
  assert.equal(r.pieces[0].t0, 1); assert.equal(r.pieces[0].t1, 3);
});
test("worksheet 2: y^2=4x and y=2x-4 -> 9, integrates dy from -2 to 4", () => {
  const r = ok("Find the area bounded by the parabola y² = 4x and the line y = 2x – 4.");
  frac(r, 9); assert.equal(r.dir, "y");
  assert.equal(r.pieces[0].t0, -2); assert.equal(r.pieces[0].t1, 4);
  assert.deepEqual(r.points.map(p => [p.x, p.y]), [[1, -2], [4, 4]]);
});
test("worksheet 3: x=4-y^2 and y-axis -> 32/3, dy from -2 to 2", () => {
  const r = ok("Find the area bounded by the parabola x = 4 – y² and the y-axis.");
  frac(r, 32, 3); assert.equal(r.dir, "y");
  assert.equal(r.pieces[0].t0, -2); assert.equal(r.pieces[0].t1, 2);
});

/* ---- under a curve / lines ---- */
test("area under a parabola from 0 to 3 = 9", () => frac(ok("Find the area under y = x^2 from x = 0 to x = 3."), 9));
test("area under a line: y=2x+1, x=0, x=3, x-axis = 12", () => frac(ok("Find the area bounded by y = 2x + 1, x = 0, x = 3, and the x-axis."), 12));
test("area between two lines: y=x, y=2x, x=3 -> 9/2", () => frac(ok("Find the area bounded by y = x, y = 2x and x = 3."), 9, 2));
test("vertical & horizontal boundaries: y=4 and x=y^2 with y-axis... rectangle-ish", () => frac(ok("Find the area bounded by y = x, y = 3, x = 0 and x = 3."), 9, 2));

/* ---- two curves ---- */
test("parabola and horizontal line", () => frac(ok("Find the area enclosed by y = x² and y = 4."), 32, 3));
test("line and parabola", () => frac(ok("Find the area between y = x and y = x²."), 1, 6));
test("y = x^2 and y = 2x -> 4/3 with intersections (0,0),(2,4)", () => {
  const r = ok("Find the area between y = x^2 and y = 2x.");
  frac(r, 4, 3); assert.deepEqual(r.points.map(p => [p.x, p.y]), [[0, 0], [2, 4]]);
});
test("y = x+2 and y = x^2 -> 9/2", () => frac(ok("Find the area between y = x + 2 and y = x^2."), 9, 2));

/* ---- direction ---- */
test("dy problem: x=y^2 and x=4", () => { const r = ok("Find the area enclosed by x = y² and x = 4."); frac(r, 32, 3); assert.equal(r.dir, "y"); });
test("dx problem keeps dx", () => assert.equal(ok("Find the area between y = x and y = x².").dir, "x"));
test("y-axis boundary: x = 4 - y^2 uses dy (not dx)", () => assert.equal(ok("Find the area bounded by x = 4 - y^2 and the y-axis.").dir, "y"));

/* ---- piecewise / multi-region ---- */
test("boundary change is split into two integrals", () => {
  const r = ok("Find the area bounded by y = x^2, y = 2 - x and the x-axis.");
  frac(r, 5, 6); assert.equal(r.pieces.length, 2); assert.equal(r.pieces[0].t1, 1);
});
test("two separate lobes are added: y=x^3 and y=x", () => frac(ok("Find the area bounded by y = x^3 and y = x."), 1, 2));

/* ---- other function types ---- */
test("sin over [0, pi] = 2", () => assert.ok(Math.abs(ok("Find the area bounded by y = sin x, the x-axis, from x = 0 to x = pi.").value - 2) < 1e-8));
test("circle x^2+y^2=25 -> 25pi", () => assert.ok(Math.abs(ok("Find the area enclosed by x^2 + y^2 = 25.").value - 25 * Math.PI) < 1e-3));
test("unicode minus and superscripts normalise", () => frac(ok("Find the area bounded by x = 4 − y² and the y-axis."), 32, 3));

/* ---- intersections ---- */
test("intersection calculator finds tangent and crossing roots", () => {
  const { roots } = PA.intersections;
  assert.deepEqual(roots(x => x * x - 2 * x, -10, 10), [0, 2]);
  assert.deepEqual(roots(x => x * x, -10, 10), [0]);
  assert.deepEqual(roots(x => x ** 3 - x, -10, 10), [-1, 0, 1]);
});

/* ---- honest failures ---- */
test("invalid input: no equations", () => fails("blah blah, nothing mathematical here", "PARSE"));
test("unsupported equation", () => fails("Find the area bounded by y = x^2 and x^3 + y^3 = 5.", "UNSUPPORTED"));
test("ambiguous: single curve only", () => fails("Find the area bounded by y = x^2.", "AMBIGUOUS"));
test("unbounded: parallel lines never enclose area", () => fails("Find the area bounded by y = x + 1 and y = x + 2.", "NO_REGION"));
test("unbounded: curve and line that never meet", () => fails("Find the area bounded by y = x^2 and y = -1.", "NO_REGION"));

/* ---- solution text ---- */
test("solution has all steps and exact answer text", () => {
  const s = PA.generate(ok("Find the area bounded by the curve y = x², the x-axis, and the ordinates x = 1 and x = 3."));
  assert.equal(s.sections.length, 9);
  assert.equal(s.answerTex, String.raw`\frac{26}{3}`);
  const texts = s.sections.flatMap(sec => sec.blocks.map(b => b.tex || ""));
  assert.ok(texts.includes(String.raw`A=\left[\frac{1}{3}x^{3}\right]_{1}^{3}`));
});

/* ================= parser / normalisation regression tests ================= */
const norm = e => PA.parser.normalizeMathExpression(e);

test("normalize: superscripts, caret spacing, operators, implicit multiplication", () => {
  const table = [
    ["x²", "x^2"], ["y³", "y^3"], ["x⁴", "x^4"], ["x⁵", "x^5"], ["x⁶", "x^6"], ["x⁷", "x^7"], ["x⁸", "x^8"], ["x⁹", "x^9"], ["x⁰", "x^0"],
    ["x⁻²", "x^(-2)"], ["x^2", "x^2"], ["x ^ 2", "x^2"], ["x  ^  2", "x^2"], ["x ²", "x^2"], ["x**2", "x^2"],
    ["4 − x²", "4-x^2"], ["4 - x²", "4-x^2"], ["2 × x", "2*x"], ["x ÷ 2", "x/2"],
    ["2x", "2*x"], ["4x^2", "4*x^2"], ["2(x+1)", "2*(x+1)"], ["x(x+1)", "x*(x+1)"], ["(x+1)(x-1)", "(x+1)*(x-1)"], ["3xy", "3*x*y"],
    ["2x + 1", "2*x+1"], ["3x² + 2x - 5", "3*x^2+2*x-5"], ["sin x", "sin(x)"], ["2 sin 2x", "2*sin(2*x)"], ["√x", "sqrt(x)"], ["2π", "2*pi"],
  ];
  for (const [input, want] of table) assert.equal(norm(input), want, input);
});

test("worksheet notation: a variable followed by a separated integer is a power", () => {
  for (const [input, want] of [["x 2", "x^2"], ["y 2", "y^2"], ["x 3", "x^3"], ["y 3", "y^3"], ["4 - y 2", "4-y^2"], ["3x 2 + 1", "3*x^2+1"], ["x2", "x^2"], ["2x + 1", "2*x+1"]])
    assert.equal(norm(input), want, input);
  assert.throws(() => norm("2 3"), /missing operator/);
  assert.throws(() => norm("x 2.5"), /missing operator/);
  // plain "x = 2" / "x = 1" must stay lines, never become x^2
  assert.deepEqual(PA.parser.parse("x = 2 and y = x 2").model.boundaries, [{ type: "vertical", value: 2 }]);
  assert.deepEqual(PA.parser.parse("y = x 2").model.curves, [{ variable: "y", expression: "x^2" }]);
  assert.deepEqual(PA.parser.parse("x = 4 - y 2").model.curves, [{ variable: "x", expression: "4-y^2" }]);
});

test("teacher inputs y = f(x) produce the specified internal expression", () => {
  const cases = [
    ["y = x²", "y", "x^2"], ["y = x^2", "y", "x^2"], ["y = x ^ 2", "y", "x^2"], ["y = 4 - x²", "y", "4-x^2"],
    ["x = 4 - y²", "x", "4-y^2"], ["y = 2x + 1", "y", "2*x+1"], ["y = 3x² + 2x - 5", "y", "3*x^2+2*x-5"],
  ];
  for (const [eq, variable, expression] of cases) {
    const spec = PA.parser.parse("Find the area bounded by " + eq + " and the x-axis.");
    assert.deepEqual(spec.model.curves, [{ variable, expression }], eq);
  }
});

test("exact teacher question: internal representation and boundaries", () => {
  const spec = PA.parser.parse("Find the area bounded by the curve y = x², the x-axis, and the ordinates x = 1 and x = 3.");
  assert.deepEqual(spec.model, {
    curves: [{ variable: "y", expression: "x^2" }],
    boundaries: [{ type: "x-axis" }, { type: "vertical", value: 1 }, { type: "vertical", value: 3 }],
  });
  assert.equal(spec.errors.length, 0);
});

test("all four teacher phrasings give the same solution (26/3, dx, 1..3)", () => {
  const phrasings = [
    "Find the area bounded by the curve y = x², the x-axis, and the ordinates x = 1 and x = 3.",
    "Find the area bounded by y = x², the x-axis, x = 1 and x = 3.",
    "Find the area bounded by y = x^2, the x-axis, x = 1 and x = 3.",
    "Find the area bounded by y = x ^ 2, the x-axis, x = 1 and x = 3.",
    "Find the area bounded by the curve y = x 2, the x-axis, and the ordinates x = 1 and x = 3",
    "Find the area bounded by y = x 2, the x-axis, x = 1 and x = 3.",
    "Find the area bounded by y=x², x=1, x=3 and the x-axis.",
  ];
  for (const q of phrasings) {
    const r = ok(q);
    frac(r, 26, 3); assert.equal(r.dir, "x"); assert.equal(r.pieces[0].t0, 1); assert.equal(r.pieces[0].t1, 3);
    const tex = PA.generate(r).sections.flatMap(s => s.blocks.map(b => b.tex || ""));
    assert.ok(tex.includes(String.raw`A=\int_{1}^{3}\left(x^{2} - 0\right)dx`), q);
    assert.ok(tex.includes(String.raw`A=\left[\frac{1}{3}x^{3}\right]_{1}^{3}`), q);
    assert.ok(tex.includes(String.raw`A=\frac{27}{3}-\frac{1}{3}`), q);
    assert.ok(tex.includes(String.raw`\boxed{A=\frac{26}{3}\ \text{square units}}`), q);
  }
});

test("unrecognised power symbols give an error instead of a silently wrong answer", () => {
  const r = PA.solve("Find the area bounded by y = x₂, the x-axis, x = 1 and x = 3.");
  assert.equal(r.ok, false); assert.equal(r.code, "PARSE");
});

test("regression: lines, axes, implicit, roots and trig still work", () => {
  frac(ok("Find the area bounded by y = 2x, y = 0 and x = 3."), 9);
  frac(ok("Find the area bounded by x = 4-y² and x = 0."), 32, 3);
  frac(ok("Find the area bounded by y² = 4x and x = 4."), 64, 3);
  frac(ok("Find the area bounded by y = 3x² + 2x - 5 , y = 0, x = 2 and x = 3."), 19);
  assert.ok(Math.abs(ok("Find the area bounded by y = sqrt(x), the x-axis and x = 4.").value - 16 / 3) < 1e-8);
  assert.ok(Math.abs(ok("Find the area bounded by y = sin(x), the x-axis, x = 0 and x = pi.").value - 2) < 1e-8);
  assert.ok(Math.abs(ok("Find the area bounded by y = cos(x), the x-axis, x = 0 and x = pi/2.").value - 1) < 1e-8);
  assert.ok(ok("Find the area bounded by y = 4 − x² and the x-axis.").exact.n === 32);
});

test("solve never throws, even on hostile input", () => {
  for (const q of ["y = x 2 and x = 1", "y = ((( and x=", "x = = 3", "y = 1/0 and y = x", "", "∫∫∫", "y = x^^2, x = 1, x = 2"]) {
    assert.doesNotThrow(() => PA.solve(q), q);
    assert.equal(PA.solve(q).ok, false, q);
  }
});

/* ================= wider coverage (problems a teacher is likely to try) ================= */
const near = (r, want, tol = 1e-4) => assert.ok(Math.abs(r.value - want) < tol * Math.max(1, Math.abs(want)), r.value + " vs " + want);
const E = Math.E, PI = Math.PI;

test("regions under/over the x-axis and cubics", () => {
  near(ok("Find the area bounded by y = 4x - x² and the x-axis."), 32 / 3);
  near(ok("Find the area bounded by y = x² - 4 and the x-axis."), 32 / 3);
  near(ok("Find the area bounded by y = x³ - 4x and the x-axis."), 8);
  near(ok("Find the area bounded by y = x^2 - 4x, the x-axis, x = 2 and x = 5."), 23 / 3);
});
test("both lobes count when limits are given: y=x and y=x^2 from x=0 to x=2", () => near(ok("Find the area between the curves y = x and y = x² from x = 0 to x = 2."), 1));
test("touching curves: y=x^2 and y=x^4", () => near(ok("Find the area bounded by the curves y = x^2 and y = x^4."), 4 / 15));
test("pi in limits: sin x from 0 to 2π", () => near(ok("Find the area bounded by y = sin x and the x-axis from x = 0 to x = 2π."), 4));
test("single limit with a periodic curve: tan x, x-axis, x = π/4", () => near(ok("Find the area bounded by y = tan x, y = 0 and x = π/4."), Math.log(2) / 2));
test("function notation f(x) = ...", () => near(ok("Find the area bounded by f(x) = 4 - x² and the x-axis."), 32 / 3));
test("absolute value bars", () => near(ok("Find the area bounded by y = |x| and y = 2."), 4));
test("braces and rational relations", () => {
  near(ok("Find the area bounded by y = e^{x}, y = 1 and x = 2."), E * E - 3);
  near(ok("Find the area bounded by xy = 4, y = 0, x = 1 and x = 4."), 8 * Math.log(2));
});
test("ellipse and circle of any radius", () => {
  near(ok("Find the area of the ellipse x²/9 + y²/4 = 1."), 6 * PI);
  near(ok("Find the area enclosed by x² + y² = 9."), 9 * PI);
  near(ok("Find the area enclosed by x² + y² = 4."), 4 * PI);
});
test("quadrant wording", () => {
  near(ok("Find the area bounded by y = x³ and y = x in the first quadrant."), 0.25);
  near(ok("Find the area in the first quadrant bounded by 3x + 2y = 6."), 3);
});
test("implicit pairs and standard-form lines", () => {
  near(ok("Find the area bounded by y² = 8x and x² = 8y."), 64 / 3);
  near(ok("Find the area bounded by y² = x and x - y = 2."), 4.5);
  near(ok("Find the area bounded by x = 0, y = 0 and x + y = 3."), 4.5);
});
test("a circle cut by a line is ambiguous, not silently summed", () => fails("Find the area bounded by x^2 + y^2 = 4 and x = 1.", "AMBIGUOUS"));
test("a periodic curve and the axis with no limits is ambiguous", () => fails("Find the area bounded by y = sin x and the x-axis.", "AMBIGUOUS"));
