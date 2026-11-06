// Fig 11.1 — Distance, time and shielding: a ¹³⁷Cs source (1 ГБк) in an open lead pot, a long
// rail with a centimetre scale and a dose-rate meter on a carriage. Ḣ = Γ·A / r², with
// Γ(¹³⁷Cs) ≈ 0,0927 мкЗв·м²/(ч·МБк) (with ¹³⁷ᵐBa). A 2 cm lead screen can slide into the beam.
// World units: centimetres.
import { k, G, tools, bench, card, dialFace, needlePath, knob, LIVE_PRELUDE } from "./common.mjs";

const GAMMA = 0.0927; // мкЗв·м²/(ч·МБк)
const ACT = 1000; // МБк
const PB = Math.exp(-0.113 * 11.35 * 2); // 2 см свинца, узкий пучок
const R0 = 50, R1 = 300;
const SRC = [0, 0];
const RAIL_Y = 0;
const Z = 16;

export function build() {
  const W = 700, H = 380;
  const PLATE = { x: -46, y: -40, w: R1 + 76, d: 96, r: 8 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [0, 0, 40], [R1, 0, 46]], W, H, { pad: 18, azimuth: 28, elevation: 34 });
  const { at, S, L, D } = tools(P);
  const out = [`<g data-part="base">${bench(P, PLATE, { ruler: false })}</g>`];

  // Rail with a 0–300 cm scale on its top.
  const rail = { x: 44, y: -6, w: R1 - 30, d: 12, r: 1.5 };
  const ticks = k.topTicks(R0 - 5, R1, 5, 10, rail.y + 1, 3, [2.4, 4.4], P);
  out.push(`<g data-part="rail">${S(k.slabOf(rail, 0, 3, P, 3, 0.5), { tone: "mid", inner: L(k.sideSeam(rail, 1.5, P, 3), { tone: "faint" }) })}${L(ticks.minor, { tone: "lo" })}${L(ticks.major, { tone: "mid" })}${[50, 100, 150, 200, 250, 300].map((x) => k.faceTextSvg(k.topMatrix([x - 2, rail.y + 9], 3, P, "x"), String(x), { size: 3.2, tone: "lo" })).join("")}${D([at([rail.x + 3, 0, 3]), at([rail.x + rail.w - 3, 0, 3])], { size: 0.45 })}</g>`);

  // Source: lead pot with the capsule on a pin; the lid stands beside it.
  const F = G.frameAlong([0, 0, 0], [0, 0, 1]);
  out.push(`<g data-part="source">${S(G.solidOf([[0, 0], [0, 12], [3, 12], [3, 13], [24, 13], [26, 11, 1], [28, 0]], F, P), { tone: "mid", inner: L(G.arcOf(F, 10, 13, P), { tone: "faint" }) })}${L(k.ring(0, 0, 6, 28, P, 28), { tone: "lo" })}${S(k.cylinder(0, 0, 2.4, 28, 4, P, 20), { tone: "hi", lit: true })}${D([at([0, 0, 32])], { size: 0.8, tone: "hi" })}${k.faceTextSvg(k.sideMatrix([-6, 13], 8, P, "left"), "Pb", { size: 3.6, tone: "lo" })}</g>`);
  out.push(`<g data-part="lid">${S(k.cylinder(-22, 30, 14, 0, 6, P, 48, 0.6), { tone: "mid" })}${knob(P, -22, 30, 6, 4, 4)}</g>`);

  // Lead screen on a slide (moves across y into the line between source and meter).
  out.push(`<g data-part="screen"><g data-screen>${S(k.slabOf({ x: 36, y: -14, w: 2, d: 28, r: 0.5 }, 0, 34, P, 2, 0), { tone: "mid" })}${S(k.slabOf({ x: 34, y: -16, w: 6, d: 4, r: 1 }, 0, 6, P, 2, 0.3), { tone: "mid" })}${S(k.slabOf({ x: 34, y: 12, w: 6, d: 4, r: 1 }, 0, 6, P, 2, 0.3), { tone: "mid" })}</g></g>`);

  // Meter on its carriage (built at x = 0, moved live).
  const m = [];
  const cplan = { x: -10, y: -12, w: 20, d: 24, r: 2 };
  m.push(`<path class="iso-halo" d="${k.haloOf(cplan, 3, 0.1, P)}" style="filter:blur(4px)"/>`);
  m.push(S(k.slabOf(cplan, 3, 4, P, 3, 0.5), { tone: "mid" }));
  const box = { x: -9, y: -9, w: 18, d: 20, r: 2.5 };
  m.push(S(k.slabOf(box, 7, 22, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(box, 12, P, 4), { tone: "faint" }) }));
  m.push(S(k.cylinder(0, 1, 7.4, 29, 1.2, P, 40), { tone: "hi", crease: "lo" }));
  m.push(dialFace(P, 0, 1, 30.2, 7.4, { count: 20, every: 5, text: "мкЗв/ч", span: Math.PI, from: -Math.PI / 2 }));
  const det = G.frameAlong([-9, 0, 18], [-1, 0, 0]);
  m.push(S(G.disc(0, 6, 3.4, det, P), { tone: "hi", lit: true }));
  m.push(D([at([6, 9, 29]), at([-6, 9, 29])], { size: 0.45 }));
  m.push(`<path data-needle class="iso-line" data-tone="lit" data-free="start" style="stroke-width:1" d="${needlePath(P, 0, 1, 30.4, 7.4, 0.5, { span: Math.PI, from: -Math.PI / 2 })}"/>`);
  out.push(`<g data-part="meter"><g data-meter transform="${k.translateAlong(P, [100, 0, 0])}">${m.join("")}</g></g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Источник цезия-137 в свинцовом контейнере, рельс со шкалой до трёх метров и дозиметр на каретке. Мощность дозы падает обратно пропорционально квадрату расстояния.",
    body: out,
  });

  const controls = `<div class="fig-controls"><button type="button" data-pb aria-pressed="false">Экран: свинец 2 см</button><label class="fig-range">Время <input type="range" min="1" max="480" value="60" data-min> <output data-min-out>60 мин</output></label></div>`;

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const G0 = ${GAMMA}, A = ${ACT}, PB = ${PB}, R0 = ${R0}, R1 = ${R1};
const meter = svg.querySelector("[data-meter]");
const screen = svg.querySelector("[data-screen]");
const needle = svg.querySelector("[data-needle]");
const btn = root.querySelector("[data-pb]");
const min = root.querySelector("[data-min]"), minOut = root.querySelector("[data-min-out]");
const needleAt = ${needlePath.toString().replace(/k\.lineOnTop/g, "lineOnTop")};
let x = 100, target = 100, pb = false, s = 1, touring = true, clock = 0, idle = 0, shownN = 0.5;
const tour = [50, 100, 200, 300, 100, 70];
const run = loop((dt, calm) => {
  if (touring) { clock += dt; target = tour[Math.floor(clock / 2.6) % tour.length]; }
  x = calm ? target : x + (target - x) * (1 - Math.exp(-dt / 0.35));
  s = calm ? (pb ? 0 : 1) : s + ((pb ? 0 : 1) - s) * (1 - Math.exp(-dt / 0.25));
  meter.setAttribute("transform", translateAlong(P, [x, 0, 0]));
  screen.setAttribute("transform", translateAlong(P, [0, 44 * s, 0]));
  const r = x / 100;
  const rate = G0 * A / (r * r) * (pb ? PB : 1);
  const share = Math.max(0, Math.min(1, (Math.log10(rate) + 1) / 4)); // 0,1 … 1000 мкЗв/ч
  shownN = calm ? share : shownN + (share - shownN) * (1 - Math.exp(-dt / 0.2));
  needle.setAttribute("d", needleAt(P, 0, 1, 30.4, 7.4, shownN, { span: Math.PI, from: -Math.PI / 2 }));
  const t = +min.value;
  const dose = rate * t / 60;
  say("r = " + fmt(r, 2) + " м · Ḣ ≈ " + (rate >= 10 ? fmt(rate, 0) : fmt(rate, 1)) + " мкЗв/ч · за " + t + " мин ≈ " + (dose >= 10 ? fmt(dose, 0) : fmt(dose, 1)) + " мкЗв" + (pb ? " · за экраном" : ""));
  return touring || Math.abs(target - x) > 0.05 || Math.abs((pb ? 0 : 1) - s) > 0.002;
});
const manual = () => { touring = false; clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; clock = 0; run(); }, 6000); run(); };
stage.addEventListener("pointermove", (e) => { target = R0 + clamp((shareX(e) - 0.15) / 0.8, 0, 1) * (R1 - R0); manual(); });
stage.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") target = Math.min(R1, target + 25); else if (e.key === "ArrowLeft") target = Math.max(R0, target - 25); else return; e.preventDefault(); manual(); });
btn.addEventListener("click", () => { pb = !pb; btn.setAttribute("aria-pressed", String(pb)); manual(); });
min.addEventListener("input", () => { minOut.textContent = min.value + " мин"; run(); });
if (still.matches) touring = false;
`;

  return {
    P,
    name: "dose",
    live,
    html: card({
      name: "dose",
      fig: "Рис. 11.1",
      title: "Время, расстояние, экран",
      hint: "Курсор вдоль рельса — расстояние",
      readout: "r = 1,00 м · Ḣ ≈ 93 мкЗв/ч",
      label: "Дозиметр на рельсе: стрелки влево и вправо отодвигают его на 25 см",
      keys: [
        { mark: "lit", label: "Источник ¹³⁷Cs и детектор дозиметра" },
        { mark: "raised", label: "Свинцовый контейнер, экран, каретка" },
      ],
      caption:
        "Мощность дозы от точечного источника: Ḣ = Γ·A/r². Для ¹³⁷Cs активностью 1 ГБк на расстоянии 1 м это около 93 мкЗв/ч; вдвое дальше — вчетверо меньше. Доза растёт пропорционально времени, а 2 см свинца снижают её примерно в 13 раз. Так работают три способа защиты: временем, расстоянием и экраном.",
      svg,
      controls,
    }),
  };
}
