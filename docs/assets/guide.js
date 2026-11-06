// Voice guide and part inspector for every figure, plus the chapter audio player.
// Each figure has a [data-guide-for] panel with its parts as JSON. Parts in the SVG carry
// data-part ids; "taking apart" lifts each part along world z with the CSS `translate`
// property, which composes with the transforms the figure's own live code writes.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  // One voice at a time across the page.
  let current = null; // { stop() }
  const stopAll = () => { if (current) { const c = current; current = null; c.stop(); } };

  const ruVoice = () => {
    try { return speechSynthesis.getVoices().find((v) => /^ru/i.test(v.lang)) || null; } catch (e) { return null; }
  };
  // Plays an mp3; if it is missing or fails, falls back to the browser's speech synthesis,
  // and if that is unavailable too, waits as long as the text would take to read.
  function speak({ src, text, onend, onstop }) {
    stopAll();
    let done = false, audio = null, timer = 0, utter = null;
    const finish = () => { if (done) return; done = true; clearTimeout(timer); if (current === handle) current = null; onend && onend(); };
    const handle = {
      stop() { const was = done; done = true; clearTimeout(timer); if (!was && onstop) onstop(); if (audio) { audio.pause(); audio.src = ""; } try { if (utter) speechSynthesis.cancel(); } catch (e) {} },
      audio: () => audio,
    };
    current = handle;
    const fallback = () => {
      if (done) return;
      try {
        if ("speechSynthesis" in window) {
          utter = new SpeechSynthesisUtterance(text);
          utter.lang = "ru-RU";
          const v = ruVoice(); if (v) utter.voice = v;
          utter.rate = 1.02;
          utter.onend = finish; utter.onerror = finish;
          speechSynthesis.speak(utter);
          return;
        }
      } catch (e) {}
      timer = setTimeout(finish, Math.max(2500, text.length * 65));
    };
    if (src) {
      audio = new Audio(src);
      audio.preload = "auto";
      audio.addEventListener("ended", finish);
      audio.addEventListener("error", () => { audio = null; fallback(); });
      audio.play().catch(() => { audio = null; fallback(); });
    } else fallback();
    return handle;
  }

  // ---------- figures ----------
  $$("[data-guide-for]").forEach((panel) => {
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
    const [ux, uy] = data.up; // screen vector of one world unit up

    // Explode animation.
    let apart = 0, target = 0, raf = 0, last = 0;
    const apply = () => {
      for (const p of data.parts) {
        const dz = p.lift * apart;
        const t = dz ? `${(ux * dz).toFixed(2)}px ${(uy * dz).toFixed(2)}px` : "";
        for (const g of groups(p.id)) g.style.translate = t;
      }
      // Make room above: shrink the drawing toward its base while it is apart.
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

    // Focus: highlight one part (and its ancestors), dim the rest.
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

    // Tour: intro, then every part in turn, taken apart, with its narration.
    let touring = false, step = -1;
    const endTour = () => {
      touring = false; step = -1;
      btnTour.textContent = "▶ Экскурсия с гидом";
      btnTour.setAttribute("aria-pressed", "false");
      panel.removeAttribute("data-speaking");
    };
    const play = (i) => {
      step = i;
      if (i >= data.parts.length) { endTour(); focus(null); setApart(false); return; }
      if (i < 0) {
        focus(null);
        infoName.textContent = data.title; infoText.textContent = data.intro; info.hidden = false;
        speak({ src: data.introSrc, text: data.intro, onend: () => touring && play(0), onstop: endTour });
      } else {
        const p = data.parts[i];
        if (!apart) setApart(true);
        focus(p.id);
        speak({ src: p.src, text: p.text, onend: () => touring && play(i + 1), onstop: endTour });
      }
    };
    btnTour.addEventListener("click", () => {
      if (touring) { stopAll(); focus(null); return; }
      touring = true;
      btnTour.textContent = "■ Остановить";
      btnTour.setAttribute("aria-pressed", "true");
      panel.setAttribute("data-speaking", "");
      play(-1);
    });
    btnApart.addEventListener("click", () => setApart(target === 0));

    // Part chips: take apart, focus and narrate one part.
    chips.forEach((c) => c.addEventListener("click", () => {
      const id = c.dataset.guidePart;
      if (touring) endTour();
      if (!apart) setApart(true);
      focus(id);
      const p = byId[id];
      speak({ src: p.src, text: p.text });
    }));

    // Inspect mode: hovering a part names it; the figure's own steering pauses meanwhile.
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
  });

  // ---------- chapter audio ----------
  $$("[data-ch-audio]").forEach((box) => {
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
  });
})();
