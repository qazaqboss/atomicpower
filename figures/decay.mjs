// Fig 3.1 — Radioactive decay as a sample tray: 10 × 10 cups, each holding one atom (a ball).
// Every atom carries its own random lifetime drawn from the exponential law; when the clock
// passes it the ball drops into the cup (the daughter, dim). A dial timer counts half-lives.
import { k, G, tools, bench, card, dialFace, needlePath, knob, LIVE_PRELUDE } from "./common.mjs";

const ISOTOPES = [
  { id: "I131", name: "¹³¹I", half: 8.02, unit: "сут", daughter: "¹³¹Xe", mode: "β⁻" },
  { id: "Cs137", name: "¹³⁷Cs", half: 30.08, unit: "лет", daughter: "¹³⁷ᵐBa", mode: "β⁻" },
  { id: "Co60", name: "⁶⁰Co", half: 5.27, unit: "лет", daughter: "⁶⁰Ni", mode: "β⁻, γ" },
  { id: "Rn222", name: "²²²Rn", half: 3.82, unit: "сут", daughter: "²¹⁸Po", mode: "α" },
  { id: "C14", name: "¹⁴C", half: 5730, unit: "лет", daughter: "¹⁴N", mode: "β⁻" },
];
const N = 10;
const GAP = 11;
const CUP = 3.8;
const TRAY = { x: -N * GAP / 2 - 8, y: -N * GAP / 2 - 8, w: N * GAP + 16, d: N * GAP + 16, r: 4 };
const TRAY_Z = 0;
const TRAY_H = 7;
const DIAL = [TRAY.x + TRAY.w + 38, 10];
const DIAL_R = 24;
const DIAL_Z = 0;
const DIAL_H = 12;
const MAX_T = 5; // the clock spans five half-lives

// Deterministic lifetimes in units of half-lives: t = −log₂(u).
function lifetimes() {
  let seed = 20260611;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: N * N }, () => -Math.log2(1 - rnd()));
}

export function build() {
  const W = 640, H = 400;
  const PLATE = { x: TRAY.x - 16, y: TRAY.y - 14, w: DIAL[0] + DIAL_R + 22 - (TRAY.x - 16), d: TRAY.d + 34, r: 8 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [TRAY.x, TRAY.y, 20], [DIAL[0], DIAL[1], DIAL_H + 40]], W, H, { pad: 26, azimuth: 40 });
  const { at, S, L, D, byDepth } = tools(P);
  const out = [`<g data-part="base">${bench(P, PLATE)}</g>`, `<g data-part="tray">`];

  // The tray: a thick plate with a raised rim, a grid of cups bored into its top.
  out.push(`<path class="iso-halo" d="${k.haloOf(TRAY, TRAY_Z, TRAY_H, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.slabOf(TRAY, TRAY_Z, TRAY_H, P, 6, 1), { tone: "mid", inner: L(k.sideSeam(TRAY, TRAY_Z + 3, P, 6), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(TRAY, 3.5), TRAY_Z + TRAY_H, P, 6), { tone: "lo" }));
  const z = TRAY_Z + TRAY_H;
  const cells = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) cells.push([TRAY.x + 8 + GAP / 2 + i * GAP, TRAY.y + 8 + GAP / 2 + j * GAP, j * N + i]);
  const cups = [];
  for (const [x, y] of cells) {
    cups.push(L(k.ring(x, y, CUP, z, P, 24), { tone: "lo" }));
    cups.push(L(k.ring(x, y, CUP - 1.2, z, P, 20), { tone: "faint" }));
  }
  out.push(cups.join(""));
  const atoms = byDepth(cells, ([x, y]) => [x, y, z]).map(([x, y, index]) => {
    const ball = G.sphereOf([x, y, z + 3.2], 3.1, P, { steps: 20 });
    const child = G.sphereOf([x, y, z + 0.6], 2.2, P, { steps: 16 });
    return `<g data-atom="${index}"><g data-parent>${S(ball, { tone: "hi", lit: true })}</g><g data-child style="display:none">${S(child, { tone: "lo", crease: "none" })}</g></g>`;
  });
  out.push(D(k.corners(TRAY, 3).map(([x, y]) => at([x, y, z])), { size: 0.45 }));
  out.push(`</g><g data-part="atoms">${atoms.join("")}</g><g data-part="timer">`);

  // Timer: a round dial on a pedestal, one division per tenth of a half-life, a knob to reset.
  const [dx, dy] = DIAL;
  out.push(`<path class="iso-halo" d="${k.haloOf({ x: dx - DIAL_R, y: dy - DIAL_R, w: DIAL_R * 2, d: DIAL_R * 2, r: DIAL_R }, 0, 1, P)}" style="filter:blur(5px)"/>`);
  out.push(S(k.cylinder(dx, dy, DIAL_R + 3, 0, 3, P, 64), { tone: "lo" }));
  out.push(S(k.cylinder(dx, dy, DIAL_R, 3, DIAL_H, P, 64, 0.8), { tone: "hi", crease: "lo", inner: L(k.sideArc(dx, dy, DIAL_R, 7, P, 40), { tone: "faint" }) }));
  out.push(L(k.knurl(dx, dy, DIAL_R, 3 + DIAL_H - 3, 3 + DIAL_H, 70, P, 0.3), { tone: "lo" }));
  out.push(dialFace(P, dx, dy, 3 + DIAL_H, DIAL_R - 1, { count: 50, every: 10, text: "T½", span: Math.PI * 1.6, from: -Math.PI * 0.8 }));
  out.push(knob(P, dx + DIAL_R + 10, dy + 16, 0, 4.4, 5));
  out.push(S(k.slabOf({ x: dx - 10, y: dy + DIAL_R + 6, w: 20, d: 7, r: 1 }, 0, 0.8, P, 3, 0.3), { tone: "lo", crease: "none" }));
  for (let i = 0; i < 2; i++) out.push(L(k.lineOnTop([dx - 7, dy + DIAL_R + 8.2 + i * 2.4], [dx + 5 - i * 4, dy + DIAL_R + 8.2 + i * 2.4], 0.8, P), { tone: "faint", free: true }));
  const needleZ = 3 + DIAL_H;
  out.push(`<path data-needle class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1.1" d="${needlePath(P, dx, dy, needleZ, DIAL_R - 1, 0, { span: Math.PI * 1.6, from: -Math.PI * 0.8 })}"/></g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Лоток на сто ячеек, в каждой по атому. Таймер отсчитывает время в периодах полураспада; распавшиеся атомы опускаются в ячейку и гаснут.",
    body: out,
  });

  const controls = `<div class="fig-controls" role="radiogroup" aria-label="Нуклид">${ISOTOPES.map((iso, i) => `<button type="button" data-iso="${i}" aria-pressed="${i === 0}">${iso.name}</button>`).join("")}<button type="button" data-reset>Сначала</button></div>`;

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const LIFE = ${JSON.stringify(lifetimes().map((t) => +t.toFixed(4)))};
const ISOS = ${JSON.stringify(ISOTOPES)};
const MAX_T = ${MAX_T}, DX = ${dx}, DY = ${dy}, DZ = ${needleZ}, DR = ${DIAL_R - 1};
const needle = svg.querySelector("[data-needle]");
const atoms = [];
svg.querySelectorAll("[data-atom]").forEach((g) => { atoms[+g.dataset.atom] = { p: g.querySelector("[data-parent]"), c: g.querySelector("[data-child]"), gone: false }; });
let iso = ISOS[0], t = 0, rate = 0.42, scrub = null, hold = 0;
const needleAt = ${needlePath.toString().replace(/k\.lineOnTop/g, "lineOnTop")};
function draw() {
  let left = 0;
  for (let i = 0; i < atoms.length; i++) {
    const gone = t >= LIFE[i];
    if (gone !== atoms[i].gone) { atoms[i].gone = gone; atoms[i].p.style.display = gone ? "none" : ""; atoms[i].c.style.display = gone ? "" : "none"; }
    if (!gone) left++;
  }
  needle.setAttribute("d", needleAt(P, DX, DY, DZ, DR, Math.min(t, MAX_T) / MAX_T, { span: Math.PI * 1.6, from: -Math.PI * 0.8 }));
  const real = t * iso.half;
  const shown = real >= 100 ? fmt(real, 0) : fmt(real, 1);
  say(iso.name + " → " + iso.daughter + " (" + iso.mode + ") · t = " + fmt(t, 1) + " T½ = " + shown + " " + iso.unit + " · N = " + left + " (теория " + fmt(100 * Math.pow(2, -t), 0) + ")");
}
const run = loop((dt, calm) => {
  if (scrub !== null) { t = t + (scrub - t) * (1 - Math.exp(-dt / 0.12)); if (Math.abs(scrub - t) < 0.002) t = scrub; }
  else if (hold > 0) { hold -= dt; }
  else { t += rate * dt; if (t > MAX_T + 0.6) { t = 0; hold = 1.2; } }
  if (calm && scrub === null) t = 1;
  draw();
  return !calm || scrub !== null;
});
stage.addEventListener("pointermove", (e) => { scrub = clamp((shareX(e) - 0.1) / 0.8, 0, 1) * MAX_T; run(); });
stage.addEventListener("pointerleave", () => { scrub = null; run(); });
stage.addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight") scrub = clamp((scrub ?? t) + 0.5, 0, MAX_T);
  else if (e.key === "ArrowLeft") scrub = clamp((scrub ?? t) - 0.5, 0, MAX_T);
  else if (e.key === "Escape") scrub = null;
  else return;
  e.preventDefault(); run();
});
root.querySelectorAll("[data-iso]").forEach((b) => b.addEventListener("click", () => {
  iso = ISOS[+b.dataset.iso];
  root.querySelectorAll("[data-iso]").forEach((o) => o.setAttribute("aria-pressed", String(o === b)));
  draw();
}));
root.querySelector("[data-reset]").addEventListener("click", () => { t = 0; hold = 0.6; scrub = null; run(); });
draw();
`;

  return {
    P,
    name: "decay",
    live,
    html: card({
      name: "decay",
      fig: "Рис. 3.1",
      title: "Закон распада",
      hint: "Курсор вдоль стенда — время",
      readout: "¹³¹I → ¹³¹Xe · t = 0 T½ · N = 100",
      label: "Распад ста атомов: стрелки влево и вправо меняют время на полпериода",
      keys: [
        { mark: "lit", label: "Нераспавшийся атом (материнское ядро)" },
        { mark: "dim", label: "Продукт распада, опустившийся в ячейку" },
      ],
      caption:
        "У каждого из ста атомов своё случайное время жизни, разыгранное по закону N(t) = N₀·2^(−t/T½). Предсказать момент распада отдельного ядра нельзя, но за каждый период полураспада распадается примерно половина оставшихся: 100 → ≈50 → ≈25 → ≈12. Шкала таймера — пять периодов; выбор нуклида меняет только масштаб времени.",
      svg,
      controls,
    }),
  };
}
