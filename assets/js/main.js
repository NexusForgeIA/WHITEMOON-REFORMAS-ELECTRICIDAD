/* =========================================================================
   WhiteMoon · Reformas, Electricidad y Fontanería — interacciones
   Sin librerías. Respeta prefers-reduced-motion. Sin overflow horizontal.
   El chat de Dani vive aparte, en dani.js.
   ========================================================================= */
(() => {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

  /* ---------- Año del footer ---------- */
  const year = $("#year");
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- Nav: estado "scrolled" ----------
     Con un centinela de 1px en vez de un listener de scroll: leer
     window.scrollY en cada evento forzaba reflow (~130 ms en móvil). */
  const nav = $("#nav");
  if (nav) {
    if ("IntersectionObserver" in window) {
      const sentinel = document.createElement("div");
      sentinel.setAttribute("aria-hidden", "true");
      sentinel.style.cssText = "position:absolute;top:0;left:0;width:1px;height:20px;pointer-events:none";
      document.body.prepend(sentinel);
      new IntersectionObserver(
        (e) => nav.classList.toggle("scrolled", !e[0].isIntersecting),
        { threshold: 0 }
      ).observe(sentinel);
    } else {
      window.addEventListener("scroll", () => {
        nav.classList.toggle("scrolled", window.scrollY > 20);
      }, { passive: true });
    }
  }

  /* ---------- Menú móvil ---------- */
  const burger = $("#burger");
  const menu = $("#mobileNav");
  if (burger && menu) {
    const setMenu = (open) => {
      menu.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
      burger.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      document.body.style.overflow = open ? "hidden" : "";
    };
    burger.addEventListener("click", () => setMenu(!menu.classList.contains("open")));
    $$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && menu.classList.contains("open")) setMenu(false);
    });
  }

  /* ---------- Scroll-spy del nav ----------
     Con IntersectionObserver y una banda estrecha en mitad del viewport,
     no con un listener de scroll: leer scrollY/offsetTop en cada evento
     fuerza reflow. */
  const navLinks = $$(".nav-links a[href^='#']");
  if (navLinks.length && "IntersectionObserver" in window) {
    const targets = navLinks
      .map((a) => ({ a, sec: document.querySelector(a.getAttribute("href")) }))
      .filter((t) => t.sec);
    const visibles = new Set();
    const paint = () => {
      let activa = null;
      targets.forEach((t) => {
        if (!visibles.has(t.sec)) return;
        /* si hay varias en la banda, gana la que esté más abajo del documento */
        if (!activa || (t.sec.compareDocumentPosition(activa.sec) & Node.DOCUMENT_POSITION_PRECEDING)) {
          activa = t;
        }
      });
      targets.forEach((t) => t.a.classList.toggle("active", t === activa));
    };
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) visibles.add(e.target); else visibles.delete(e.target);
      });
      paint();
    }, { rootMargin: "-45% 0px -50% 0px" });
    targets.forEach((t) => spy.observe(t.sec));
  }

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

  /* ---------- Reveal al hacer scroll ---------- */
  const reveals = $$(".reveal");
  if (reveals.length && "IntersectionObserver" in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e, n) => {
        if (!e.isIntersecting) return;
        e.target.style.transitionDelay = Math.min(n * 60, 180) + "ms";
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach((el) => io.observe(el));

    /* Al entrar por un enlace profundo (#precios, #faq…) o al restaurar el
       scroll, lo que queda por encima nunca llega a intersecar y se
       quedaría invisible. Se revela de golpe lo que ya está en pantalla o
       por encima. Primero se lee todo y después se escribe, para no forzar
       un reflow por elemento. */
    const revealPasados = () => {
      const limite = window.innerHeight * 0.94;
      const pendientes = reveals.filter((el) => !el.classList.contains("in"));
      const tops = pendientes.map((el) => el.getBoundingClientRect().top);
      pendientes.forEach((el, k) => {
        if (tops[k] < limite) {
          el.style.transitionDelay = "0ms";
          el.classList.add("in");
          io.unobserve(el);
        }
      });
    };
    requestAnimationFrame(revealPasados);
    window.addEventListener("load", () => requestAnimationFrame(revealPasados));
    window.addEventListener("hashchange", () => setTimeout(revealPasados, 420));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  /* ---------- Guardia anti-overflow horizontal ----------
     Solo en local: leer scrollWidth/clientWidth fuerza un layout síncrono y
     esto es una ayuda de desarrollo, no algo que deba pagar el visitante. */
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) {
    window.addEventListener("load", () => {
      const check = () => {
        const de = document.documentElement;
        if (de.scrollWidth > de.clientWidth) {
          console.warn("[layout] overflow horizontal:", de.scrollWidth, ">", de.clientWidth);
        }
      };
      if (window.requestIdleCallback) requestIdleCallback(check);
      else setTimeout(check, 300);
    });
  }
})();
