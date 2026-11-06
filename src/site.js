// Site behaviour: theme, menu, search, quizzes with saved progress, trainer, TOC, filters, maths.
(function () {
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ } },
  };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // Theme
  $("[data-theme-toggle]")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch (e) {}
  });

  // Mobile menu
  $("[data-menu]")?.addEventListener("click", () => document.body.toggleAttribute("data-menu-open"));
  document.addEventListener("click", (e) => { if (document.body.hasAttribute("data-menu-open") && !e.target.closest(".side,[data-menu]")) document.body.removeAttribute("data-menu-open"); });

  // Maths
  const renderMath = (el) => { if (window.renderMathInElement) window.renderMathInElement(el, { delimiters: [{ left: "\\[", right: "\\]", display: true }, { left: "\\(", right: "\\)", display: false }], throwOnError: false }); };
  window.addEventListener("load", () => renderMath(document.body));

  // Progress marks
  const progress = store.get("progress", {});
  const mark = () => $$("[data-progress]").forEach((a) => {
    const p = progress[a.dataset.progress];
    if (!p) return;
    a.setAttribute("data-done", "");
    const done = a.querySelector("[data-done]");
    if (done) done.textContent = "тест " + p.right + "/" + p.total;
  });
  mark();

  // Quiz
  function wireQuiz(list, scoreEl, onDone) {
    const qs = $$(".quiz-q", list);
    let answered = 0, right = 0;
    const update = () => { scoreEl.textContent = answered ? `Верно ${right} из ${answered}` + (answered === qs.length ? ` · итог ${Math.round((100 * right) / qs.length)} %` : ` · осталось ${qs.length - answered}`) : ""; };
    qs.forEach((q) => {
      const ans = +q.dataset.answer;
      $$(".quiz-opt", q).forEach((b) => b.addEventListener("click", () => {
        if (q.dataset.done) return;
        q.dataset.done = "1";
        const j = +b.dataset.j;
        $$(".quiz-opt", q).forEach((o) => { o.disabled = true; if (+o.dataset.j === ans) o.dataset.state = "right"; });
        if (j !== ans) b.dataset.state = "wrong"; else right++;
        answered++;
        const ex = $(".quiz-explain", q); if (ex && ex.textContent.trim()) ex.hidden = false;
        update();
        if (answered === qs.length && onDone) onDone(right, qs.length);
      }));
    });
    update();
  }
  $$("[data-quiz]").forEach((box) => wireQuiz($(".quiz-list", box), $("[data-score]", box), (right, total) => {
    progress[box.dataset.quiz] = { right, total, at: Date.now() };
    store.set("progress", progress);
    mark();
  }));

  // Trainer
  const trainer = $("[data-trainer]");
  if (trainer) {
    const bank = JSON.parse($("#bank").textContent);
    const list = $("[data-trainer-list]", trainer);
    const start = () => {
      const n = +$("[data-trainer-count]", trainer).value;
      const ch = $("[data-trainer-chapter]", trainer).value;
      const pool = bank.filter((q) => !ch || q.ch === ch);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      const pick = pool.slice(0, n);
      list.innerHTML = pick.map((q) => {
        // shuffle options, keep the answer
        const order = q.options.map((_, i) => i).sort(() => Math.random() - 0.5);
        return `<li class="quiz-q" data-answer="${order.indexOf(q.answer)}"><p class="quiz-text">${q.q}<span class="quiz-from">гл. ${q.ch} · ${q.title}</span></p><div class="quiz-options">${order.map((o, j) => `<button type="button" class="quiz-opt" data-j="${j}"><span class="quiz-letter">${"АБВГ"[j]}</span><span>${q.options[o]}</span></button>`).join("")}</div><p class="quiz-explain" hidden>${q.explain}</p></li>`;
      }).join("");
      const score = $("[data-score]", trainer);
      wireQuiz(list, score, (right, total) => { const best = store.get("trainer", []); best.push({ right, total, at: Date.now() }); store.set("trainer", best.slice(-20)); });
      renderMath(list);
    };
    $("[data-trainer-start]", trainer).addEventListener("click", start);
    window.addEventListener("load", start);
  }

  // Map: country buttons highlight that country's plants on the map figure.
  document.querySelectorAll("[data-country]").forEach((b) => b.addEventListener("click", () => window.dispatchEvent(new CustomEvent("map:country", { detail: b.dataset.country }))));

  // Filters
  $$("[data-filter]").forEach((input) => input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    $$(input.dataset.filter).forEach((el) => { el.hidden = q && !el.textContent.toLowerCase().includes(q); });
  }));

  // TOC highlight
  const toc = $$(".toc a");
  if (toc.length && "IntersectionObserver" in window) {
    const map = new Map(toc.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id)));
      const ids = [...map.keys()].filter((id) => seen.has(id));
      if (!ids.length) return;
      toc.forEach((a) => a.removeAttribute("data-active"));
      map.get(ids[0])?.setAttribute("data-active", "");
    }, { rootMargin: "-70px 0px -60% 0px" });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // Search
  const input = $("[data-search]"), results = $("[data-results]");
  let index = null, sel = -1;
  const load = () => index || (index = Promise.resolve(window.SEARCH_INDEX || []));
  const escape = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  const hl = (t, words) => { let s = escape(t); words.forEach((w) => { s = s.replace(new RegExp("(" + w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi"), "<mark>$1</mark>"); }); return s; };
  async function search() {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { results.hidden = true; return; }
    const words = q.split(/\s+/).filter(Boolean);
    const items = await load();
    const scored = [];
    for (const it of items) {
      const t = it.t.toLowerCase(), b = (it.b || "").toLowerCase();
      let s = 0;
      for (const w of words) { if (t.includes(w)) s += 10; else if (b.includes(w)) s += 2; else { s = 0; break; } }
      if (s) scored.push([s, it]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    sel = -1;
    results.innerHTML = scored.length ? scored.slice(0, 12).map(([, it]) => {
      let snip = it.s;
      if (it.b) { const i = it.b.toLowerCase().indexOf(words[0]); if (i >= 0) snip = it.s + " · …" + it.b.slice(Math.max(0, i - 50), i + 110) + "…"; }
      return `<a href="${it.u}"><b>${hl(it.t, words)}</b><small>${hl(snip, words)}</small></a>`;
    }).join("") : `<div class="search-empty">Ничего не найдено</div>`;
    results.hidden = false;
  }
  input?.addEventListener("input", search);
  input?.addEventListener("focus", () => { load(); if (input.value.trim().length > 1) search(); });
  input?.addEventListener("keydown", (e) => {
    const links = $$("a", results);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + links.length) % links.length; links.forEach((a, i) => a.setAttribute("aria-selected", String(i === sel))); }
    else if (e.key === "Enter" && links[Math.max(0, sel)]) location.href = links[Math.max(0, sel)].href;
    else if (e.key === "Escape") { results.hidden = true; input.blur(); }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) results.hidden = true; });
  document.addEventListener("keydown", (e) => { if (e.key === "/" && document.activeElement === document.body) { e.preventDefault(); input?.focus(); } });
})();
