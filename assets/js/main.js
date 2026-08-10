/* =========================================================================
   WhiteMoon · Reformas, Electricidad y Fontanería — interacciones
   Sin librerías. Respeta prefers-reduced-motion. Sin overflow horizontal.
   ========================================================================= */
(() => {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* ---------- Año del footer ---------- */
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Header scroll ----------
     Con un centinela de 1px en vez de un listener de scroll: leer
     window.scrollY en cada evento forzaba reflow (~130 ms en móvil). */
  const header = $(".header");
  if (header) {
    if ("IntersectionObserver" in window) {
      const sentinel = document.createElement("div");
      sentinel.setAttribute("aria-hidden", "true");
      sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:9px;pointer-events:none";
      document.body.prepend(sentinel);
      new IntersectionObserver(
        (e) => header.classList.toggle("scrolled", !e[0].isIntersecting),
        { threshold: 0 }
      ).observe(sentinel);
    } else {
      window.addEventListener("scroll", () => {
        header.classList.toggle("scrolled", window.scrollY > 8);
      }, { passive: true });
    }
  }

  /* ---------- Menú móvil ---------- */
  const burger = $(".burger");
  const mnav = $(".mobile-nav");
  const setMenu = (open) => {
    if (!mnav) return;
    mnav.classList.toggle("open", open);
    if (burger) burger.setAttribute("aria-expanded", open ? "true" : "false");
  };
  burger && burger.addEventListener("click", () => setMenu(!mnav.classList.contains("open")));
  $(".mobile-nav__close") && $(".mobile-nav__close").addEventListener("click", () => setMenu(false));
  $$(".mobile-nav a, .mobile-nav .btn").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  /* ---------- Palabra rotativa del hero ---------- */
  const rotEl = $(".rotator__word");
  if (rotEl) {
    const words = [
      "reformas",
      "electricidad",
      "fontanería",
      "baños",
      "cocinas",
    ];
    let i = 0, ch = 0, deleting = false;
    rotEl.textContent = "";
    const tick = () => {
      const w = words[i];
      if (!deleting) {
        rotEl.textContent = w.slice(0, ++ch);
        if (ch === w.length) { deleting = true; return setTimeout(tick, 1600); }
      } else {
        rotEl.textContent = w.slice(0, --ch);
        if (ch === 0) { deleting = false; i = (i + 1) % words.length; }
      }
      setTimeout(tick, deleting ? 40 : 78);
    };
    if (reduced) { rotEl.textContent = words[0]; } else { setTimeout(tick, 600); }
  }

  /* ---------- Scroll reveal con stagger ---------- */
  const reveals = $$(".reveal");
  if (reveals.length && "IntersectionObserver" in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          const d = e.target.dataset.delay || 0;
          e.target.style.transitionDelay = d + "ms";
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  /* ---------- Cursor personalizado (desktop puntero fino) ---------- */
  const finePointer = window.matchMedia("(pointer: fine)").matches;
  if (finePointer && !reduced && window.innerWidth > 900) {
    const dot = document.createElement("div"); dot.className = "cursor-dot";
    const ring = document.createElement("div"); ring.className = "cursor-ring";
    document.body.append(dot, ring);
    let rx = 0, ry = 0, dx = 0, dy = 0;
    window.addEventListener("mousemove", (e) => {
      dx = e.clientX; dy = e.clientY;
      dot.style.left = dx + "px"; dot.style.top = dy + "px";
    });
    const loop = () => {
      rx += (dx - rx) * 0.18; ry += (dy - ry) * 0.18;
      ring.style.left = rx + "px"; ring.style.top = ry + "px";
      requestAnimationFrame(loop);
    };
    loop();
    document.addEventListener("mouseover", (e) => {
      if (e.target.closest("a,button,summary,.svc,.zone__chip")) ring.classList.add("hover");
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest("a,button,summary,.svc,.zone__chip")) ring.classList.remove("hover");
    });
  }

  /* ---------- Hero: red eléctrica animada de fondo (canvas) ---------- */
  const canvas = $("#circuit");
  if (canvas && !reduced && window.matchMedia("(min-width:768px)").matches) {
    const ctx = canvas.getContext("2d");
    let W, H, dpr, nodes = [], pulses = [], visible = true;
    const VOLT = "#7c4dff";

    const build = () => {
      const host = canvas.parentElement;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = host.clientWidth; H = host.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      /* rejilla de nodos con jitter (estilo cuadro eléctrico) */
      nodes = [];
      const gap = Math.max(64, Math.min(W, 1200) / 12);
      const cols = Math.ceil(W / gap) + 1;
      const rows = Math.ceil(H / gap) + 1;
      const seed = (x) => { const s = Math.sin(x * 999.7) * 43758.5; return s - Math.floor(s); };
      let id = 0;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          id++;
          nodes.push({
            x: c * gap + (seed(id) - 0.5) * gap * 0.5,
            y: r * gap + (seed(id * 2.1) - 0.5) * gap * 0.5,
            on: seed(id * 3.3) > 0.72,
          });
        }
      pulses = [];
    };

    /* conexiones ortogonales (traza de circuito) entre nodos cercanos */
    const neighbors = (n) => nodes
      .filter((m) => m !== n && Math.abs(m.x - n.x) < 150 && Math.abs(m.y - n.y) < 150)
      .sort((a, b) => (Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y)))
      .slice(0, 2);

    const spawnPulse = () => {
      const from = nodes[Math.floor(Math.random() * nodes.length)];
      if (!from) return;
      const nb = neighbors(from);
      if (!nb.length) return;
      const to = nb[Math.floor(Math.random() * nb.length)];
      pulses.push({ from, to, t: 0, speed: 0.010 + Math.random() * 0.014 });
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(159,179,200,.08)";
      nodes.forEach((n) => {
        neighbors(n).forEach((m) => {
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(m.x, n.y);
          ctx.lineTo(m.x, m.y);
          ctx.stroke();
        });
      });
      nodes.forEach((n) => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.on ? 2.1 : 1.2, 0, Math.PI * 2);
        ctx.fillStyle = n.on ? "rgba(124,77,255,.45)" : "rgba(159,179,200,.25)";
        ctx.fill();
      });
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i]; p.t += p.speed;
        if (p.t >= 1) { pulses.splice(i, 1); continue; }
        const midx = p.to.x, midy = p.from.y;
        let x, y;
        if (p.t < 0.5) { const k = p.t / 0.5; x = p.from.x + (midx - p.from.x) * k; y = midy; }
        else { const k = (p.t - 0.5) / 0.5; x = midx; y = midy + (p.to.y - midy) * k; }
        const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, "rgba(124,77,255,.9)");
        g.addColorStop(1, "rgba(124,77,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = VOLT;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      }
      if (pulses.length < 14 && Math.random() > 0.72) spawnPulse();
    };

    const loop = () => { if (visible) draw(); requestAnimationFrame(loop); };
    build();
    for (let i = 0; i < 6; i++) spawnPulse();
    loop();

    let rt;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(build, 200); });
    const hero = canvas.closest(".hero");
    if (hero && "IntersectionObserver" in window) {
      new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener("visibilitychange", () => { visible = !document.hidden; });
  }

  /* ---------- Guardia anti-overflow (dev) ----------
     En idle: mide el layout fuera del camino crítico. */
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 800));
  window.addEventListener("load", () => idle(() => {
    const el = document.documentElement;
    if (el.scrollWidth > el.clientWidth) {
      console.warn("[layout] overflow horizontal:", el.scrollWidth, ">", el.clientWidth);
    }
  }));
})();
