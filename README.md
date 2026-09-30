# PlaneArea Solver — Plane Areas by Integration

An educational calculus web app. Type or paste a Plane Areas by Integration problem; it finds the curves,
their intersections and the bounded region, chooses `dx` or `dy`, builds and evaluates the definite integral,
shows every step, and draws the shaded region.

* 100% client-side: **HTML + CSS + vanilla JavaScript**. No server, no database, no account, no API keys.
* Libraries (CDN only): [math.js](https://mathjs.org), [Plotly.js](https://plotly.com/javascript/), [KaTeX](https://katex.org).
* Works by opening `index.html` directly, or from any static host.

## Project layout

```
index.html  style.css  app.js          UI (navigation, workspace, history)
js/
  parser.js             natural-language problem -> equations, axes, limits
  equations.js          exact fractions, polynomials, equation -> curve classification
  intersections.js      root finding and curve/curve intersection points
  bounds.js             region detection (planar arrangement) and dx/dy slicing into pieces
  integration.js        exact polynomial integrals, antiderivative table, Simpson fallback
  areaSolver.js         pipeline + validation + dx/dy selection
  solutionGenerator.js  step-by-step write-up (KaTeX)
  graph.js              Plotly graph (shading comes from the same pieces as the integral)
  examples.js           sample problems (inputs only; nothing is hard-coded per problem)
tests/engine.test.js    automated tests for the maths engine
```

## Run locally

Double-click `index.html` (internet needed for the CDN libraries), or serve the folder:

```bash
python -m http.server 8080
```

then open <http://localhost:8080>.

## Tests

The engine is plain scripts that attach to a global `PA` object, so Node can load them directly
(only `mathjs` is needed, for the tests):

```bash
npm install
npm test
```

The three worksheet problems (26/3, 9, 32/3) are acceptance tests, alongside tests for lines, parabolas,
x-axis / y-axis / vertical / horizontal boundaries, dx and dy problems, piecewise regions, intersections,
invalid input, ambiguous input and unbounded regions.

## Deploy to GitHub Pages (free)

```
GitHub repository  ->  GitHub Pages  ->  public PlaneArea Solver website
```

1. Create a repository on GitHub (e.g. `PlaneArea`) and push this folder to the `main` branch:
   ```bash
   git init
   git add .
   git commit -m "PlaneArea Solver"
   git branch -M main
   git remote add origin https://github.com/<your-username>/PlaneArea.git
   git push -u origin main
   ```
2. On GitHub open **Settings -> Pages**.
3. Under **Build and deployment -> Source** choose **Deploy from a branch**, then branch **main**, folder **/ (root)**, and **Save**.
4. After a minute the site is live at `https://<your-username>.github.io/PlaneArea/`.

No build step, environment variables or API keys are involved. Netlify and Vercel also work: drag the folder in, no settings needed.

## What it supports

Boundaries: `y = f(x)`, `x = g(y)`, vertical lines `x = a`, horizontal lines `y = b`, the x-axis and y-axis,
and implicit polynomial relations that can be solved for one variable (e.g. `y² = 4x`, `x² + y² = 25`).
Functions: polynomials, `sin`, `cos`, `tan`, `exp`, `ln`/`log`, `sqrt`, `abs`.

It does **not** guess: if the boundaries never meet, do not enclose a finite area, are ambiguous, or use an
unsupported equation type, it says so. Before an answer is shown it is cross-checked against the detected
region (and against the other integration direction); if the checks fail you get an error instead of a number.

Non-polynomial integrands without a table entry are integrated numerically, and the solution says so.
