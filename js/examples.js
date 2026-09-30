/* examples.js — sample problems. These are only inputs: the solver analyses each one from scratch. */
(function (g) {
  "use strict";
  const PA = (g.PA = g.PA || {});
  PA.examples = [
    { title: "Example 1 — Area under a parabola", text: "Find the area bounded by the curve y = x², the x-axis, and the ordinates x = 1 and x = 3.", expected: "\\frac{26}{3}", worksheet: true },
    { title: "Example 2 — Parabola and a line", text: "Find the area bounded by the parabola y² = 4x and the line y = 2x – 4.", expected: "9", worksheet: true },
    { title: "Example 3 — Parabola and the y-axis", text: "Find the area bounded by the parabola x = 4 – y² and the y-axis.", expected: "\\frac{32}{3}", worksheet: true },
    { title: "Parabola and a horizontal line", text: "Find the area enclosed by y = x² and y = 4.", expected: "\\frac{32}{3}" },
    { title: "Line and parabola", text: "Find the area between y = x and y = x².", expected: "\\frac{1}{6}" },
    { title: "Trapezoid under a line", text: "Find the area bounded by y = 2x + 1, x = 0, x = 3, and the x-axis.", expected: "12" },
    { title: "Sideways parabola and a vertical line", text: "Find the area enclosed by x = y² and x = 4.", expected: "\\frac{32}{3}" },
    { title: "Two curves crossing", text: "Find the area between y = x + 2 and y = x².", expected: "\\frac{9}{2}" },
    { title: "Boundary changes (two integrals)", text: "Find the area bounded by y = x², y = 2 – x and the x-axis.", expected: "\\frac{5}{6}" },
    { title: "Cubic and line (two regions)", text: "Find the area bounded by y = x³ and y = x.", expected: "\\frac{1}{2}" },
    { title: "Trigonometric", text: "Find the area under y = sin x from x = 0 to x = π.", expected: "2" },
    { title: "Circle", text: "Find the area enclosed by x² + y² = 25.", expected: "25\\pi" },
  ];
})(globalThis);
