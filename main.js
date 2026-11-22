(() => {
  "use strict";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n, d = 1) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ================= Supersonic flow simulation ================= */
  const GAMMA = 1.4;
  function shockAngle(M, thetaDeg) {
    // Weak oblique-shock solution of the θ-β-M relation. Returns radians, or null if detached.
    const th = thetaDeg * Math.PI / 180;
    const mu = Math.asin(1 / M);
    for (let b = mu + 1e-4; b < Math.PI / 2; b += 0.0005) {
      const t = 2 / Math.tan(b) * (M * M * Math.sin(b) ** 2 - 1) / (M * M * (GAMMA + Math.cos(2 * b)) + 2);
      if (Math.atan(t) >= th) return b;
    }
    return null;
  }

  class Flow {
    constructor(canvas, opts) {
      this.c = canvas;
      this.ctx = canvas.getContext("2d");
      this.o = Object.assign({ M: 2, deg: 12, noseX: 0.4, cy: 0.5, density: 3200, max: 700 }, opts);
      this.M = this.o.M; this.targetM = this.o.M; this.deg = this.o.deg;
      this.running = false;
      this.resize();
      this.solve();
      new ResizeObserver(() => { this.resize(); if (!this.running) this.still(); }).observe(canvas);
      new IntersectionObserver(([e]) => { e.isIntersecting ? this.start() : this.stop(); }, { threshold: 0 }).observe(canvas);
    }
    resize() {
      const r = this.c.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.c.width = this.w * dpr; this.c.height = this.h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(this.o.max, Math.round(this.w * this.h / this.o.density));
      this.p = Array.from({ length: n }, () => this.spawn(Math.random() * this.w));
      this.ctx.fillStyle = "#1C0C15"; this.ctx.fillRect(0, 0, this.w, this.h);
    }
    spawn(x) {
      return { x, y: Math.random() * this.h, px: x, py: 0, a: 0, hit: false, v: 0.75 + Math.random() * 0.5 };
    }
    set(M, deg) { if (M != null) this.targetM = M; if (deg != null) this.deg = deg; this.solve(); if (!this.running) this.still(); }
    solve() { this.beta = shockAngle(this.M, this.deg); }
    geom() { return { nx: this.w * this.o.noseX, cy: this.h * this.o.cy, td: Math.tan(this.deg * Math.PI / 180) }; }
    step(dt) {
      if (Math.abs(this.targetM - this.M) > 0.002) { this.M += (this.targetM - this.M) * Math.min(1, dt * 0.08); this.solve(); }
      const { nx, cy, td } = this.geom();
      const base = this.w * 0.0035 * (0.55 + this.M * 0.28) * dt;
      const tb = this.beta ? Math.tan(this.beta) : 0;
      const so = this.h * (0.03 + this.deg * 0.0012), R = this.h * 0.18;
      const del = this.deg * Math.PI / 180;
      for (const q of this.p) {
        q.px = q.x; q.py = q.y;
        const dy = q.y - cy, d = Math.abs(dy), s = dy < 0 ? -1 : 1;
        if (!q.hit) {
          const crossed = this.beta ? (q.x > nx && d < (q.x - nx) * tb) : (q.x > nx - so + (d * d) / (2 * R));
          if (crossed) { q.hit = true; q.v *= 0.82; }
        }
        if (q.hit) {
          if (this.beta || q.x > nx) q.a = s * del;
          else q.a = s * (del + (Math.PI / 2.4 - del) * Math.exp(-d / (this.h * 0.07)));
        }
        const sp = base * q.v;
        q.x += Math.cos(q.a) * sp; q.y += Math.sin(q.a) * sp;
        if (q.x > nx) { const surf = (q.x - nx) * td; if (Math.abs(q.y - cy) < surf) q.y = cy + s * surf; }
        if (q.x > this.w + 10 || q.y < -10 || q.y > this.h + 10) { Object.assign(q, this.spawn(-Math.random() * 40)); q.px = q.x; q.py = q.y; }
      }
    }
    draw() {
      const ctx = this.ctx, { nx, cy, td } = this.geom();
      ctx.fillStyle = "rgba(28,12,21,0.2)"; ctx.fillRect(0, 0, this.w, this.h);
      ctx.lineWidth = 1.2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.strokeStyle = "rgba(250,222,232,0.5)";
      for (const q of this.p) if (!q.hit) { ctx.moveTo(q.px, q.py); ctx.lineTo(q.x, q.y); }
      ctx.stroke();
      ctx.beginPath(); ctx.strokeStyle = "rgba(245,168,192,0.85)";
      for (const q of this.p) if (q.hit) { ctx.moveTo(q.px, q.py); ctx.lineTo(q.x, q.y); }
      ctx.stroke();
      // shock wave (schlieren glow)
      ctx.save();
      ctx.shadowColor = "rgba(245,140,175,0.95)"; ctx.shadowBlur = 14;
      ctx.strokeStyle = "rgba(255,225,236,0.6)"; ctx.lineWidth = 1.6; ctx.beginPath();
      if (this.beta) {
        const L = this.w - nx, tb = Math.tan(this.beta);
        ctx.moveTo(nx + L, cy - L * tb); ctx.lineTo(nx, cy); ctx.lineTo(nx + L, cy + L * tb);
      } else {
        const so = this.h * (0.03 + this.deg * 0.0012), R = this.h * 0.18;
        for (let d = -this.h; d <= this.h; d += 4) { const x = nx - so + (d * d) / (2 * R); d === -this.h ? ctx.moveTo(x, cy + d) : ctx.lineTo(x, cy + d); }
      }
      ctx.stroke(); ctx.restore();
      // cone body
      const L = this.w - nx + 20;
      ctx.beginPath(); ctx.moveTo(nx, cy); ctx.lineTo(nx + L, cy - L * td); ctx.lineTo(nx + L, cy + L * td); ctx.closePath();
      const g = ctx.createLinearGradient(0, cy - L * td, 0, cy + L * td);
      g.addColorStop(0, "#5A2E45"); g.addColorStop(0.5, "#38192A"); g.addColorStop(1, "#200E18");
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = "rgba(250,222,232,0.75)"; ctx.lineWidth = 1; ctx.stroke();
    }
    frame = (t) => {
      if (!this.running) return;
      const dt = Math.min(3, (t - (this.last || t)) / 16.67 || 1);
      this.last = t; this.step(dt); this.draw();
      requestAnimationFrame(this.frame);
    };
    start() { if (reduce) { this.still(); return; } if (this.running) return; this.running = true; this.last = 0; requestAnimationFrame(this.frame); }
    stop() { this.running = false; }
    still() { this.M = this.targetM; this.solve(); for (let i = 0; i < 260; i++) { this.step(1); if (i > 200) this.draw(); } }
  }

  /* ---- hero ---- */
  const heroCanvas = document.getElementById("heroFlow");
  const narrow = () => window.innerWidth < 700;
  const hero = new Flow(heroCanvas, { M: 2, deg: 11, noseX: narrow() ? 0.28 : 0.46, cy: narrow() ? 0.27 : 0.42, density: narrow() ? 1800 : 2600 });
  const heroMach = document.getElementById("heroMach");
  let heroTouched = false;
  document.getElementById("hero").addEventListener("pointermove", (e) => {
    const M = 1.3 + (e.clientX / window.innerWidth) * 2.4;
    hero.set(M); heroMach.textContent = fmt(M);
    if (!heroTouched) { heroTouched = true; document.getElementById("heroHint").textContent = "Mais para a direita, mais rápido. A onda de choque fecha."; }
  });
  document.getElementById("hero").addEventListener("touchmove", (e) => {
    const x = e.touches[0].clientX, M = 1.3 + (x / window.innerWidth) * 2.4;
    hero.set(M); heroMach.textContent = fmt(M);
  }, { passive: true });
  if (window.matchMedia("(hover: none)").matches) document.getElementById("heroHint").textContent = "Arraste o dedo pela tela para mudar a velocidade";

  /* ---- lab ---- */
  const lab = new Flow(document.getElementById("labFlow"), { M: 2, deg: 12, noseX: 0.32, cy: 0.54, density: 1500, max: 600 });
  const machR = document.getElementById("machRange"), angR = document.getElementById("angleRange");
  const out = (id) => document.getElementById(id);
  function syncLab() {
    const M = parseFloat(machR.value), deg = parseFloat(angR.value);
    lab.targetM = M; lab.M = M; lab.set(M, deg);
    out("machOut").textContent = fmt(M);
    out("angleOut").textContent = deg + "°";
    out("kmhOut").textContent = Math.round(M * 1235).toLocaleString("pt-BR") + " km/h";
    const b = shockAngle(M, deg);
    out("betaOut").textContent = b ? fmt(b * 180 / Math.PI) + "°" : "destacado";
    out("labState").textContent = b ? "CHOQUE OBLÍQUO PRESO AO NARIZ" : "CHOQUE DESTACADO (ARCO)";
    for (const r of [machR, angR]) r.style.setProperty("--fill", ((r.value - r.min) / (r.max - r.min) * 100) + "%");
  }
  machR.addEventListener("input", syncLab); angR.addEventListener("input", syncLab);
  syncLab();

  /* ================= Quiz ================= */
  const Q = [
    { q: "Em que ano Mary Jackson se tornou a primeira engenheira negra da NASA?", o: ["1951", "1958", "1969", "1979"], a: 1, why: "Em 1958, depois de concluir os cursos na escola que antes era só para brancos." },
    { q: "Por que ela precisou pedir permissão à cidade de Hampton?", o: ["Para ganhar um aumento", "Para viajar a Washington", "Para assistir aulas numa escola só para brancos", "Para entrar no túnel de vento"], a: 2, why: "As aulas de engenharia aconteciam na Hampton High School, segregada para brancos." },
    { q: "O que Mary estudava no túnel de vento?", o: ["Como o ar se comporta em velocidades supersônicas", "A previsão do tempo", "A órbita da Lua", "Motores de carro"], a: 0, why: "Ela estudava o fluxo de ar em volta de modelos acima da velocidade do som." },
    { q: "Que homenagem a NASA fez a ela em 2021?", o: ["Deu seu nome a um foguete", "Deu seu nome à sede da NASA em Washington", "Lançou um satélite com sua foto", "Criou um feriado"], a: 1, why: "O prédio passou a se chamar Mary W. Jackson NASA Headquarters." }
  ];
  let qi = 0, score = 0;
  const qText = out("qText"), qOpts = out("qOptions"), qFb = out("qFeedback"), qNext = out("qNext"), qCount = out("qCount");
  function renderQ() {
    const item = Q[qi];
    qCount.textContent = `Pergunta ${qi + 1} de ${Q.length}`;
    qText.textContent = item.q; qFb.textContent = ""; qNext.hidden = true; qOpts.innerHTML = "";
    item.o.forEach((txt, i) => {
      const b = document.createElement("button"); b.type = "button"; b.id = `q${qi}o${i}`;
      b.innerHTML = `<span>${"ABCD"[i]}</span>${txt}`;
      b.addEventListener("click", () => answer(i));
      qOpts.appendChild(b);
    });
  }
  function answer(i) {
    const item = Q[qi], btns = qOpts.querySelectorAll("button");
    btns.forEach((b, j) => { b.disabled = true; if (j === item.a) b.classList.add("right"); else if (j === i) b.classList.add("wrong"); });
    if (i === item.a) score++;
    qFb.textContent = (i === item.a ? "Certo! " : "Não foi dessa vez. ") + item.why;
    qNext.textContent = qi < Q.length - 1 ? "Próxima pergunta" : "Ver resultado";
    qNext.hidden = false; qNext.focus({ preventScroll: true });
  }
  qNext.addEventListener("click", () => {
    if (qi < Q.length - 1) { qi++; renderQ(); return; }
    qCount.textContent = "Resultado";
    qText.innerHTML = `<p class="q-score">${score}/${Q.length}</p>${score === Q.length ? "Perfeito. Mary ficaria orgulhosa." : score >= 2 ? "Muito bem! Você prestou atenção." : "Role de novo pela história e tente outra vez."}`;
    qOpts.innerHTML = ""; qFb.textContent = "";
    qNext.textContent = "Refazer o quiz"; qi = 0; score = 0;
    qNext.onclick = () => { qNext.onclick = null; renderQ(); };
  });
  renderQ();

  /* ================= Scroll choreography ================= */
  if (!window.gsap || !window.ScrollTrigger) { document.querySelector(".timeline").classList.add("no-pin"); return; }
  gsap.registerPlugin(ScrollTrigger);

  // Chapter label + progress always on
  const label = out("chapterLabel");
  document.querySelectorAll("[data-chapter]").forEach((sec) => {
    ScrollTrigger.create({ trigger: sec, start: "top 50%", end: "bottom 50%", onToggle: (s) => { if (s.isActive) label.textContent = sec.dataset.chapter; } });
  });
  gsap.to("#progressBar", { scaleX: 1, ease: "none", scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.3 } });

  if (reduce) { document.querySelector(".timeline").classList.add("no-pin"); return; }

  // Smooth scroll (Lenis)
  if (window.Lenis) {
    const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
      const id = a.getAttribute("href"); const el = document.querySelector(id);
      if (el) { e.preventDefault(); lenis.scrollTo(id === "#topo" ? 0 : el); }
    }));
  }

  // Hero intro
  gsap.from(".hero-title .line span", { yPercent: 105, duration: 1.3, ease: "expo.out", stagger: 0.12, delay: 0.15 });
  gsap.from([".eyebrow", ".hero-sub", ".hero-readout"], { y: 24, opacity: 0, duration: 1, ease: "power3.out", stagger: 0.1, delay: 0.55 });
  gsap.to(".hero-inner", { yPercent: -18, opacity: 0.2, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });

  // Word-by-word statement
  const rw = document.querySelector(".reveal-words");
  const keys = new Set(["1958,", "negra", "engenheira", "NASA.", "porta"]);
  rw.innerHTML = rw.textContent.trim().split(/\s+/).map((w) => `<span class="w${keys.has(w) ? " key" : ""}">${w}</span>`).join(" ");
  gsap.fromTo(".reveal-words .w", { opacity: 0.12 }, { opacity: 1, stagger: 0.1, ease: "none", scrollTrigger: { trigger: ".statement", start: "top 70%", end: "bottom 60%", scrub: true } });

  // Generic fade-ups
  gsap.utils.toArray(".fade-up").forEach((el) => {
    gsap.from(el, { y: 40, opacity: 0, duration: 1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 88%", once: true } });
  });

  // Photo reveals
  gsap.utils.toArray(".photo-reveal, .lg").forEach((fig) => {
    const clip = fig.querySelector(".clip"), img = fig.querySelector("img");
    gsap.fromTo(clip, { clipPath: "inset(100% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 1.4, ease: "expo.out", scrollTrigger: { trigger: fig, start: "top 85%", once: true } });
    gsap.fromTo(img, { scale: 1.25 }, { scale: 1, ease: "none", scrollTrigger: { trigger: fig, start: "top bottom", end: "bottom top", scrub: true } });
  });

  // Segregation: pinned, line splits screen, steps cross-fade
  document.documentElement.classList.add("js-ready");
  const steps = gsap.utils.toArray(".seg-step");
  const segTl = gsap.timeline({ scrollTrigger: { trigger: ".segregation", start: "top top", end: "+=" + steps.length * 90 + "%", pin: ".seg-pin", scrub: 0.6 } });
  segTl.fromTo(".seg-sign span", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0)
       .fromTo(".seg-sign .sign-a", { xPercent: 8 }, { xPercent: -6, duration: steps.length }, 0)
       .fromTo(".seg-sign .sign-b", { xPercent: -8 }, { xPercent: 6, duration: steps.length }, 0);
  steps.forEach((s, i) => {
    if (i > 0) segTl.fromTo(s, { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.5 }, i);
    if (i < steps.length - 1) segTl.to(s, { opacity: 0, y: -60, duration: 0.5 }, i + 0.6);
  });
  segTl.to({}, { duration: 0.4 });

  // Tunnel: pinned clip-path zoom
  const tunTl = gsap.timeline({ scrollTrigger: { trigger: ".tunnel", start: "top top", end: "+=160%", pin: ".tunnel-pin", scrub: 0.6 } });
  tunTl.fromTo(".tunnel-frame", { clipPath: narrow() ? "inset(22% 8% 30% 8% round 6px)" : "inset(18% 22% 18% 22% round 6px)" }, { clipPath: "inset(0% 0% 0% 0% round 0px)", ease: "power2.inOut", duration: 1 })
       .fromTo(".tunnel-frame img", { scale: 1.3, filter: "grayscale(1) contrast(1.1) brightness(.55)" }, { scale: 1, filter: "grayscale(1) contrast(1.1) brightness(.8)", duration: 1, ease: "power2.inOut" }, 0)
       .from(".tunnel-text", { y: 60, opacity: 0, duration: 0.4 }, 0.6)
       .from(".tunnel-cap", { opacity: 0, duration: 0.3 }, 0.7)
       .to({}, { duration: 0.3 });

  // Stamp
  gsap.from(".stamp", { scale: 2.4, opacity: 0, rotate: -30, duration: 0.6, ease: "back.out(2)", scrollTrigger: { trigger: ".petition-grid", start: "top 70%", once: true } });

  // Counters
  gsap.utils.toArray(".num b").forEach((b) => {
    const end = +b.dataset.count, pre = b.dataset.prefix || "", suf = b.dataset.suffix || "", o = { v: 0 };
    gsap.to(o, { v: end, duration: 1.8, ease: "power2.out", scrollTrigger: { trigger: b, start: "top 85%", once: true }, onUpdate: () => { b.textContent = pre + Math.round(o.v) + suf; } });
  });
  gsap.from(".num", { y: 50, opacity: 0, stagger: 0.12, duration: 1, ease: "power3.out", scrollTrigger: { trigger: ".num-grid", start: "top 85%", once: true } });

  // Horizontal timeline
  const track = out("tlTrack");
  const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
  gsap.to(track, { x: () => -dist(), ease: "none", scrollTrigger: { trigger: ".timeline", start: "top top", end: () => "+=" + dist(), pin: ".tl-pin", scrub: 0.6, invalidateOnRefresh: true } });

  // Awareness cards stagger handled by fade-up; legacy heading parallax
  gsap.utils.toArray(".lg img").forEach((img) => gsap.to(img, { yPercent: -6, ease: "none", scrollTrigger: { trigger: img, start: "top bottom", end: "bottom top", scrub: true } }));

  window.addEventListener("load", () => ScrollTrigger.refresh());
})();
