// Fig 1.1 — Chicago Pile-1 (2 декабря 1942) as a bench model: a flattened sphere of graphite
// layers on a timber frame, a cadmium control strip that slides out of it, and the neutron
// counter. Reactivity grows as the strip comes out; the pile goes critical near the last
// position (ρ ≈ +0,0006 fully out, as on that day), and the counts then rise with a period of
// about two minutes. Point kinetics with one delayed group and a source; time is sped up ×10.
import { k, tools, bench, card, dialFace, needlePath, LIVE_PRELUDE } from "./common.mjs";

const LAYERS = 15, LH = 8, Z0 = 12;
const rAt = (z) => 64 * Math.sqrt(Math.max(0.05, 1 - ((z - 58) / 74) ** 2));
const ROD_Z = 60, ROD_OUT = 96;
const BETA = 0.0065, LAMBDA = 1e-3, LAM = 0.08, SPEED = 10;

export function build() {
  const W = 660, H = 470;
  const PLATE = { x: -96, y: -90, w: 300, d: 180, r: 10 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [0, 0, Z0 + LAYERS * LH + 4]], W, H, { pad: 22, azimuth: 34, elevation: 28 });
  const { at, S, L, D } = tools(P);
  const out = [`<g data-part="base">${bench(P, PLATE)}</g>`];

  // Timber frame the pile stands on.
  const frame = [];
  for (const y of [-40, -14, 14, 40]) frame.push(S(k.slabOf({ x: -66, y: y - 5, w: 132, d: 10, r: 1 }, 0, 6, P, 2, 0.4), { tone: "lo", inner: L(k.sideSeam({ x: -66, y: y - 5, w: 132, d: 10, r: 1 }, 3, P, 2), { tone: "faint" }) }));
  frame.push(S(k.slabOf({ x: -62, y: -62, w: 124, d: 124, r: 4 }, 6, 6, P, 3, 0.5), { tone: "lo" }));
  out.push(`<g data-part="frame">${frame.join("")}</g>`);

  // Graphite layers: each a rounded square with a brick seam around its side.
  const layers = [];
  for (let i = 0; i < LAYERS; i++) {
    const z = Z0 + i * LH;
    const r = rAt(z + LH / 2);
    const plan = { x: -r, y: -r, w: 2 * r, d: 2 * r, r: r * 0.42 };
    const seam = k.sideSeam(plan, z + LH / 2, P, 8);
    layers.push(S(k.slabOf(plan, z, LH, P, 8, 0.4), { tone: "mid", crease: "lo", inner: L(seam, { tone: "faint" }) }));
  }
  const top = Z0 + LAYERS * LH;
  const rt = rAt(top - LH / 2);
  layers.push(D([[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([a, b]) => at([a * rt, b * rt, top])), { size: 0.5 }));
  out.push(`<g data-part="graphite">${layers.join("")}</g>`);

  // Control strip (rebuilt live) and its timber rest; the strip slides along +x out of the pile.
  out.push(`<g data-part="rod"><g data-rod></g>${S(k.slabOf({ x: 150, y: -8, w: 10, d: 16, r: 1 }, 0, ROD_Z - 2, P, 2, 0.4), { tone: "lo" })}${S(k.slabOf({ x: 148, y: -10, w: 14, d: 20, r: 1.5 }, 0, 3, P, 2, 0.4), { tone: "lo" })}</g>`);

  // Counter with a log dial and a chart drum.
  const box = { x: 120, y: 44, w: 50, d: 30, r: 3 };
  const dial = [box.x + 16, box.y + 15];
  const cnt = [
    `<path class="iso-halo" d="${k.haloOf(box, 0, 18, P)}" style="filter:blur(5px)"/>`,
    S(k.slabOf(box, 0, 18, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(box, 5, P, 4), { tone: "faint" }) }),
    S(k.cylinder(dial[0], dial[1], 11, 18, 1.4, P, 44), { tone: "hi", crease: "lo" }),
    dialFace(P, dial[0], dial[1], 19.4, 11, { count: 30, every: 10, text: "имп/с", span: Math.PI * 1.4, from: -Math.PI * 0.7 }),
    S(k.slabOf({ x: box.x + 32, y: box.y + 4, w: 14, d: 22, r: 1 }, 18, 6, P, 2, 0.4), { tone: "hi", crease: "lo" }),
    `<path data-trace class="iso-line" data-tone="lit" data-free="end" d=""/>`,
    D(k.corners(box, 2.5).map(([x, y]) => at([x, y, 18])), { size: 0.45 }),
    k.wireSvg(at([box.x, box.y + 15, 9]), at([48, 30, 40]), { via: [at([box.x - 20, box.y + 15, 0]), at([60, 40, 0])], tone: "mid" }),
    `<path data-needle class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1" d=""/>`,
  ];
  out.push(`<g data-part="counter">${cnt.join("")}</g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Модель Чикагской поленницы CP-1: сплюснутая сфера из слоёв графита на деревянной раме, кадмиевая регулирующая планка, выдвигаемая из кладки, и счётчик нейтронов.",
    body: out,
  });

  const controls = `<div class="fig-controls"><button type="button" data-step>Выдвинуть ещё</button><button type="button" data-zip class="fig-danger">«Zip» — сброс</button></div>`;

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const ROD_Z = ${ROD_Z}, ROD_OUT = ${ROD_OUT}, R_AT = ${rAt(ROD_Z).toFixed(2)};
const BETA = ${BETA}, LAMBDA = ${LAMBDA}, LAM = ${LAM}, SPEED = ${SPEED};
const DIAL = ${JSON.stringify(dial)}, BOX = ${JSON.stringify(box)};
const rodG = svg.querySelector("[data-rod]");
const needle = svg.querySelector("[data-needle]");
const trace = svg.querySelector("[data-trace]");
const needleAt = ${needlePath.toString().replace(/k\.lineOnTop/g, "lineOnTop")};
const rhoOf = (f) => 0.0006 - 0.004 * (1 - f);
const SRC = 0.0034 / LAMBDA; // n = 1 with the strip fully in
let f = 0, target = 0, n = 1, C = BETA / (LAMBDA * LAM), drawn = -1, zip = false, hist = [], tclock = 0, touring = true, clock = 0, idle = 0;
const tour = [0, 0.3, 0.55, 0.75, 0.85, 1, 1];
function drawRod() {
  if (Math.abs(f - drawn) < 0.0008) return; drawn = f;
  const x0 = R_AT - 2, x1 = R_AT + 8 + ROD_OUT * f;
  rodG.innerHTML = solidSvg(slabOf({ x: x0, y: -2.5, w: x1 - x0, d: 5, r: 0.4 }, ROD_Z - 0.8, 1.6, P, 2, 0), { tone: "hi", lit: true }) +
    solidSvg(slabOf({ x: x1, y: -4, w: 3, d: 8, r: 0.6 }, ROD_Z - 2, 4, P, 2, 0), { tone: "mid" });
}
const run = loop((dt, calm) => {
  if (touring && !zip) { clock += dt; target = tour[Math.min(tour.length - 1, Math.floor(clock / 5))]; if (clock > 60) { clock = 0; n = 1; C = BETA / (LAMBDA * LAM); } }
  const v = zip ? 2 : 0.12;
  f += clamp(target - f, -v * dt, v * dt);
  const rho = rhoOf(f);
  const sub = 40, h = dt * SPEED / sub, before = n;
  for (let i = 0; i < sub; i++) {
    n = (n + h * (LAM * C + SRC)) / (1 - h * (rho - BETA) / LAMBDA);
    C = (C + h * (BETA / LAMBDA) * n) / (1 + h * LAM);
  }
  if (n > 300 && !zip) { zip = true; target = 0; touring = false; }
  drawRod();
  const counts = 5 * n;
  const share = clamp(Math.log10(counts) / 4, 0, 1);
  needle.setAttribute("d", needleAt(P, DIAL[0], DIAL[1], 19.6, 11, share, { span: Math.PI * 1.4, from: -Math.PI * 0.7 }));
  tclock += dt; if (tclock > 0.25) { tclock = 0; hist.push(share); if (hist.length > 40) hist.shift(); }
  const pts = hist.map((s, i) => iso([BOX.x + 33 + (i / 40) * 12, BOX.y + 24 - s * 18, 24.1], P));
  trace.setAttribute("d", pts.length > 1 ? "M" + pts.map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join("L") : "");
  const rate = (n - before) / (dt * SPEED) / n;
  const T = Math.abs(rate) < 1e-4 ? "∞" : (rate > 0 ? "+" : "−") + fmt(Math.abs(1 / rate), 0) + " с";
  const kk = 1 / (1 - rho);
  say((zip ? "сброс «Zip» · " : "") + "планка выдвинута на " + fmt(f * 100, 0) + " % · k = " + kk.toFixed(4).replace(".", ",") + " · " + fmt(counts, 0) + " имп/с · T = " + T + " · время ×10");
  return true;
});
const manual = () => { touring = false; clearTimeout(idle); idle = setTimeout(() => { if (!zip) { touring = !still.matches; clock = 0; } }, 20000); run(); };
root.querySelector("[data-step]").addEventListener("click", () => { zip = false; target = Math.min(1, Math.round((target + 0.15) * 20) / 20); manual(); });
root.querySelector("[data-zip]").addEventListener("click", () => { zip = true; target = 0; manual(); });
stage.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { zip = false; target = Math.min(1, target + 0.05); } else if (e.key === "ArrowLeft") target = Math.max(0, target - 0.05); else return; e.preventDefault(); manual(); });
if (still.matches) touring = false;
drawRod();
`;

  return {
    P,
    name: "pile",
    live,
    html: card({
      name: "pile",
      fig: "Рис. 1.1",
      title: "Чикагская поленница CP-1",
      hint: "Кнопки — выдвигать планку",
      readout: "планка выдвинута на 0 %",
      label: "Модель CP-1: стрелки влево и вправо двигают регулирующую планку",
      keys: [
        { mark: "lit", label: "Кадмиевая регулирующая планка" },
        { mark: "raised", label: "Слои графитовой кладки на деревянной раме" },
      ],
      caption:
        "2 декабря 1942 года группа Энрико Ферми шаг за шагом выдвигала последнюю кадмиевую планку из кладки CP-1 — около 57 слоёв графитовых блоков с вкраплениями урана и оксида урана. Пока k < 1, счёт нейтронов выходит на новый постоянный уровень; когда k превысил единицу (около 1,0006), счёт начал расти сам собой, с периодом в пару минут. Через несколько минут реакцию заглушили. Модель ускоряет время в 10 раз; размеры кладки условные.",
      svg,
      controls,
    }),
  };
}
