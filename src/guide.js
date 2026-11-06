// Voice guide: figure tours and part inspector, chapter audio, and the learning autopilot that
// walks through the whole site — it reads each section aloud, highlights and scrolls to what it
// reads, runs the figure tours, pauses at the quiz, then moves on to the next chapter in place.
// Parts in the SVG carry data-part ids; "taking apart" lifts each part along world z with the CSS
// `translate` property, which composes with the transforms the figure's own live code writes.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  const store = {
    get(k, f) { try { const v = localStorage.getItem(k); return v === null ? f : JSON.parse(v); } catch (e) { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const prefs = Object.assign({ mode: "full", rate: 1 }, store.get("pilot-prefs", {}));

  // ---------- speech: one voice at a time across the page ----------
  let current = null;
  const stopAll = () => { if (current) { const c = current; current = null; c.stop(); } };
  const ruVoice = () => { try { return speechSynthesis.getVoices().find((v) => /^ru/i.test(v.lang)) || null; } catch (e) { return null; } };
  // Long texts are spoken sentence by sentence: some browsers cut a single long utterance short.
  const chunks = (text) => {
    const parts = text.replace(/\s+/g, " ").trim().match(/[^.!?…]+[.!?…]*\s*/g) || [text];
    const out = [];
    let buf = "";
    for (const p of parts) { if ((buf + p).length > 220 && buf) { out.push(buf); buf = p; } else buf += p; }
    if (buf.trim()) out.push(buf);
    return out;
  };
  function speak({ src, text, onend, onstop }) {
    stopAll();
    let done = false, audio = null, timer = 0, speaking = false;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); if (current === handle) current = null; onend && onend(); };
    const handle = {
      stop() { const was = done; done = true; clearTimeout(timer); if (!was && onstop) onstop(); if (audio) { audio.pause(); audio.src = ""; } try { if (speaking) speechSynthesis.cancel(); } catch (e) {} },
      audio: () => audio,
    };
    current = handle;
    const fallback = () => {
      if (done) return;
      try {
        if ("speechSynthesis" in window && text) {
          const list = chunks(text);
          speaking = true;
          speechSynthesis.cancel();
          const next = (i) => {
            if (done) return;
            if (i >= list.length) return finish();
            const u = new SpeechSynthesisUtterance(list[i]);
            u.lang = "ru-RU";
            const v = ruVoice(); if (v) u.voice = v;
            u.rate = 1.02 * prefs.rate;
            let moved = false;
            const go = () => { if (moved) return; moved = true; clearTimeout(timer); next(i + 1); };
            u.onend = go;
            u.onerror = go;
            // Some browsers never report the end of an utterance: move on after a generous estimate.
            clearTimeout(timer);
            timer = setTimeout(go, 2500 + (list[i].length * 95) / prefs.rate);
            speechSynthesis.speak(u);
          };
          next(0);
          return;
        }
      } catch (e) {}
      timer = setTimeout(finish, Math.max(1500, (text || "").length * 60 / prefs.rate));
    };
    if (src) {
      audio = new Audio(src);
      audio.preload = "auto";
      audio.playbackRate = prefs.rate;
      audio.addEventListener("ended", finish);
      audio.addEventListener("error", () => { audio = null; fallback(); });
      audio.play().catch(() => { audio = null; fallback(); });
    } else fallback();
    return handle;
  }

  // ---------- figures ----------
  function initFigurePanel(panel) {
    if (panel.__ready) return;
    panel.__ready = true;
    const data = JSON.parse($("script[type='application/json']", panel).textContent);
    const root = document.getElementById("fig-" + data.name);
    if (!root) return;
    const stage = $(".iso-stage", root);
    const svg = $("svg", stage);
    const info = $("[data-guide-info]", panel);
    const infoName = $("[data-guide-name]", panel);
    const infoText = $("[data-guide-text]", panel);
    const btnTour = $("[data-guide-tour]", panel);
    const btnApart = $("[data-guide-apart]", panel);
    const btnInspect = $("[data-guide-inspect]", panel);
    const chips = $$("[data-guide-part]", panel);
    const byId = Object.fromEntries(data.parts.map((p) => [p.id, p]));
    const groups = (id) => $$(`[data-part="${id}"]`, svg);
    const [ux, uy] = data.up;

    let apart = 0, target = 0, raf = 0, last = 0;
    const apply = () => {
      for (const p of data.parts) {
        const dz = p.lift * apart;
        const t = dz ? `${(ux * dz).toFixed(2)}px ${(uy * dz).toFixed(2)}px` : "";
        for (const g of groups(p.id)) g.style.translate = t;
      }
      svg.style.transformOrigin = "50% 100%";
      svg.style.transform = apart ? `scale(${(1 - 0.2 * apart).toFixed(3)})` : "";
    };
    const tick = (now) => {
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
      last = now;
      apart = still.matches ? target : apart + (target - apart) * (1 - Math.exp(-dt / 0.35));
      if (Math.abs(target - apart) < 0.002) apart = target;
      apply();
      raf = apart !== target ? requestAnimationFrame(tick) : 0;
    };
    const setApart = (on) => {
      target = on ? 1 : 0;
      btnApart.setAttribute("aria-pressed", String(on));
      btnApart.textContent = on ? "Собрать" : "Разобрать";
      if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
    };

    let focused = null;
    const focus = (id) => {
      focused = id;
      $$("[data-hot]", svg).forEach((g) => g.removeAttribute("data-hot"));
      chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.guidePart === id)));
      if (!id) { stage.removeAttribute("data-focus"); info.hidden = true; return; }
      stage.setAttribute("data-focus", "");
      for (const g of groups(id)) {
        g.setAttribute("data-hot", "");
        let a = g.parentElement;
        while (a && a !== svg) { if (a.hasAttribute("data-part")) a.setAttribute("data-hot", ""); a = a.parentElement; }
        g.querySelectorAll("[data-part]").forEach((c) => c.setAttribute("data-hot", ""));
      }
      const p = byId[id];
      infoName.textContent = p.name;
      infoText.textContent = p.text;
      info.hidden = false;
    };

    let touring = false, onDone = null;
    const endTour = () => {
      touring = false;
      btnTour.textContent = "▶ Экскурсия с гидом";
      btnTour.setAttribute("aria-pressed", "false");
      panel.removeAttribute("data-speaking");
    };
    const play = (i) => {
      if (i >= data.parts.length) { endTour(); focus(null); setApart(false); const cb = onDone; onDone = null; cb && cb(); return; }
      if (i < 0) {
        focus(null);
        infoName.textContent = data.title; infoText.textContent = data.intro; info.hidden = false;
        speak({ src: data.introSrc, text: data.intro, onend: () => touring && play(0), onstop: () => { onDone = null; endTour(); } });
      } else {
        const p = data.parts[i];
        if (!apart) setApart(true);
        focus(p.id);
        speak({ src: p.src, text: p.text, onend: () => touring && play(i + 1), onstop: () => { onDone = null; endTour(); } });
      }
    };
    const startTour = (cb) => {
      onDone = cb || null;
      touring = true;
      btnTour.textContent = "■ Остановить";
      btnTour.setAttribute("aria-pressed", "true");
      panel.setAttribute("data-speaking", "");
      play(-1);
    };
    btnTour.addEventListener("click", () => { if (touring) { stopAll(); focus(null); return; } startTour(); });
    btnApart.addEventListener("click", () => setApart(target === 0));
    chips.forEach((c) => c.addEventListener("click", () => {
      const id = c.dataset.guidePart;
      if (touring) endTour();
      if (!apart) setApart(true);
      focus(id);
      speak({ src: byId[id].src, text: byId[id].text });
    }));

    let inspecting = false;
    const partAt = (e) => { const g = e.target.closest && e.target.closest("[data-part]"); return g ? g.getAttribute("data-part") : null; };
    const guard = (e) => {
      if (!inspecting) return;
      e.stopPropagation();
      if (e.type === "pointermove" || e.type === "pointerdown") { const id = partAt(e); if (id && id !== focused && byId[id]) focus(id); }
      if (e.type === "click") { const id = partAt(e); if (id && byId[id]) speak({ src: byId[id].src, text: byId[id].text }); }
    };
    ["pointermove", "pointerdown", "click"].forEach((t) => stage.addEventListener(t, guard, true));
    btnInspect.addEventListener("click", () => {
      inspecting = !inspecting;
      btnInspect.setAttribute("aria-pressed", String(inspecting));
      stage.toggleAttribute("data-inspecting", inspecting);
      if (!inspecting) focus(null);
      else { infoName.textContent = "Осмотр деталей"; infoText.textContent = "Наведите курсор или коснитесь детали, чтобы узнать, что это. Щелчок — озвучить."; info.hidden = false; }
    });

    // Used by the autopilot: the full tour, or just the introduction.
    panel.__tour = (cb, short) => {
      if (short) { infoName.textContent = data.title; infoText.textContent = data.intro; info.hidden = false; speak({ src: data.introSrc, text: data.intro, onend: () => { info.hidden = true; cb && cb(); } }); }
      else startTour(cb);
    };
  }

  function initChapterAudio(box) {
    if (box.__ready) return;
    box.__ready = true;
    const btn = $("button", box), bar = $("[data-ch-bar]", box), time = $("[data-ch-time]", box);
    const src = box.dataset.chAudio, text = box.dataset.chText || "";
    let handle = null, raf = 0;
    const fmt = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    const reset = () => { btn.textContent = "▶"; btn.setAttribute("aria-label", "Слушать аудиогид"); box.removeAttribute("data-playing"); cancelAnimationFrame(raf); bar.style.width = "0%"; handle = null; };
    const loopBar = () => {
      const a = handle && handle.audio && handle.audio();
      if (a && a.duration) { bar.style.width = (100 * a.currentTime / a.duration).toFixed(1) + "%"; time.textContent = fmt(a.currentTime) + " / " + fmt(a.duration); }
      raf = requestAnimationFrame(loopBar);
    };
    btn.addEventListener("click", () => {
      if (handle) { stopAll(); return; }
      handle = speak({ src, text, onend: reset, onstop: reset });
      btn.textContent = "■"; btn.setAttribute("aria-label", "Остановить"); box.setAttribute("data-playing", "");
      loopBar();
    });
  }

  function initPanels(scope) {
    $$("[data-guide-for]", scope).forEach(initFigurePanel);
    $$("[data-ch-audio]", scope).forEach(initChapterAudio);
    $$("[data-pilot-start]", scope).forEach((b) => { if (b.__ready) return; b.__ready = true; b.addEventListener("click", () => pilot.start()); });
  }
  initPanels(document);

  // ---------- readable text from page content ----------
  const TEX = [[/\\lambda/g, " лямбда "], [/\\Lambda/g, " лямбда "], [/\\Sigma|\\sigma/g, " сигма "], [/\\varphi|\\phi/g, " фи "], [/\\rho/g, " ро "], [/\\beta/g, " бета "], [/\\eta/g, " эта "], [/\\varepsilon|\\epsilon/g, " эпсилон "], [/\\mu/g, " мю "], [/\\tau/g, " тау "], [/\\nu/g, " ню "], [/\\xi/g, " кси "], [/\\Delta|\\delta/g, " дельта "], [/\\gamma|\\Gamma/g, " гамма "], [/\\alpha/g, " альфа "], [/\\theta/g, " тэта "], [/\\pi/g, " пи "], [/\\infty/g, " бесконечность "], [/\\approx/g, " примерно "], [/\\cdot|\\times/g, " на "], [/\^\{?2\}?/g, " в квадрате "], [/\^\{?3\}?/g, " в кубе "], [/\{,\}/g, ","], [/\\[a-zA-Z]+/g, " "], [/[{}_^\\]/g, " "]];
  const readTex = (tex) => TEX.reduce((s, [a, b]) => s.replace(a, b), tex).replace(/\s+/g, " ").trim();
  function readable(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll(".katex-display, .fig-wrap, script, style, .quiz-explain").forEach((n) => n.remove());
    c.querySelectorAll(".katex").forEach((k) => {
      const tex = (k.querySelector("annotation") || {}).textContent || "";
      k.replaceWith(document.createTextNode(tex.length && tex.length <= 16 ? " " + readTex(tex) + " " : " (см. формулу) "));
    });
    return c.textContent.replace(/\s+/g, " ").replace(/\\\(|\\\)|\\\[|\\\]/g, "").trim();
  }

  // ---------- autopilot ----------
  const dock = document.createElement("div");
  dock.className = "pilot";
  dock.innerHTML = `<div class="pilot-orb" aria-hidden="true"><span></span></div>
    <div class="pilot-body"><b data-pilot-title>Обучение с гидом</b><span data-pilot-text>Гид проведёт по курсу: прочитает главы, покажет модели и остановится перед тестами.</span></div>
    <div class="pilot-ctrl">
      <button type="button" data-pilot-play aria-label="Начать">▶</button>
      <button type="button" data-pilot-next aria-label="Дальше" title="Дальше">⏭</button>
      <button type="button" data-pilot-stop aria-label="Остановить" title="Остановить">■</button>
      <button type="button" data-pilot-mode title="Режим чтения"></button>
      <button type="button" data-pilot-rate title="Скорость речи"></button>
      <button type="button" data-pilot-min aria-label="Свернуть" title="Свернуть">–</button>
    </div>`;
  document.body.appendChild(dock);
  const pointer = document.createElement("div");
  pointer.className = "pilot-pointer";
  pointer.setAttribute("aria-hidden", "true");
  document.body.appendChild(pointer);
  const ui = { title: $("[data-pilot-title]", dock), text: $("[data-pilot-text]", dock), play: $("[data-pilot-play]", dock), next: $("[data-pilot-next]", dock), stop: $("[data-pilot-stop]", dock), mode: $("[data-pilot-mode]", dock), rate: $("[data-pilot-rate]", dock), min: $("[data-pilot-min]", dock) };
  const RATES = [0.85, 1, 1.15, 1.3, 1.5];
  const syncPrefs = () => {
    ui.mode.textContent = prefs.mode === "full" ? "Полностью" : "Главное";
    ui.rate.textContent = String(prefs.rate).replace(".", ",") + "×";
    store.set("pilot-prefs", prefs);
  };
  syncPrefs();

  const pilot = (() => {
    let steps = [], idx = 0, state = "idle", lit = null; // idle | playing | paused | waiting
    const setState = (s) => { state = s; dock.dataset.state = s; ui.play.textContent = s === "playing" ? "⏸" : "▶"; ui.play.setAttribute("aria-label", s === "playing" ? "Пауза" : "Продолжить"); };
    const highlight = (el) => {
      if (lit) lit.classList.remove("pilot-reading");
      lit = el;
      if (!el) { pointer.classList.remove("on"); return; }
      el.classList.add("pilot-reading");
      el.scrollIntoView({ behavior: still.matches ? "auto" : "smooth", block: el.offsetHeight > innerHeight * 0.7 ? "start" : "center" });
      const r = el.getBoundingClientRect();
      pointer.style.top = (r.top + scrollY + 6) + "px";
      pointer.style.left = Math.max(8, r.left + scrollX - 30) + "px";
      pointer.classList.add("on");
    };
    const say = (title, text) => { ui.title.textContent = title; ui.text.textContent = text.length > 160 ? text.slice(0, 157) + "…" : text; };

    // Build the walk for the current page.
    function plan() {
      const main = $(".main");
      const out = [];
      const chTitle = ($("h1", main) || {}).textContent || document.title;
      const audio = $("[data-ch-audio]", main);
      const head = $(".ch-head, .hero", main);
      if (audio) out.push({ el: head, title: chTitle, text: audio.dataset.chText, src: audio.dataset.chAudio || null });
      else if (head) { const lead = $(".lead", head); out.push({ el: head, title: chTitle, text: chTitle + ". " + (lead ? readable(lead) : "") }); }
      const prose = $(".prose", main) || main;
      let section = "", firstInSection = false;
      const full = prefs.mode === "full";
      const children = [...prose.children].filter((n) => !n.matches(".ch-head, .hero, script"));
      for (const n of children) {
        if (n.matches("h2")) { section = n.textContent; firstInSection = true; out.push({ el: n, title: section, text: "Раздел: " + section + "." }); continue; }
        if (n.matches(".fig-wrap")) { const panel = $("[data-guide-for]", n); if (panel) out.push({ el: n, title: "Модель", text: "Посмотрим на модель.", panel }); continue; }
        if (n.matches("h3")) { if (full) out.push({ el: n, title: section, text: n.textContent + "." }); continue; }
        if (n.matches(".table")) { if (full) out.push({ el: n, title: section, text: "Посмотрите на таблицу — в ней собраны основные числа этого раздела.", pause: 1500 }); continue; }
        if (n.matches(".block")) continue;
        const t = readable(n);
        if (!t || t.length < 3) continue;
        const important = n.matches(".def, .note, .example");
        if (full || important || (firstInSection && n.matches("p"))) out.push({ el: n, title: section || chTitle, text: t });
        if (n.matches("p")) firstInSection = false;
      }
      const keys = $(".keypoints", main);
      if (keys) out.push({ el: keys, title: "Главное в главе", text: "Главное в главе. " + $$("li", keys).map(readable).join(" ") });
      const quiz = $(".quiz", main);
      if (quiz) out.push({ el: quiz, title: "Тест по главе", text: "Теперь проверьте себя: ответьте на вопросы теста. Когда закончите, нажмите кнопку «Дальше», и мы перейдём к следующей главе.", wait: true });
      const next = $(".pager-next", main) || (main.querySelector(".hero") ? $(".course-card", main) : null);
      if (next) out.push({ el: next, title: "Дальше", text: "Переходим дальше.", go: next.getAttribute("href") });
      else out.push({ el: null, title: "Готово", text: "Мы прошли эту страницу до конца.", end: true });
      return out;
    }

    function run() {
      if (state !== "playing") return;
      const s = steps[idx];
      if (!s) { stop(); return; }
      highlight(s.el);
      say(s.title, s.text);
      const done = () => { if (state !== "playing") return; idx++; run(); };
      if (s.panel && s.panel.__tour) { s.panel.__tour(done, prefs.mode !== "full"); return; }
      if (s.go) { speak({ text: s.text, onend: () => go(s.go) }); return; }
      if (s.end) { speak({ text: s.text, onend: () => stop(true) }); return; }
      speak({ src: s.src, text: s.text, onend: () => {
        if (state !== "playing") return;
        if (s.wait) { setState("waiting"); say(s.title, "Ответьте на вопросы, затем нажмите ⏭ «Дальше»."); return; }
        if (s.pause) setTimeout(done, s.pause / prefs.rate); else done();
      } });
    }

    // Load the next page in place so speech keeps its permission; fall back to a normal visit.
    async function go(href) {
      try {
        const res = await fetch(href);
        if (!res.ok) throw new Error(res.status);
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        const nm = $(".main", doc), main = $(".main");
        if (!nm || !main) throw new Error("no main");
        main.innerHTML = nm.innerHTML;
        const nt = $(".toc", doc), ot = $(".toc") || main.nextElementSibling;
        if (nt && ot) { ot.className = "toc"; ot.innerHTML = nt.innerHTML; ot.setAttribute("aria-label", "На этой странице"); }
        else if (ot && ot.classList.contains("toc")) ot.innerHTML = "";
        document.title = doc.title;
        const file = href.split("/").pop();
        $$(".side-list a").forEach((a) => (a.getAttribute("href") === file ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
        try { history.pushState({}, "", href); } catch (e) {}
        window.scrollTo(0, 0);
        window.__initFigures && window.__initFigures(main);
        window.__initPage && window.__initPage(main);
        initPanels(main);
        steps = plan(); idx = 0;
        setTimeout(run, 500);
      } catch (e) {
        store.set("pilot-resume", { at: Date.now() });
        location.href = href;
      }
    }

    function start() {
      stopAll();
      steps = plan(); idx = 0;
      dock.classList.add("open"); dock.classList.remove("min");
      setState("playing");
      run();
    }
    function pause() { stopAll(); setState("paused"); say(ui.title.textContent, "Пауза. Нажмите ▶, чтобы продолжить с этого места."); }
    function resume() { if (!steps.length) return start(); setState("playing"); run(); }
    function next() { stopAll(); if (!steps.length) return start(); idx = Math.min(steps.length - 1, idx + 1); setState("playing"); run(); }
    function stop(finished) {
      stopAll(); setState("idle"); highlight(null); steps = []; idx = 0;
      say("Обучение с гидом", finished ? "Готово. Нажмите ▶, чтобы пройти страницу ещё раз." : "Гид остановлен. Нажмите ▶, чтобы начать с начала страницы.");
    }
    return { start, pause, resume, next, stop, get state() { return state; } };
  })();

  ui.play.addEventListener("click", () => {
    dock.classList.add("open");
    if (pilot.state === "playing") pilot.pause();
    else if (pilot.state === "paused") pilot.resume();
    else if (pilot.state === "waiting") pilot.next();
    else pilot.start();
  });
  ui.next.addEventListener("click", () => pilot.next());
  ui.stop.addEventListener("click", () => pilot.stop());
  ui.mode.addEventListener("click", () => { prefs.mode = prefs.mode === "full" ? "main" : "full"; syncPrefs(); });
  ui.rate.addEventListener("click", () => { prefs.rate = RATES[(RATES.indexOf(prefs.rate) + 1) % RATES.length]; syncPrefs(); });
  ui.min.addEventListener("click", () => dock.classList.toggle("min"));
  // After a full page visit (no in-place loading, e.g. opened from disk), offer to continue.
  const resume = store.get("pilot-resume", null);
  if (resume && Date.now() - resume.at < 120000) {
    store.set("pilot-resume", null);
    dock.classList.add("open");
    ui.title.textContent = "Продолжим?";
    ui.text.textContent = "Нажмите ▶, чтобы гид продолжил с этой страницы.";
  }
  window.__pilot = pilot;
})();
