// Fig 15.2 — The IAEA LEU Bank at the Ulba Metallurgical Plant (Oskemen/Ust-Kamenogorsk): a store
// with its front walls cut away, 60 type 30B cylinders of UF₆ (LEU, 4,95 % ²³⁵U) on saddles in three
// rows of two tiers, an overhead crane on wall rails, IAEA surveillance cameras and a seal on the
// gate. "Release" sends the crane to the next cylinder, lifts it and carries it to the loading bay.
// Units: decimetres. A 30B cylinder is ≈ 0,76 м in diameter and ≈ 2,1 м long.
import { k, G, tools, bench, card, LIVE_PRELUDE } from "./common.mjs";

const AX = [0, 1, 0];
const CYL_R = 3.8, CYL_L = 21;
const COLS = 10, ROWS = 3, TIERS = 2;
const PITCH_X = 9.6, PITCH_Y = 26;
const X0 = -64, Y0 = -22;
const HALL = { x: -84, y: -50, w: 190, d: 100, r: 1 };
const WALL_H = 54, CRANE_Z = 46;
const BAY = [92, 30];

const slot = (i) => {
  const tier = Math.floor(i / (COLS * ROWS));
  const j = i % (COLS * ROWS);
  const row = Math.floor(j / COLS), col = j % COLS;
  return [X0 + col * PITCH_X + (tier ? PITCH_X / 2 : 0), Y0 + row * PITCH_Y, 3 + CYL_R + 1.2 + tier * (CYL_R * 1.75)];
};

export function build() {
  const W = 700, H = 470;
  const PLATE = { x: HALL.x - 18, y: HALL.y - 18, w: HALL.w + 36, d: HALL.d + 36, r: 10 };
  const P = k.fitProjection([...k.boxCorners(PLATE, -17, 0), [HALL.x, HALL.y, WALL_H + 6]], W, H, { pad: 18, azimuth: 36, elevation: 34 });
  const { at, S, L, D, depth } = tools(P);
  const out = [`<g data-part="base">${bench(P, PLATE)}${S(k.slabOf(HALL, 0, 3, P, 2, 0.6), { tone: "lo" })}${L(k.planOutline({ x: BAY[0] - 10, y: BAY[1] - 14, w: 20, d: 28, r: 1 }, 3, P, 2), { tone: "mid", dashed: true })}</g>`];

  // Back walls (the two the viewer looks at from inside), with pilasters and a crane rail on each long wall.
  const walls = [];
  const back = { x: HALL.x, y: HALL.y, w: HALL.w, d: 4, r: 0.5 };
  const side = { x: HALL.x, y: HALL.y, w: 4, d: HALL.d, r: 0.5 };
  walls.push(S(k.slabOf(back, 3, WALL_H, P, 2, 0.5), { tone: "mid", inner: L([18, 36].map((z) => k.sideSeam(back, z, P, 2)).join(""), { tone: "faint" }) }));
  walls.push(S(k.slabOf(side, 3, WALL_H, P, 2, 0.5), { tone: "mid" }));
  for (let x = HALL.x + 20; x < HALL.x + HALL.w; x += 30) walls.push(S(k.slabOf({ x: x - 2, y: HALL.y + 4, w: 4, d: 3, r: 0.4 }, 3, WALL_H, P, 2, 0.3), { tone: "mid" }));
  walls.push(S(k.slabOf({ x: HALL.x + 4, y: HALL.y + 4, w: HALL.w - 4, d: 3, r: 0.4 }, CRANE_Z - 4, 3, P, 2, 0.3), { tone: "mid" }));
  // IAEA cameras on the back wall.
  for (const x of [HALL.x + 34, HALL.x + 124]) {
    walls.push(S(k.slabOf({ x: x - 3, y: HALL.y + 4, w: 6, d: 5, r: 0.8 }, WALL_H - 12, 5, P, 2, 0.3), { tone: "hi" }));
    walls.push(D([at([x, HALL.y + 9, WALL_H - 9.5])], { size: 1.1, tone: "hi" }));
  }
  out.push(`<g data-part="hall">${walls.join("")}</g>`);

  // Cylinders on saddles, sorted back to front; the one in the crane is moved live.
  const n = COLS * ROWS * TIERS;
  const items = [];
  for (let i = 0; i < n; i++) {
    const [x, y, z] = slot(i);
    const F = G.frameAlong([x, y - CYL_L / 2, z], AX);
    const prof = [[0, 0], [0, CYL_R * 0.55, 1], [0.8, CYL_R * 0.9, 1], [2, CYL_R], [CYL_L - 2, CYL_R], [CYL_L - 0.8, CYL_R * 0.9, 1], [CYL_L, CYL_R * 0.55, 1], [CYL_L, 0]];
    const body = S(G.solidOf(prof, F, P), { tone: "hi", inner: L([5, CYL_L - 5].map((s) => G.arcOf(F, s, CYL_R, P)).join(""), { tone: "faint" }) });
    const ring = S(G.disc(CYL_L / 2 - 0.8, CYL_L / 2 + 0.8, CYL_R + 0.5, F, P), { tone: "mid" });
    const saddles = z < 10 ? [-6, 6].map((dy) => S(k.slabOf({ x: x - 3.4, y: y + dy - 1.5, w: 6.8, d: 3, r: 0.4 }, 3, z - CYL_R * 0.7 - 3, P, 2, 0.3), { tone: "lo" })).join("") : "";
    items.push({ d: depth(x, y, z), svg: `<g data-cyl="${i}">${saddles}<g data-body>${body}${ring}</g></g>` });
  }
  items.sort((a, b) => a.d - b.d);
  out.push(`<g data-part="cylinders">${items.map((i) => i.svg).join("")}</g>`);

  // Crane: bridge spanning the hall (moves in x), trolley (moves in y), hook block (moves in z).
  const bridge = [S(k.slabOf({ x: -4, y: HALL.y + 4, w: 8, d: HALL.d - 6, r: 0.6 }, CRANE_Z - 1, 4, P, 2, 0.4), { tone: "mid" }), S(k.slabOf({ x: -5, y: HALL.y + 3, w: 10, d: 6, r: 0.8 }, CRANE_Z - 3, 6, P, 2, 0.4), { tone: "mid" })];
  const trolley = [S(k.slabOf({ x: -5, y: -4, w: 10, d: 8, r: 1 }, CRANE_Z + 3, 4, P, 2, 0.4), { tone: "mid" })];
  out.push(`<g data-part="crane"><g data-bridge transform="${k.translateAlong(P, [0, 0, 0])}">${bridge.join("")}<g data-trolley>${trolley.join("")}<path data-rope class="iso-line" data-tone="mid" d=""/><g data-hook>${S(k.slabOf({ x: -3, y: -2.5, w: 6, d: 5, r: 0.8 }, 0, 3, P, 2, 0.3), { tone: "hi", lit: true })}</g></g></g></g>`);

  // Gate with an IAEA seal (front-right corner of the hall).
  out.push(`<g data-part="gate">${S(k.slabOf({ x: HALL.x + HALL.w - 4, y: HALL.y + 8, w: 4, d: 30, r: 0.5 }, 3, 36, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam({ x: HALL.x + HALL.w - 4, y: HALL.y + 8, w: 4, d: 30, r: 0.5 }, 20, P, 2), { tone: "faint" }) })}${D([at([HALL.x + HALL.w, HALL.y + 23, 20])], { size: 1.4, tone: "hi" })}</g>`);

  const svg = k.figureSvg({
    width: W,
    height: H,
    label: "Хранилище Банка низкообогащённого урана МАГАТЭ на Ульбинском металлургическом заводе: 60 цилиндров типа 30B с гексафторидом урана на опорах, мостовой кран, камеры наблюдения МАГАТЭ и опломбированные ворота.",
    body: out,
  });

  const controls = `<div class="fig-controls"><button type="button" data-release>Отгрузить цилиндр</button><button type="button" data-refill>Пополнить банк</button></div>`;

  const live = `
${LIVE_PRELUDE}
const P = ${JSON.stringify(P)};
const SLOTS = ${JSON.stringify(Array.from({ length: n }, (_, i) => slot(i)))};
const BAY = ${JSON.stringify(BAY)}, CRANE_Z = ${CRANE_Z};
const cyl = []; svg.querySelectorAll("[data-cyl]").forEach((g) => (cyl[+g.dataset.cyl] = g));
const host = svg.querySelector('[data-part="cylinders"]');
const bridge = svg.querySelector("[data-bridge]"), trolley = svg.querySelector("[data-trolley]"), hook = svg.querySelector("[data-hook]"), rope = svg.querySelector("[data-rope]");
let left = SLOTS.length, job = null, cx = 0, cy = 0, cz = CRANE_Z - 6, touring = true, clock = 0;
const order = [...SLOTS.keys()].sort((a, b) => SLOTS[b][2] - SLOTS[a][2] || SLOTS[b][1] - SLOTS[a][1] || SLOTS[b][0] - SLOTS[a][0]);
const gone = new Set();
const go = (v, t, dt, speed) => v + Math.max(-speed * dt, Math.min(speed * dt, t - v));
function release() {
  if (job || left === 0) return;
  const i = order.find((j) => !gone.has(j));
  const [x, y, z] = SLOTS[i];
  job = { i, phase: 0, x, y, z, steps: [[x, y, CRANE_Z - 6], [x, y, z + 3.8], "grab", [x, y, CRANE_Z - 14], [BAY[0], BAY[1], CRANE_Z - 14], [BAY[0], BAY[1], 12], "drop", [BAY[0], BAY[1], CRANE_Z - 6]] };
}
function refill() { if (job) return; gone.clear(); left = SLOTS.length; cyl.forEach((g, i) => { g.style.display = ""; g.querySelector("[data-body]").removeAttribute("transform"); g.removeAttribute("transform"); }); }
const run = loop((dt, calm) => {
  if (touring && !job) { clock += dt; if (clock > 2.5) { clock = 0; if (left > 52) release(); else refill(); } }
  if (job) {
    const step = job.steps[job.phase];
    if (step === "grab") { host.appendChild(cyl[job.i]); job.carry = true; job.phase++; }
    else if (step === "drop") { cyl[job.i].style.display = "none"; gone.add(job.i); left--; job.carry = false; job.phase++; }
    else if (!step) job = null;
    else {
      const sp = calm ? 1e9 : 30;
      cx = go(cx, step[0], dt, sp); cy = go(cy, step[1], dt, sp); cz = go(cz, step[2], dt, sp * 0.6);
      if (cx === step[0] && cy === step[1] && cz === step[2]) job.phase++;
    }
    if (job && job.carry) {
      const [x, y, z] = SLOTS[job.i];
      cyl[job.i].setAttribute("transform", translateAlong(P, [cx - x, cy - y, cz - 3.8 - z]));
    }
  }
  bridge.setAttribute("transform", translateAlong(P, [cx, 0, 0]));
  trolley.setAttribute("transform", translateAlong(P, [0, cy, 0]));
  hook.setAttribute("transform", translateAlong(P, [0, 0, cz]));
  rope.setAttribute("d", segment([0, 0, CRANE_Z + 3], [0, 0, cz + 3], P));
  say("цилиндров 30B в банке: " + left + " из " + SLOTS.length + (job ? " · кран: отгрузка по запросу государства-члена" : "") + " · НОУ 4,95 % ²³⁵U в форме UF₆");
  return true;
});
root.querySelector("[data-release]").addEventListener("click", () => { touring = false; release(); run(); });
root.querySelector("[data-refill]").addEventListener("click", () => { touring = false; refill(); run(); });
`;

  return {
    P,
    name: "leubank",
    live,
    html: card({
      name: "leubank",
      fig: "Рис. 15.2",
      title: "Банк НОУ МАГАТЭ",
      hint: "Кнопки — отгрузка и пополнение",
      readout: "цилиндров 30B в банке: 60 из 60",
      label: "Хранилище Банка низкообогащённого урана МАГАТЭ в Усть-Каменогорске",
      keys: [
        { mark: "raised", label: "Цилиндры 30B с UF₆ (НОУ 4,95 %)" },
        { mark: "lit", label: "Камеры и пломба МАГАТЭ, крюк крана" },
      ],
      caption:
        "Банк НОУ МАГАТЭ открыт в 2017 году на Ульбинском металлургическом заводе в Усть-Каменогорске; первые партии урана поступили в 2019 году. В хранилище — около 90 т низкообогащённого урана (4,95 % ²³⁵U) в форме гексафторида в 60 цилиндрах типа 30B: этого хватило бы на три года работы энергоблока мощностью 1000 МВт. Это резерв на случай, если государство — член МАГАТЭ не сможет купить топливо на рынке по неэкономическим причинам. Камеры и пломбы МАГАТЭ непрерывно контролируют материал. Модель упрощённая: планировка хранилища условная.",
      svg,
      controls,
    }),
  };
}
