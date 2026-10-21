/* =========================================================================
   Dani — Asistente de WhiteMoon Reformas (demo, empresa ficticia)
   Flujo: categoría -> día (agenda mensual) -> hora -> nombre -> teléfono.
   Lead -> Supabase leads_web (sector=reformas-electricidad-fontaneria, origen=demo-reformas-electricidad)
        -> Edge Function reformas-notify (aviso al equipo).
   El circuito de captación NO cambia: mismos endpoints y mismo payload.
   La publishable key va en cliente (solo INSERT vía RLS). La apikey del
   notificador NUNCA está aquí: vive en los Secrets de la Edge Function.
   ========================================================================= */
(() => {
  "use strict";

  const SUPABASE_URL = "https://mlaqtniujnvfxcvcourm.supabase.co";
  const SUPABASE_KEY = "sb_publishable_6no6BuOgiA_2nonTJntAuQ_DTqEgrcV";
  const NOTIFY_FN = SUPABASE_URL + "/functions/v1/reformas-notify";
  const LEADS_URL = SUPABASE_URL + "/rest/v1/leads_web";
  const ORIGEN = "demo-reformas-electricidad";
  const SECTOR = "reformas-electricidad-fontaneria";
  const TELEFONO = "643 199 580";

  /* Categorías: mismos nombres que usan los botones "Pedir cita" de las
     tarjetas de servicio (data-servicio). */
  const WORKS = [
    { id: "integral", label: "Reforma integral",   interes: "Reforma integral" },
    { id: "bano",     label: "Reforma de baño",    interes: "Reforma de baño" },
    { id: "cocina",   label: "Reforma de cocina",  interes: "Reforma de cocina" },
    { id: "elec",     label: "Electricidad",       interes: "Electricidad: instalación, boletín o avería" },
    { id: "font",     label: "Fontanería",         interes: "Fontanería: fuga, calentador o sanitarios" },
    { id: "urgencia", label: "Es una urgencia",    interes: "Urgencia eléctrica o de fontanería", urgente: true },
  ];

  const ZONAS = [
    "Majadahonda", "Pozuelo de Alarcón", "Las Rozas", "Boadilla del Monte",
    "Villaviciosa de Odón", "Madrid capital", "Otra zona de Madrid",
  ];

  /* Qué incluye cada servicio — se cuenta antes de pedir los datos.
     Demo con empresa ficticia: sin precios ni cifras. */
  const INFO = {
    "Reforma integral": "Una reforma integral la llevamos de principio a fin: distribución y tabiquería, albañilería, instalación eléctrica y de fontanería, y los acabados. Un solo equipo y un solo interlocutor. El importe se cierra por escrito tras la visita.",
    "Reforma de baño": "En un baño completo cambiamos alicatado y solado, sustituimos sanitarios y grifería, renovamos la fontanería y dejamos la instalación eléctrica al día. Presupuesto por partidas tras la visita.",
    "Reforma de cocina": "La cocina incluye muebles, encimera y campana, con las tomas de agua y la instalación eléctrica renovadas y en regla. Presupuesto por partidas tras la visita.",
    "Electricidad": "Instalaciones nuevas, cambio de cuadro con automáticos y diferenciales, puntos de luz y enchufes, localización de averías y boletín eléctrico cuando la instalación lo requiere.",
    "Fontanería": "Localizamos fugas y humedades, cambiamos grifería y sanitarios, instalamos termos y calentadores y sustituimos tuberías.",
    "Es una urgencia": "Las urgencias no entran en la cola de la obra: se atienden aparte. Si te has quedado sin luz o tienes una fuga, lo más rápido es llamar ya al " + "643 199 580" + " y te confirmamos la hora de llegada. Sigo tomando tus datos igualmente.",
  };

  /* ---------- Agenda (demo) ----------
     Mismo patron que la demo de veterinarios. L-V, manana y tarde, en
     tramos de 30 min. Las horas se generan en cliente: es una SOLICITUD de
     cita, no hay calendario real sincronizado. */
  const TRAMOS = [
    { etiqueta: "Mañana", desde: 8 * 60 + 30, hasta: 12 * 60 + 30 },
    { etiqueta: "Tarde",  desde: 16 * 60,     hasta: 19 * 60 },
  ];
  const PASO = 60;
  const MARGEN_MIN = 90;   // nadie reserva para dentro de diez minutos
  const MESES_VISTA = 6;
  const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
  const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

  const hoy = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const mismoDia = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  /* getDay() da domingo=0, que descoloca la rejilla: aqui lunes=0 */
  const diaSemanaLunes = (d) => (d.getDay() + 6) % 7;
  const formatoLargo = (d) =>
    d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const formatoCorto = (d) =>
    d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const isoLocal = (d) =>
    d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const hhmm = (min) =>
    String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");

  /* Tramos libres de un dia. Devuelve [] si no es habil, si ya paso, o si es
     hoy y no queda hora con margen suficiente. Esa lista vacia es justo lo
     que usa el calendario para deshabilitar el dia, asi que la regla de
     "hoy ya no da tiempo" no hay que escribirla dos veces. */
  const tramosDe = (fecha) => {
    const dow = diaSemanaLunes(fecha);
    if (dow === 6) return [];                      // domingo, cerrado
    if (fecha < hoy()) return [];
    const ahora = new Date();
    const corte = mismoDia(fecha, ahora) ? ahora.getHours() * 60 + ahora.getMinutes() + MARGEN_MIN : -1;
    const salida = [];
    (dow === 5 ? [{ etiqueta: "Mañana", desde: 9 * 60, hasta: 13 * 60 }] : TRAMOS).forEach((bloque) => {
      const horas = [];
      for (let m = bloque.desde; m <= bloque.hasta; m += PASO) if (m > corte) horas.push(hhmm(m));
      if (horas.length) salida.push({ etiqueta: bloque.etiqueta, horas });
    });
    return salida;
  };
  const hayHueco = (fecha) => tramosDe(fecha).length > 0;

  const $ = (s, c = document) => c.querySelector(s);
  const panel = $("#watio");
  if (!panel) return;
  const body = $(".watio-body", panel);
  const quick = $(".watio-quick", panel);
  const form = $(".watio-foot", panel);
  const input = $(".watio-foot input", panel);
  const sendBtn = $(".watio-foot button", panel);
  const btn = $("#watio-open");

  const lead = { servicio: "", interes: "", urgente: false, zona: "", dia: "", diaISO: "", hora: "", nombre: "", telefono: "" };
  let step = "work";       // work -> fecha -> hora -> name -> phone -> done
  let started = false;
  let vista = null;        // mes que pinta el calendario

  /* ---------- helpers UI ---------- */
  const scroll = () => { body.scrollTop = body.scrollHeight; };
  const addMsg = (text, who = "bot") => {
    const el = document.createElement("div");
    el.className = "watio-msg " + who;
    el.textContent = text;
    body.appendChild(el); scroll();
  };
  const typing = () => {
    const t = document.createElement("div");
    t.className = "watio-typing";
    t.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(t); scroll();
    return t;
  };
  const botSay = (text, after) =>
    new Promise((res) => {
      const t = typing();
      setTimeout(() => {
        t.remove(); addMsg(text, "bot");
        if (after) after();
        res();
      }, Math.min(900, 340 + text.length * 8));
    });
  const clearQuick = () => { quick.innerHTML = ""; };
  const setQuick = (items, onPick) => {
    clearQuick();
    items.forEach((it) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = it.label || it;
      b.addEventListener("click", () => onPick(it));
      quick.appendChild(b);
    });
  };
  const setInput = (enabled, placeholder) => {
    input.disabled = !enabled; sendBtn.disabled = !enabled;
    input.placeholder = placeholder || "Escribe tu respuesta…";
    if (enabled) setTimeout(() => input.focus(), 60);
  };

  /* ---------- flujo: categoría -> día -> hora -> datos -> cierre ---------- */
  const start = async () => {
    if (started) return; started = true;
    setInput(false);
    await botSay("Hola, soy Dani, el asistente de IA de WhiteMoon Reformas. Te ayudo a pedir tu visita sin compromiso en un minuto.");
    await botSay("¿Qué necesitas?", () => {
      setQuick(WORKS, (w) => { addMsg(w.label, "user"); pickWork(w.label); });
    });
  };

  /* Elegido el tratamiento: primero cuenta qué incluye, luego encadena la cita. */
  const pickWork = async (label) => {
    const w = WORKS.find((x) => x.label === label) || WORKS[0];
    lead.servicio = w.label; lead.interes = w.interes; lead.urgente = !!w.urgente;
    clearQuick();
    const info = INFO[w.label];
    if (info) await botSay(info);
    askZona();
  };

  /* ---------- Paso 2: zona ---------- */
  const askZona = async () => {
    step = "zona";
    await botSay(
      lead.urgente ? "¿En qué zona estás?" : "¿En qué zona está la vivienda o el local?",
      () => {
        setInput(false, "Elige tu zona");
        setQuick(ZONAS, (z) => { addMsg(z, "user"); lead.zona = z; clearQuick(); lead.urgente ? askName() : askFecha(); });
      }
    );
  };

  /* ---------- Paso 2: dia (calendario mensual) ---------- */
  const askFecha = async () => {
    step = "fecha";
    clearQuick();
    if (!vista) { const t = hoy(); vista = new Date(t.getFullYear(), t.getMonth(), 1); }
    await botSay("¿Qué día te viene bien para la visita? Atendemos de lunes a viernes y los sábados por la mañana.", () => {
      setInput(false, "Elige un día en el calendario");
      pintaCalendario();
    });
  };

  /* Widget unico: se vuelve a pintar en el sitio en vez de apilar copias */
  const widget = (cls) => {
    let w = $("#watio-widget", body);
    if (!w) { w = document.createElement("div"); w.id = "watio-widget"; body.appendChild(w); }
    w.className = cls;
    w.innerHTML = "";
    scroll();
    return w;
  };
  const quitaWidget = () => { const w = $("#watio-widget", body); if (w) w.remove(); };

  function pintaCalendario() {
    const box = widget("watio-cal");
    const t = hoy();
    const mesActual = new Date(t.getFullYear(), t.getMonth(), 1);
    const limite = new Date(t.getFullYear(), t.getMonth() + MESES_VISTA, 1);

    const nav = document.createElement("div");
    nav.className = "watio-cal__nav";
    const mk = (txt, aria, off, dis) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "watio-cal__btn"; b.textContent = txt;
      b.setAttribute("aria-label", aria); b.disabled = dis;
      b.addEventListener("click", () => {
        vista = new Date(vista.getFullYear(), vista.getMonth() + off, 1);
        pintaCalendario();
      });
      return b;
    };
    /* Sin retroceder del mes actual */
    nav.appendChild(mk("‹", "Mes anterior", -1, vista <= mesActual));
    const etiquetaMes = vista.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    const titulo = document.createElement("p");
    titulo.className = "watio-cal__mes";
    titulo.setAttribute("aria-live", "polite");
    /* es-ES da "agosto de 2026"; con capitalize saldria "Agosto De 2026" */
    titulo.textContent = etiquetaMes.charAt(0).toUpperCase() + etiquetaMes.slice(1);
    nav.appendChild(titulo);
    nav.appendChild(mk("›", "Mes siguiente", 1, vista >= limite));
    box.appendChild(nav);

    const grid = document.createElement("div");
    grid.className = "watio-cal__grid";
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Días disponibles de " + etiquetaMes);
    DIAS_CORTOS.forEach((d, i) => {
      const c = document.createElement("span");
      c.className = "watio-cal__wd"; c.setAttribute("aria-hidden", "true");
      c.textContent = d; c.title = DIAS_LARGOS[i];
      grid.appendChild(c);
    });
    const primero = new Date(vista.getFullYear(), vista.getMonth(), 1);
    for (let h = 0; h < diaSemanaLunes(primero); h++) {
      const v = document.createElement("span");
      v.className = "watio-cal__day is-empty"; v.setAttribute("aria-hidden", "true");
      grid.appendChild(v);
    }
    const ultimo = new Date(vista.getFullYear(), vista.getMonth() + 1, 0).getDate();
    for (let n = 1; n <= ultimo; n++) {
      const fecha = new Date(vista.getFullYear(), vista.getMonth(), n);
      const b = document.createElement("button");
      b.type = "button"; b.className = "watio-cal__day"; b.textContent = String(n);
      if (mismoDia(fecha, new Date())) b.classList.add("is-today");
      if (!hayHueco(fecha)) {
        b.disabled = true;
        b.setAttribute("aria-label", formatoLargo(fecha) + ", sin horas disponibles");
      } else {
        b.setAttribute("aria-label", formatoLargo(fecha));
        b.addEventListener("click", () => eligeFecha(fecha));
      }
      grid.appendChild(b);
    }
    box.appendChild(grid);

    const nota = document.createElement("p");
    nota.className = "watio-cal__nota";
    nota.textContent = "L-V de 8:30 a 19:00 y sábados de 9:00 a 13:00. Para una urgencia, llámanos al " + TELEFONO + ".";
    box.appendChild(nota);
  }

  const eligeFecha = (fecha) => {
    lead.dia = formatoLargo(fecha);
    lead.diaISO = isoLocal(fecha);
    addMsg(formatoCorto(fecha), "user");
    quitaWidget();
    askHora(fecha);
  };

  /* ---------- Paso 3: hora ---------- */
  const askHora = async (fecha) => {
    step = "hora";
    await botSay("Muy bien. ¿A qué hora te viene mejor?", () => {
      setInput(false, "Elige una hora");
      pintaHoras(fecha);
    });
  };

  function pintaHoras(fecha) {
    const box = widget("watio-slots");
    tramosDe(fecha).forEach((bloque) => {
      const sep = document.createElement("p");
      sep.className = "watio-slots__sep";
      sep.textContent = bloque.etiqueta;
      box.appendChild(sep);
      bloque.horas.forEach((h) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "watio-slot"; b.textContent = h;
        b.setAttribute("aria-label", h + " del " + formatoCorto(fecha));
        b.addEventListener("click", () => eligeHora(h));
        box.appendChild(b);
      });
    });
    const atras = document.createElement("button");
    atras.type = "button"; atras.className = "watio-back";
    atras.textContent = "Elegir otro día";
    atras.addEventListener("click", () => { addMsg("Prefiero otro día", "user"); askFecha(); });
    box.appendChild(atras);
  }

  const eligeHora = (h) => {
    lead.hora = h;
    addMsg(h, "user");
    quitaWidget();
    askName();
  };

  const askName = async () => {
    step = "name";
    clearQuick();
    await botSay(
      lead.urgente
        ? "Anotado. ¿A nombre de quién lo apunto?"
        : "Anotado: " + lead.dia + " a las " + lead.hora + ".\n\n¿A nombre de quién anoto la visita?",
      () => setInput(true, "Tu nombre…")
    );
  };

  const askPhone = async () => {
    step = "phone";
    await botSay("Gracias, " + lead.nombre.split(" ")[0] + ". ¿A qué teléfono te llamamos?", () =>
      setInput(true, "Tu teléfono…")
    );
  };

  /* Tarjeta de exito: el SVG del check es decorativo (aria-hidden), el texto
     es quien transmite el resultado. Verde profundo sobre verde muy claro. */
  const tarjetaExito = (texto) => {
    const el = document.createElement("div");
    el.className = "watio-ok";
    el.setAttribute("role", "status");
    const ic = document.createElement("span");
    ic.className = "watio-ok__ic";
    ic.setAttribute("aria-hidden", "true");
    ic.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    const p = document.createElement("p");
    p.textContent = texto;
    el.append(ic, p);
    body.appendChild(el);
    scroll();
  };

  const finish = async () => {
    step = "done";
    setInput(false); clearQuick(); quitaWidget();
    const t = typing();
    const ok = await submitLead();
    t.remove();
    if (ok) {
      tarjetaExito(lead.urgente
        ? "¡Listo! Tenemos tus datos. Para atención inmediata, llámanos al " + TELEFONO + "."
        : "¡Listo! Tenemos todos tus datos. Te llamamos para confirmar tu visita. ¡Gracias!");
      if (!lead.urgente) setTimeout(
        () => addMsg(
          "Pasaremos el " + lead.dia + " a las " + lead.hora + " (" + lead.zona +
          "). Si necesitas cambiarla, llámanos al " + TELEFONO + ".", "bot"
        ),
        700
      );
    } else {
      addMsg(
        "He guardado tus datos pero hubo un problema de conexión. Para no esperar, llámanos al " + TELEFONO + " y te atendemos al momento.",
        "bot"
      );
    }
  };

  /* ---------- entrada de texto ---------- */
  /* Guard: mínimo 9 dígitos reales (admite prefijo +34 / 0034 y separadores). */
  const isPhone = (v) => {
    const d = String(v).replace(/\D/g, "").replace(/^(?:0034|34)(?=[6-9]\d{8})/, "");
    return d.length >= 9 && /^[6-9]\d{8,}$/.test(d);
  };
  const handleText = (raw) => {
    const v = raw.trim();
    if (!v) return;
    addMsg(v, "user");
    input.value = "";
    if (step === "name") {
      if (v.length < 2) { botSay("¿Me dices tu nombre, por favor?"); return; }
      lead.nombre = v; setInput(false); askPhone();
    } else if (step === "phone") {
      if (!isPhone(v)) { botSay("Ese teléfono no parece válido. Escríbelo con 9 dígitos, por favor."); return; }
      lead.telefono = v; finish();
    }
  };

  form.addEventListener("submit", (e) => { e.preventDefault(); handleText(input.value); });

  /* ---------- envío del lead ----------
     fetch con keepalive (sobrevive a que se cierre la pestaña) y, si falla,
     sendBeacon con la apikey en query string como último recurso. */
  const beacon = (url, payload) => {
    if (!navigator.sendBeacon) return false;
    try {
      const sep = url.includes("?") ? "&" : "?";
      return navigator.sendBeacon(
        url + sep + "apikey=" + encodeURIComponent(SUPABASE_KEY),
        new Blob([JSON.stringify(payload)], { type: "application/json" })
      );
    } catch (e) { return false; }
  };

  const post = async (url, payload, extraHeaders) => {
    try {
      const r = await fetch(url, {
        method: "POST",
        keepalive: true,
        headers: Object.assign({
          "apikey": SUPABASE_KEY,
          "Authorization": "Bearer " + SUPABASE_KEY,
          "Content-Type": "application/json",
        }, extraHeaders || {}),
        body: JSON.stringify(payload),
      });
      if (r.ok) return true;
      console.warn("[dani]", url, r.status, await r.text());
      return beacon(url, payload);
    } catch (e) {
      console.warn("[dani] error de red:", e);
      return beacon(url, payload);
    }
  };

  async function submitLead() {
    const visita = lead.urgente ? "" : " | Visita: " + lead.dia + " a las " + lead.hora;
    const fila = {
      nombre: lead.nombre,
      telefono: lead.telefono,
      sector: SECTOR,
      interes: lead.interes,
      mensaje: "Servicio: " + lead.servicio + " | Zona: " + lead.zona + visita + (lead.urgente ? " | URGENTE" : ""),
      origen: ORIGEN,
    };
    if (!lead.urgente) { fila.cita_dia = lead.diaISO; fila.cita_hora = lead.hora; }

    // 1) INSERT en leads_web (el servicio va en `interes`, la zona en `mensaje`)
    const inserted = await post(LEADS_URL, fila, { "Prefer": "return=minimal" });

    // 2) Aviso por Telegram: reformas-notify lee { nombre, telefono, sector,
    //    servicio, zona, urgente, origen, cita_dia, cita_hora }.
    await post(NOTIFY_FN, {
      nombre: lead.nombre,
      telefono: lead.telefono,
      sector: SECTOR,
      servicio: lead.servicio,
      zona: lead.zona,
      urgente: lead.urgente,
      origen: ORIGEN,
      cita_dia: lead.urgente ? "" : lead.dia,
      cita_hora: lead.urgente ? "" : lead.hora,
    });

    return inserted;
  }

  /* ---------- abrir / cerrar ---------- */
  const open = (servicio) => {
    panel.classList.add("open");
    /* Cerrado el panel es invisible pero sus botones seguirian siendo
       enfocables con el teclado: inert los saca del recorrido de tabulacion. */
    panel.removeAttribute("inert");
    if (btn) btn.style.display = "none";
    start();
    /* Si vienen de una tarjeta de servicio, saltamos la elección de categoría. */
    if (servicio && step === "work") {
      setTimeout(() => {
        if (step !== "work") return;
        addMsg(servicio, "user");
        pickWork(servicio);
      }, 900);
    }
  };
  const close = () => {
    panel.classList.remove("open");
    panel.setAttribute("inert", "");
    if (btn) btn.style.display = "";
    if (btn) btn.focus();
  };
  btn && btn.addEventListener("click", () => open());
  $(".watio-head__close", panel).addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) close();
  });
  document.querySelectorAll("[data-watio]").forEach((el) =>
    el.addEventListener("click", (e) => { e.preventDefault(); open(el.dataset.servicio); })
  );
})();
