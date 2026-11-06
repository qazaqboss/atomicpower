// Builds the static site into docs/: node build.mjs
// Chapters come from content/NN-slug.html (see content/SPEC.md); figures from figures/*.mjs.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, copyFileSync, cpSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ISO_CSS } from "./kit/iso-kit.mjs";
import { FORMULAS } from "./src/formulas.mjs";
import { FIGURES as GUIDE, CHAPTERS as CH_GUIDE, VOICE } from "./src/guide.mjs";
import { existsSync } from "node:fs";
import { axisVector } from "./kit/iso-kit.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "docs");
const SITE = "Атом от А до Я";
const KATEX = "assets/katex"; // vendored KaTeX 0.16.9 (MIT), see vendor/katex

// ---------- figures ----------
const FIG_NAMES = ["pile", "binding", "decay", "shielding", "chain", "core", "fuel", "loop", "barriers", "dose", "cask", "tokamak", "isl"].filter((n) => {
  try { readFileSync(join(ROOT, "figures", n + ".mjs")); return true; } catch { return false; }
});
const figures = {};
for (const name of FIG_NAMES) figures[name] = (await import(`./figures/${name}.mjs`)).build();
const audio = (name) => (existsSync(join(ROOT, "src/audio", name + ".mp3")) ? `assets/audio/${name}.mp3` : null);
const TITLES = { pile: "Чикагская поленница CP-1", barriers: "Барьеры безопасности", dose: "Время, расстояние, экран", cask: "Сухое хранение ОЯТ", tokamak: "Токамак ИТЭР", isl: "Скважинное выщелачивание", binding: "Энергия связи", decay: "Закон распада", shielding: "Защита от излучений", chain: "Цепная реакция", core: "Управление реактором", fuel: "Твэл и ТВС", loop: "Энергоблок ВВЭР-1000" };
const guidePanel = (name) => {
  const g = GUIDE[name];
  if (!g) return "";
  const P = figures[name].P;
  const data = {
    name, title: TITLES[name], intro: g.intro, introSrc: audio(`fig-${name}-intro`),
    up: axisVector(P, [0, 0, 1]).map((v) => +v.toFixed(4)),
    parts: g.parts.map((p) => ({ ...p, src: audio(`fig-${name}-${p.id}`) })),
  };
  return `<div class="fig-guide" data-guide-for="${name}">
  <div class="fig-guide-bar">
    <button type="button" class="fig-guide-main" data-guide-tour aria-pressed="false">▶ Экскурсия с гидом</button>
    <button type="button" data-guide-apart aria-pressed="false">Разобрать</button>
    <button type="button" data-guide-inspect aria-pressed="false">Осмотр деталей</button>
    <span class="fig-guide-voice">Голос: ElevenLabs</span>
  </div>
  <div class="fig-guide-parts" role="list" aria-label="Детали модели">${g.parts.map((p, i) => `<button type="button" role="listitem" data-guide-part="${p.id}" aria-pressed="false"><span>${i + 1}</span>${esc(p.name)}</button>`).join("")}</div>
  <div class="fig-guide-info" data-guide-info hidden aria-live="polite"><b data-guide-name></b><p data-guide-text></p></div>
  <script type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
</div>`;
};
const figBlock = (name) => (figures[name] ? `<div class="fig-wrap">${figures[name].html}${guidePanel(name)}</div>` : "");
const kitSource = readFileSync(join(ROOT, "kit/iso-kit.mjs"), "utf8").replace(/^export /gm, "");
const figuresJs = `(function () {
"use strict";
${kitSource}
const FIGURES = {
${Object.values(figures).map((f) => `  ${JSON.stringify(f.name)}: function (root) {${f.live}\n  },`).join("\n")}
};
document.querySelectorAll("[data-fig]").forEach((root) => { try { FIGURES[root.dataset.fig]?.(root); } catch (e) { console.error(root.dataset.fig, e); } });
})();
`;

// ---------- chapters ----------
const attr = (src, name) => (src.match(new RegExp(`data-${name}="([^"]*)"`)) || [])[1] || "";
const section = (src, cls) => (src.match(new RegExp(`<section class="${cls}">([\\s\\S]*?)</section>`)) || [])[1] || "";
const strip = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const files = readdirSync(join(ROOT, "content")).filter((f) => /^\d\d-.*\.html$/.test(f)).sort();
const chapters = files.map((file) => {
  const src = readFileSync(join(ROOT, "content", file), "utf8");
  const head = (src.match(/<article[^>]*>/) || [""])[0];
  const body = section(src, "body");
  const keypoints = [...section(src, "keypoints").matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
  const quiz = [...section(src, "quiz").matchAll(/<div class="q" data-answer="(\d)">([\s\S]*?)<\/div>/g)].map((m) => {
    const inner = m[2];
    return {
      answer: +m[1],
      q: ((inner.match(/<p>([\s\S]*?)<\/p>/) || [])[1] || "").trim(),
      options: [...((inner.match(/<ol>([\s\S]*?)<\/ol>/) || [])[1] || "").matchAll(/<li>([\s\S]*?)<\/li>/g)].map((o) => o[1].trim()),
      explain: ((inner.match(/<p class="explain">([\s\S]*?)<\/p>/) || [])[1] || "").trim(),
    };
  }).filter((q) => q.options.length >= 2);
  const exam = [...section(src, "exam").matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
  const gl = (src.match(/<dl class="glossary">([\s\S]*?)<\/dl>/) || [])[1] || "";
  const glossary = [...gl.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)].map((m) => ({ term: m[1].trim(), def: m[2].trim() }));
  const refs = [...section(src, "refs").matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim());
  const toc = [...body.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)].map((m) => ({ id: m[1], title: strip(m[2]) }));
  const words = strip(body).split(" ").length;
  return {
    num: attr(head, "num"), slug: attr(head, "slug"), title: attr(head, "title"), lead: attr(head, "lead"),
    minutes: +attr(head, "minutes") || Math.round(words / 160), file: file.replace(/\.html$/, ".html"), href: file,
    body, keypoints, quiz, exam, glossary, refs, toc, words,
  };
});

// ---------- layout ----------
const icon = (name) => ({
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  atom: '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="16" rx="13" ry="5"/><ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(60 16 16)"/><ellipse cx="16" cy="16" rx="13" ry="5" transform="rotate(-60 16 16)"/><circle cx="16" cy="16" r="2.2" class="fill"/></svg>',
}[name]);

const navHtml = (active) => `
<nav class="side" aria-label="Главы">
  <div class="side-label">Курс</div>
  <ol class="side-list">
    ${chapters.map((c) => `<li><a href="${c.href}"${c.slug === active ? ' aria-current="page"' : ""} data-progress="${c.slug}"><span class="side-num">${c.num}</span><span>${esc(c.title)}</span></a></li>`).join("")}
  </ol>
  <div class="side-label">К экзамену</div>
  <ul class="side-list">
    <li><a href="exam.html"${active === "exam" ? ' aria-current="page"' : ""}><span class="side-num">✓</span><span>Тренажёр и билеты</span></a></li>
    <li><a href="formulas.html"${active === "formulas" ? ' aria-current="page"' : ""}><span class="side-num">ƒ</span><span>Формулы и константы</span></a></li>
    <li><a href="glossary.html"${active === "glossary" ? ' aria-current="page"' : ""}><span class="side-num">Аа</span><span>Глоссарий</span></a></li>
    <li><a href="figures.html"${active === "figures" ? ' aria-current="page"' : ""}><span class="side-num">◇</span><span>Интерактивные модели</span></a></li>
    <li><a href="refs.html"${active === "refs" ? ' aria-current="page"' : ""}><span class="side-num">§</span><span>Литература</span></a></li>
  </ul>
</nav>`;

function page({ title, active, main, toc = "", description = "", math = true, figs = false }) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description || "Учебный курс по атомной энергетике: от строения ядра до АЭС, безопасности и топливного цикла. Тексты, интерактивные модели, тесты и билеты.")}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
${math ? `<link rel="stylesheet" href="${KATEX}/katex.min.css">` : ""}
<link rel="stylesheet" href="assets/site.css">
<script>try{var t=localStorage.getItem("theme");if(!t)t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}</script>
</head>
<body class="iso">
<a class="skip" href="#main">К содержанию</a>
<header class="top">
  <button class="icon-btn menu-btn" type="button" aria-label="Меню" data-menu>${icon("menu")}</button>
  <a class="brand" href="index.html">${icon("atom")}<span>${SITE}</span></a>
  <div class="search">
    <label class="search-box">${icon("search")}<input type="search" placeholder="Поиск по курсу" aria-label="Поиск по курсу" data-search autocomplete="off"></label>
    <div class="search-results" data-results hidden></div>
  </div>
  <button class="icon-btn" type="button" aria-label="Сменить тему" data-theme-toggle>${icon("sun")}</button>
</header>
<div class="shell">
  ${navHtml(active)}
  <main id="main" class="main">${main}</main>
  ${toc ? `<aside class="toc" aria-label="На этой странице">${toc}</aside>` : "<div></div>"}
</div>
<footer class="foot"><div>${SITE} — учебный курс по атомной энергетике. Интерактивные фигуры построены на открытом наборе <a href="https://github.com/wheresryan22/anatomy">Anatomy</a> (MIT).</div><div>Числа в тексте и моделях — справочные; перед экзаменом сверяйтесь с вашим учебником и программой курса.</div></footer>
${math ? `<script defer src="${KATEX}/katex.min.js"></script><script defer src="${KATEX}/contrib/auto-render.min.js"></script>` : ""}
<script src="assets/search.js" defer></script>
<script src="assets/site.js" defer></script>
<script src="assets/guide.js" defer></script>
${figs ? `<script src="assets/figures.js" defer></script>` : ""}
</body>
</html>`;
}

const quizHtml = (c) => c.quiz.length ? `
<section class="block quiz" id="quiz" data-quiz="${c.slug}">
  <h2>Проверьте себя <span class="count">${c.quiz.length} вопросов</span></h2>
  <ol class="quiz-list">
    ${c.quiz.map((q, i) => `<li class="quiz-q" data-answer="${q.answer}" data-i="${i}">
      <p class="quiz-text">${q.q}</p>
      <div class="quiz-options">${q.options.map((o, j) => `<button type="button" class="quiz-opt" data-j="${j}"><span class="quiz-letter">${"АБВГ"[j] || j + 1}</span><span>${o}</span></button>`).join("")}</div>
      <p class="quiz-explain" hidden>${q.explain}</p>
    </li>`).join("")}
  </ol>
  <div class="quiz-score" data-score aria-live="polite"></div>
</section>` : "";

function chapterPage(c, i) {
  // Wrap any bare table so it scrolls on its own instead of widening the page.
  let body = c.body.replace(/(<div class="table">\s*)?(<table[\s\S]*?<\/table>)/g, (m, wrap, table) => (wrap ? m : `<div class="table">${table}</div>`));
  const used = [];
  body = body.replace(/<!--FIG:(\w+)-->/g, (_, name) => { if (!figures[name]) return ""; used.push(name); return figBlock(name); });
  const prev = chapters[i - 1], next = chapters[i + 1];
  const toc = `<div class="toc-label">В главе</div><ol>${c.toc.map((t) => `<li><a href="#${t.id}">${esc(t.title)}</a></li>`).join("")}
    ${c.keypoints.length ? '<li><a href="#keypoints">Главное</a></li>' : ""}${c.quiz.length ? '<li><a href="#quiz">Тест</a></li>' : ""}${c.exam.length ? '<li><a href="#exam">Вопросы к экзамену</a></li>' : ""}${c.glossary.length ? '<li><a href="#terms">Термины</a></li>' : ""}${c.refs.length ? '<li><a href="#refs">Литература</a></li>' : ""}</ol>`;
  const main = `
<article class="chapter" data-chapter="${c.slug}">
  <header class="ch-head">
    <div class="ch-kicker"><span>Глава ${c.num}</span><span>≈ ${c.minutes} мин чтения</span><span>${c.quiz.length} вопросов теста</span></div>
    <h1>${esc(c.title)}</h1>
    <p class="lead">${esc(c.lead)}</p>
    ${CH_GUIDE[c.num] ? `<div class="ch-audio" data-ch-audio="${audio("ch-" + c.num) || ""}" data-ch-text="${esc(CH_GUIDE[c.num])}"><button type="button" aria-label="Слушать аудиогид">▶</button><div class="ch-audio-body"><b>Аудиогид к главе</b><span class="ch-audio-track"><span data-ch-bar></span></span></div><span class="ch-audio-time" data-ch-time>${esc(VOICE.name.split(" ")[0])} · ElevenLabs</span></div>` : ""}
  </header>
  <div class="prose">${body}</div>
  ${c.keypoints.length ? `<section class="block keypoints" id="keypoints"><h2>Главное в главе</h2><ul>${c.keypoints.map((k) => `<li>${k}</li>`).join("")}</ul></section>` : ""}
  ${quizHtml(c)}
  ${c.exam.length ? `<section class="block exam" id="exam"><h2>Вопросы к экзамену</h2><ol>${c.exam.map((q) => `<li>${q}</li>`).join("")}</ol></section>` : ""}
  ${c.glossary.length ? `<section class="block terms" id="terms"><h2>Термины</h2><dl>${c.glossary.map((g) => `<div><dt>${g.term}</dt><dd>${g.def}</dd></div>`).join("")}</dl></section>` : ""}
  ${c.refs.length ? `<section class="block refs" id="refs"><h2>Литература и источники</h2><ol>${c.refs.map((r) => `<li>${r}</li>`).join("")}</ol></section>` : ""}
  <nav class="pager">
    ${prev ? `<a href="${prev.href}" class="pager-prev"><span>← Глава ${prev.num}</span><b>${esc(prev.title)}</b></a>` : "<span></span>"}
    ${next ? `<a href="${next.href}" class="pager-next"><span>Глава ${next.num} →</span><b>${esc(next.title)}</b></a>` : `<a href="exam.html" class="pager-next"><span>Финал →</span><b>Тренажёр и билеты</b></a>`}
  </nav>
</article>`;
  return page({ title: `${c.num}. ${c.title} — ${SITE}`, active: c.slug, main, toc, description: c.lead, figs: used.length > 0 });
}

function indexPage() {
  const total = chapters.reduce((s, c) => s + c.words, 0);
  const q = chapters.reduce((s, c) => s + c.quiz.length, 0);
  const terms = chapters.reduce((s, c) => s + c.glossary.length, 0);
  const main = `
<section class="hero">
  <div class="hero-text">
    <div class="ch-kicker"><span>Учебный курс</span><span>${chapters.length} глав</span><span>${FIG_NAMES.length} интерактивных моделей</span></div>
    <h1>Атомная энергетика<br>от&nbsp;А&nbsp;до&nbsp;Я</h1>
    <p class="lead">От строения ядра и закона радиоактивного распада — до физики реактора, устройства АЭС, безопасности, топливного цикла и атомной отрасли Казахстана. Большие разборы, формулы с примерами расчёта, модели, которые можно трогать, тесты и экзаменационные билеты.</p>
    <div class="hero-actions"><a class="btn primary" href="${chapters[0]?.href || "#"}">Начать с главы 01</a><a class="btn" href="exam.html">Тренажёр к экзамену</a></div>
    <dl class="stats"><div><dt>${Math.round(total / 1000)} тыс.</dt><dd>слов учебного текста</dd></div><div><dt>${q}</dt><dd>тестовых вопросов</dd></div><div><dt>${terms}</dt><dd>терминов</dd></div></dl>
  </div>
</section>
${figures.core ? figBlock("core").replace('class="fig-wrap"', 'class="fig-wrap hero-fig"') : ""}
<section class="block">
  <h2>Программа курса</h2>
  <ol class="course">
    ${chapters.map((c) => `<li><a href="${c.href}" class="course-card" data-progress="${c.slug}">
      <span class="course-num">${c.num}</span>
      <span class="course-title">${esc(c.title)}</span>
      <span class="course-lead">${esc(c.lead)}</span>
      <span class="course-meta">≈ ${c.minutes} мин · ${c.quiz.length} вопр.<span class="course-done" data-done></span></span>
    </a></li>`).join("")}
  </ol>
</section>
<section class="block how">
  <h2>Как готовиться по этому сайту</h2>
  <ol>
    <li><b>Читайте по порядку.</b> Главы 02–06 — физическая основа: без энергии связи, распада и цепной реакции дальше будет трудно.</li>
    <li><b>Трогайте модели.</b> Каждая фигура считает реальные числа: двигайте стержни, меняйте поглотители, следите за показаниями в правом нижнем углу.</li>
    <li><b>Проходите тест в конце главы.</b> Результат сохраняется в браузере, а в программе курса появляется отметка.</li>
    <li><b>Решайте задачи из «Вопросов к экзамену»</b> и сверяйтесь с <a href="formulas.html">листом формул</a>.</li>
    <li><b>Перед экзаменом</b> — <a href="exam.html">тренажёр</a> со случайными вопросами из всех глав и билеты по три вопроса.</li>
  </ol>
</section>`;
  return page({ title: `${SITE} — учебный курс по атомной энергетике`, active: "home", main, figs: true });
}

function examPage() {
  const all = chapters.flatMap((c) => c.quiz.map((q) => ({ ...q, ch: c.num, title: c.title })));
  // Tickets: three questions from three different chapters, deterministic.
  const pools = chapters.filter((c) => c.exam.length).map((c) => c.exam.map((q) => ({ q, ch: c.num })));
  const tickets = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let t = 0; t < 30 && pools.length >= 3; t++) {
    const order = pools.map((p, i) => [rnd(), i]).sort((a, b) => a[0] - b[0]).slice(0, 3).map(([, i]) => i).sort((a, b) => a - b);
    tickets.push(order.map((i) => pools[i][Math.floor(rnd() * pools[i].length)]));
  }
  const main = `
<header class="ch-head"><div class="ch-kicker"><span>К экзамену</span><span>${all.length} вопросов в банке</span></div><h1>Тренажёр и билеты</h1>
<p class="lead">Случайная выборка тестовых вопросов из всех глав с немедленной проверкой, затем — экзаменационные билеты по три развёрнутых вопроса из разных тем.</p></header>
<section class="block trainer" data-trainer>
  <h2>Тренажёр</h2>
  <div class="trainer-bar">
    <label>Вопросов <select data-trainer-count><option>10</option><option selected>20</option><option>40</option></select></label>
    <label>Главы <select data-trainer-chapter><option value="">все</option>${chapters.map((c) => `<option value="${c.num}">${c.num}. ${esc(c.title)}</option>`).join("")}</select></label>
    <button type="button" class="btn primary" data-trainer-start>Новый тест</button>
  </div>
  <ol class="quiz-list" data-trainer-list></ol>
  <div class="quiz-score" data-score aria-live="polite"></div>
</section>
<section class="block tickets">
  <h2>Экзаменационные билеты</h2>
  <div class="ticket-grid">${tickets.map((t, i) => `<details class="ticket"><summary><span>Билет № ${i + 1}</span><span class="ticket-ch">гл. ${t.map((x) => x.ch).join(" · ")}</span></summary><ol>${t.map((x) => `<li>${x.q} <a href="${chapters.find((c) => c.num === x.ch).href}#exam" class="ticket-link">гл. ${x.ch}</a></li>`).join("")}</ol></details>`).join("")}</div>
</section>
<script type="application/json" id="bank">${JSON.stringify(all).replace(/</g, "\\u003c")}</script>`;
  return page({ title: `Тренажёр и билеты — ${SITE}`, active: "exam", main });
}

function glossaryPage() {
  const all = chapters.flatMap((c) => c.glossary.map((g) => ({ ...g, c }))).sort((a, b) => strip(a.term).localeCompare(strip(b.term), "ru"));
  const letters = [...new Set(all.map((g) => strip(g.term)[0]?.toUpperCase()))];
  const main = `
<header class="ch-head"><div class="ch-kicker"><span>Справочник</span><span>${all.length} терминов</span></div><h1>Глоссарий</h1><p class="lead">Все определения курса в одном списке. Начните вводить термин — список отфильтруется.</p></header>
<div class="filter"><input type="search" placeholder="Фильтр терминов" data-filter="#gloss > div" aria-label="Фильтр терминов"></div>
<div class="letters">${letters.map((l) => `<a href="#l-${esc(l)}">${esc(l)}</a>`).join("")}</div>
<dl class="gloss" id="gloss">${all.map((g, i) => {
    const l = strip(g.term)[0]?.toUpperCase();
    const first = i === 0 || strip(all[i - 1].term)[0]?.toUpperCase() !== l;
    return `<div${first ? ` id="l-${esc(l)}"` : ""}><dt>${g.term}</dt><dd>${g.def} <a class="gloss-ch" href="${g.c.href}#terms">гл. ${g.c.num}</a></dd></div>`;
  }).join("")}</dl>`;
  return page({ title: `Глоссарий — ${SITE}`, active: "glossary", main });
}

function refsPage() {
  const main = `
<header class="ch-head"><div class="ch-kicker"><span>Справочник</span></div><h1>Литература и источники</h1><p class="lead">Учебники, нормативные документы и открытые базы данных, на которые опираются главы курса.</p></header>
${chapters.filter((c) => c.refs.length).map((c) => `<section class="block refs"><h2><a href="${c.href}">${c.num}. ${esc(c.title)}</a></h2><ol>${c.refs.map((r) => `<li>${r}</li>`).join("")}</ol></section>`).join("")}`;
  return page({ title: `Литература — ${SITE}`, active: "refs", main, math: false });
}

function formulasPage() {
  const main = `
<header class="ch-head"><div class="ch-kicker"><span>Шпаргалка</span></div><h1>Формулы и константы</h1><p class="lead">Ключевые соотношения курса с расшифровкой обозначений и типичными значениями — для повторения перед экзаменом.</p></header>
${FORMULAS.map((g) => `<section class="block formulas"><h2>${g.title}${g.ch ? ` <a class="count" href="${chapters.find((c) => c.num === g.ch)?.href || "#"}">гл. ${g.ch}</a>` : ""}</h2><div class="formula-grid">${g.items.map((f) => `<div class="formula-card"><div class="formula-name">${f.name}</div><div class="formula-tex">\\[${f.tex}\\]</div><div class="formula-note">${f.note}</div></div>`).join("")}</div></section>`).join("")}`;
  return page({ title: `Формулы и константы — ${SITE}`, active: "formulas", main });
}

function figuresPage() {
  const where = { pile: "01", barriers: "10", dose: "11", cask: "12", tokamak: "13", isl: "14", binding: "02", decay: "03", shielding: "04", chain: "05", core: "06", fuel: "07", loop: "09" };
  const main = `
<header class="ch-head"><div class="ch-kicker"><span>Галерея</span><span>${FIG_NAMES.length} моделей</span></div><h1>Интерактивные модели</h1><p class="lead">Все фигуры курса на одной странице. Каждая — небольшой прибор на верстаке: числа в правом нижнем углу считаются той же моделью, что двигает детали.</p></header>
${FIG_NAMES.map((n) => `<div class="fig-wrap">${figures[n].html}${guidePanel(n)}<p class="fig-from">Из главы <a href="${chapters.find((c) => c.num === where[n])?.href || "#"}">${where[n]}. ${esc(chapters.find((c) => c.num === where[n])?.title || "")}</a></p></div>`).join("")}`;
  return page({ title: `Интерактивные модели — ${SITE}`, active: "figures", main, figs: true, math: false });
}

// ---------- write ----------
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "assets"), { recursive: true });
writeFileSync(join(OUT, "assets/site.css"), ISO_CSS + readFileSync(join(ROOT, "src/site.css"), "utf8"));
copyFileSync(join(ROOT, "src/site.js"), join(OUT, "assets/site.js"));
cpSync(join(ROOT, "vendor/katex"), join(OUT, "assets/katex"), { recursive: true });
cpSync(join(ROOT, "src/audio"), join(OUT, "assets/audio"), { recursive: true });
copyFileSync(join(ROOT, "src/guide.js"), join(OUT, "assets/guide.js"));
writeFileSync(join(OUT, "assets/figures.js"), figuresJs);
const search = [];
for (const c of chapters) {
  search.push({ t: `${c.num}. ${c.title}`, u: c.href, s: c.lead });
  const parts = c.body.split(/<h2 id="/).slice(1);
  for (const part of parts) {
    const id = part.slice(0, part.indexOf('"'));
    const title = strip(part.slice(part.indexOf(">") + 1, part.indexOf("</h2>")));
    search.push({ t: title, u: `${c.href}#${id}`, s: `Глава ${c.num}`, b: strip(part.slice(part.indexOf("</h2>"))).slice(0, 1600) });
  }
  for (const g of c.glossary) search.push({ t: strip(g.term), u: `${c.href}#terms`, s: `Термин · гл. ${c.num}`, b: strip(g.def) });
}
writeFileSync(join(OUT, "assets/search.js"), "window.SEARCH_INDEX = " + JSON.stringify(search).replace(/</g, "\\u003c") + ";\n");
writeFileSync(join(OUT, "index.html"), indexPage());
chapters.forEach((c, i) => writeFileSync(join(OUT, c.href), chapterPage(c, i)));
writeFileSync(join(OUT, "exam.html"), examPage());
writeFileSync(join(OUT, "glossary.html"), glossaryPage());
writeFileSync(join(OUT, "refs.html"), refsPage());
writeFileSync(join(OUT, "formulas.html"), formulasPage());
writeFileSync(join(OUT, "figures.html"), figuresPage());
writeFileSync(join(OUT, ".nojekyll"), "");
console.log(`built ${chapters.length} chapters, ${FIG_NAMES.length} figures, ${chapters.reduce((s, c) => s + c.words, 0)} words, ${chapters.reduce((s, c) => s + c.quiz.length, 0)} quiz questions`);
