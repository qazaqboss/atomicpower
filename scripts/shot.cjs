// node scripts/shot.cjs page.html out.png [selector] [width] [hoverFx,Fy]
const { chromium } = require("playwright");
(async () => {
  const [file, out, sel = ".iso-plate", width = "900", hover] = process.argv.slice(2);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +width, height: 1000 }, deviceScaleFactor: 1, colorScheme: process.env.SCHEME || "light" });
  const errs = [];
  p.on("pageerror", (e) => errs.push("pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push("console " + m.text()); });
  await p.goto(file.startsWith("http") ? file : "file://" + require("path").resolve(file));
  await p.waitForTimeout(600);
  const el = sel === "viewport" ? null : await p.$(sel);
  if (hover) { const box = await el.boundingBox(); const [fx, fy] = hover.split(",").map(Number); await p.mouse.move(box.x + box.width * fx, box.y + box.height * fy); }
  await p.waitForTimeout(+(process.env.WAIT || 1500));
  if (sel === "viewport") await p.screenshot({ path: out }); else await el.screenshot({ path: out });
  console.log(errs.join("\n") || "no errors");
  await b.close();
})();
