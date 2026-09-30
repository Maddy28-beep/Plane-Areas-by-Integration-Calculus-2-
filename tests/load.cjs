// Loads the browser scripts into Node (they attach to globalThis.PA).
globalThis.math = require("mathjs");
for (const f of ["equations", "parser", "intersections", "bounds", "integration", "areaSolver", "solutionGenerator"]) {
  try { require("../js/" + f + ".js"); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") throw e; }
}
module.exports = globalThis.PA;
