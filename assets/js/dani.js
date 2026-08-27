/* =========================================================================
   WhiteMoon · Dani, asistente de reformas — agente IA que capta leads
   Árbol: servicio → (qué incluye) → zona → día → hora → nombre → teléfono.
   La rama de URGENCIA se salta el calendario: una fuga o un corte de luz no
   se agenda para el jueves, se atiende llamando.
   Al cerrar dispara DOS cosas EN PARALELO:
     1. insert del lead en Supabase (leads_web, REST + publishable key),
        con un reintento si la pasarela devuelve un 503 transitorio;
     2. aviso a la Edge Function reformas-notify por sendBeacon, que es
        quien manda el mensaje a Telegram.
   El token del bot vive SOLO en los Secrets de la función, nunca aquí.
   ========================================================================= */
(function () {
  'use strict';

  /* ============ CONFIG ============ */
  var SUPABASE_URL = 'https://mlaqtniujnvfxcvcourm.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_6no6BuOgiA_2nonTJntAuQ_DTqEgrcV'; /* publishable: no es secreta */
  var LEADS_TABLE  = 'leads_web';
  var NOTIFY_FN    = SUPABASE_URL + '/functions/v1/reformas-notify';
  var ORIGEN       = 'demo-reformas-electricidad';
  var SECTOR       = 'reformas-electricidad-fontaneria';
  var TEL          = '+34643199580';
  var TEL_LABEL    = '643 199 580';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var botFab   = document.getElementById('botFab');
  var botWin   = document.getElementById('botWin');
  var botClose = document.getElementById('botClose');
  var botBody  = document.getElementById('botBody');
  var botChips = document.getElementById('botChips');
  var botForm  = document.getElementById('botForm');
  var botInput = document.getElementById('botInput');

  if (!botFab || !botWin || !botBody) return;

  var started = false;
  var step = 'servicio';
  var lead = {
    servicio: '', zona: '', nombre: '', telefono: '', urgente: false,
    citaISO: '', citaLegible: '', citaHora: ''
  };

  /* Qué incluye cada servicio y desde cuánto sale. Los importes son los
     mismos que publica la sección de precios y son ORIENTATIVOS: aquí se
     dice explícitamente, para que el chat no prometa lo que la web matiza. */
  var SERVICIOS = [
    {
      label: 'Reforma integral',
      value: 'Reforma integral',
      info: 'Una reforma integral la llevamos de principio a fin: distribución y tabiquería, albañilería, la instalación eléctrica y la de fontanería, y todos los acabados (alicatado, solado, pintura y carpintería). Un solo equipo y un solo interlocutor. Como referencia orientativa sale desde 450 €/m², pero el precio real depende de la superficie, las calidades y el estado de las instalaciones: se cierra en el presupuesto después de la visita.'
    },
    {
      label: 'Reforma de baño',
      value: 'Reforma de baño',
      info: 'En un baño completo cambiamos el alicatado y el solado, sustituimos sanitarios y grifería, renovamos la fontanería y dejamos la instalación eléctrica al día. El cambio de bañera por plato de ducha sale desde 1.450 € y el baño completo desde 3.900 €, siempre como referencia orientativa: el precio final va en el presupuesto tras ver el baño.'
    },
    {
      label: 'Reforma de cocina',
      value: 'Reforma de cocina',
      info: 'La cocina incluye muebles, encimera, campana y electrodomésticos si los quieres, con las tomas de agua y la instalación eléctrica renovadas y en regla. Como orientación, desde 4.900 €. La cifra depende mucho de los muebles y la encimera que elijas, así que el precio se cierra en el presupuesto por escrito.'
    },
    {
      label: 'Electricidad',
      value: 'Electricidad: instalación, boletín o avería',
      info: 'Hacemos instalaciones nuevas, cambio de cuadro con automáticos y diferenciales, puntos de luz y enchufes, localización de averías y el boletín eléctrico cuando la instalación lo requiere. Orientativamente: un punto de luz o enchufe desde 45 €, el cambio de cuadro desde 320 € y el boletín desde 150 €. Lo confirmamos al ver la instalación.'
    },
    {
      label: 'Fontanería',
      value: 'Fontanería: fuga, calentador o sanitarios',
      info: 'Localizamos fugas y humedades, cambiamos grifería y sanitarios, instalamos termos y calentadores y sustituimos tuberías. Como referencia orientativa: localización de fuga desde 90 €, grifería desde 70 € y termo eléctrico instalado desde 220 €. El importe final se cierra al ver el trabajo.'
    },
    {
      label: 'Es una urgencia',
      value: 'Urgencia eléctrica o de fontanería',
      urgente: true,
      info: 'Las urgencias no entran en la cola de la obra: se atienden aparte. Salida y diagnóstico desde 90 € como referencia orientativa.'
    }
  ];

  var ZONAS = [
    'Majadahonda', 'Pozuelo de Alarcón', 'Las Rozas', 'Boadilla del Monte',
    'Villaviciosa de Odón', 'Madrid capital', 'Otra zona de Madrid'
  ];

  /* Agenda de visitas — coherente con el openingHoursSpecification del
     JSON-LD: L-V 08:00-20:00, sábado 09:00-14:00, domingo cerrado. */
  var SLOTS_LV  = ['08:30', '09:30', '10:30', '11:30', '12:30', '16:00', '17:00', '18:00', '19:00'];
  var SLOTS_SAB = ['09:00', '10:00', '11:00', '12:00', '13:00'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS  = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  var calY, calM;

  /* ============ APERTURA / CIERRE ============ */
  function setBot(open, servicioPre) {
    document.body.classList.toggle('bot-open', open);
    botWin.setAttribute('aria-hidden', open ? 'false' : 'true');
    botFab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var badge = botFab.querySelector('.badge');
      if (badge) badge.style.display = 'none';
      if (!started) { started = true; start(servicioPre); }
      else if (servicioPre) { elegirServicioDirecto(servicioPre); }
      setTimeout(function () { if (botInput && !botInput.disabled) botInput.focus(); }, 380);
    } else {
      botFab.focus();
    }
  }
  botFab.addEventListener('click', function () { setBot(true); });
  if (botClose) botClose.addEventListener('click', function () { setBot(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('bot-open')) setBot(false);
  });

  /* Cualquier CTA con data-bot abre a Dani. Si además lleva data-servicio
     (las tarjetas de la sección Servicios), entra ya con ese servicio elegido. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-bot]'), function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      setBot(true, el.getAttribute('data-servicio') || '');
    });
  });

  function buscarServicio(label) {
    var l = String(label || '').toLowerCase();
    for (var i = 0; i < SERVICIOS.length; i++) {
      if (SERVICIOS[i].label.toLowerCase() === l) return SERVICIOS[i];
    }
    return null;
  }

  /* Entrada directa desde una tarjeta: se ve el servicio como si lo hubiera
     escrito el usuario y el árbol continúa por donde toca. */
  function elegirServicioDirecto(label) {
    var svc = buscarServicio(label);
    if (!svc || step !== 'servicio') return;
    setTimeout(function () { handle(svc.label, svc); }, reduceMotion ? 0 : 700);
  }

  /* ============ MENSAJES ============ */
  function scrollBot() { botBody.scrollTop = botBody.scrollHeight; }

  function addMsg(text, who) {
    var d = document.createElement('div');
    d.className = 'msg ' + who;
    if (who === 'bot') {
      /* solo se permite el enlace tel: que insertamos nosotros */
      d.innerHTML = text.replace(/\[LLAMAR\]/g, '<a href="tel:' + TEL + '">' + TEL_LABEL + '</a>');
    } else {
      d.textContent = text;
    }
    botBody.appendChild(d);
    scrollBot();
  }

  function typing(on) {
    var t = botBody.querySelector('.typing');
    if (on) {
      if (t) return;
      var d = document.createElement('div');
      d.className = 'typing';
      d.innerHTML = '<i></i><i></i><i></i>';
      botBody.appendChild(d);
      scrollBot();
    } else if (t) { t.remove(); }
  }

  function botSay(text, delay, luego) {
    typing(true);
    setTimeout(function () {
      typing(false);
      addMsg(text, 'bot');
      if (luego) luego();
    }, reduceMotion ? 0 : (delay || 650));
  }

  function setChips(list) {
    botChips.innerHTML = '';
    (list || []).forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'chip' + (c.urgente ? ' urgent' : '');
      b.type = 'button';
      b.textContent = c.label;
      b.addEventListener('click', function () { handle(c.label, c); });
      botChips.appendChild(b);
    });
  }

  function start(servicioPre) {
    botSay('Hola, soy Dani, asistente de reformas de WhiteMoon.\n\nHacemos reformas integrales, baños y cocinas, y trabajos de electricidad y fontanería en Majadahonda y Madrid Oeste.\n\n¿Qué necesitas?', 300);
    setTimeout(function () {
      if (servicioPre && buscarServicio(servicioPre)) elegirServicioDirecto(servicioPre);
      else setChips(SERVICIOS);
    }, reduceMotion ? 0 : 950);
  }

  function validPhone(s) {
    var digits = String(s).replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  }

  /* ============ ÁRBOL DE CONVERSACIÓN ============ */
  function handle(text, chip) {
    addMsg(text, 'user');
    setChips([]);

    if (step === 'servicio') {
      var match = chip || buscarServicio(text);
      lead.servicio = match ? match.value : text;
      lead.urgente = match ? !!match.urgente : /urgen|fuga|avería|averia|sin luz|se ha ido la luz|inund|atasc|escape/i.test(text);
      step = 'zona';

      /* primero qué incluye el servicio, después la pregunta: así el chat
         informa antes de pedir, igual que haría alguien del equipo */
      var info = match && match.info;
      var pregunta = lead.urgente
        ? 'Entendido, es una urgencia. Si es una fuga de agua o te has quedado sin luz, lo más rápido es que llames ya al [LLAMAR] y te confirmamos la hora de llegada al momento.\n\nSigo tomando los datos igualmente. ¿En qué zona estás?'
        : '¿En qué zona está la vivienda o el local?';

      if (info) {
        botSay(info, 620, function () {
          botSay(pregunta, 700, function () { setChips(zonaChips()); });
        });
      } else {
        botSay(pregunta, 650, function () { setChips(zonaChips()); });
      }
      return;
    }

    if (step === 'zona') {
      lead.zona = text;
      /* Urgencia: sin calendario. Una fuga no se agenda, se atiende. */
      if (lead.urgente) {
        step = 'nombre';
        botSay('Gracias. ¿Cómo te llamas?');
        return;
      }
      step = 'dia';
      botSay('Perfecto, ahí trabajamos. La visita para medir y presupuestar es sin coste.\n\n¿Qué día te viene bien? Elígelo en el calendario (L-V de 8:00 a 20:00 y sábados de 9:00 a 14:00).', 700, showCalendar);
      return;
    }

    if (step === 'dia') {
      botSay('Elige el día en el calendario de arriba y seguimos.');
      return;
    }

    if (step === 'hora') {
      botSay('Elige una de las franjas horarias y seguimos.');
      return;
    }

    if (step === 'nombre') {
      lead.nombre = text.trim();
      step = 'telefono';
      botSay('Encantado, ' + lead.nombre + '. ¿Un teléfono de contacto para llamarte?');
      return;
    }

    if (step === 'telefono') {
      if (!validPhone(text)) {
        botSay('Ese teléfono no parece válido. ¿Me lo escribes de nuevo? (9 dígitos)');
        return;
      }
      lead.telefono = text.trim();
      step = 'fin';
      /* en paralelo: el aviso no espera al insert ni al revés, así que un 503
         de la REST no deja a Cristóbal sin el mensaje de Telegram */
      saveLead();
      notifyLead();
      cerrarConTarjeta();
      return;
    }
  }

  function zonaChips() {
    return ZONAS.map(function (z) { return { label: z }; });
  }

  /* ============ AGENDA: CALENDARIO ============
     Domingo cerrado y días pasados deshabilitados. Un día del que ya no
     queda ninguna franja (hoy a última hora) también sale deshabilitado:
     ofrecer las 8:30 de esta mañana a las siete de la tarde es peor que
     no ofrecer nada. */
  function hoy0() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }

  function slotsDe(fecha) {
    var dow = fecha.getDay();
    if (dow === 0) return [];
    var base = (dow === 6) ? SLOTS_SAB : SLOTS_LV;
    var n = new Date();
    var esHoy = fecha.getTime() === hoy0().getTime();
    if (!esHoy) return base.slice();
    /* margen de una hora para poder organizar la visita */
    var limite = n.getHours() * 60 + n.getMinutes() + 60;
    return base.filter(function (h) {
      var p = h.split(':');
      return (parseInt(p[0], 10) * 60 + parseInt(p[1], 10)) > limite;
    });
  }

  function showCalendar() {
    var n = new Date();
    calY = n.getFullYear();
    calM = n.getMonth();
    renderCalendar();
  }

  function renderCalendar() {
    var w = document.getElementById('botCal');
    if (!w) {
      w = document.createElement('div');
      w.id = 'botCal';
      w.className = 'bot-cal';
      w.setAttribute('role', 'group');
      w.setAttribute('aria-label', 'Elige el día de la visita');
      botBody.appendChild(w);
    }
    w.innerHTML = '';

    var n = new Date();
    var enMesActual = (calY === n.getFullYear() && calM === n.getMonth());

    var head = document.createElement('div');
    head.className = 'bot-cal__head';

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'bot-cal__nav';
    prev.textContent = '‹';
    prev.setAttribute('aria-label', 'Mes anterior');
    prev.disabled = enMesActual;
    prev.addEventListener('click', function () {
      calM--; if (calM < 0) { calM = 11; calY--; }
      renderCalendar();
    });

    var title = document.createElement('span');
    title.className = 'bot-cal__title';
    title.textContent = MESES[calM] + ' ' + calY;

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'bot-cal__nav';
    next.textContent = '›';
    next.setAttribute('aria-label', 'Mes siguiente');
    next.addEventListener('click', function () {
      calM++; if (calM > 11) { calM = 0; calY++; }
      renderCalendar();
    });

    head.appendChild(prev); head.appendChild(title); head.appendChild(next);
    w.appendChild(head);

    var dow = document.createElement('div');
    dow.className = 'bot-cal__grid bot-cal__dow';
    dow.setAttribute('aria-hidden', 'true');
    ['L', 'M', 'X', 'J', 'V', 'S', 'D'].forEach(function (x) {
      var s = document.createElement('span');
      s.textContent = x;
      dow.appendChild(s);
    });
    w.appendChild(dow);

    var grid = document.createElement('div');
    grid.className = 'bot-cal__grid';
    /* getDay() da 0 en domingo; la rejilla empieza en lunes */
    var offset = (new Date(calY, calM, 1).getDay() + 6) % 7;
    for (var i = 0; i < offset; i++) {
      var e = document.createElement('span');
      e.className = 'bot-cal__day empty';
      grid.appendChild(e);
    }
    var diasMes = new Date(calY, calM + 1, 0).getDate();
    var limite = hoy0();
    for (var d = 1; d <= diasMes; d++) {
      (function (dia) {
        var fecha = new Date(calY, calM, dia);
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'bot-cal__day';
        cell.textContent = dia;
        if (fecha < limite || slotsDe(fecha).length === 0) {
          cell.disabled = true;
          cell.setAttribute('aria-label', dia + ' de ' + MESES[calM] + ', no disponible');
        } else {
          cell.setAttribute('aria-label', DIAS[fecha.getDay()] + ' ' + dia + ' de ' + MESES[calM]);
          cell.addEventListener('click', function () { pickDia(fecha, cell); });
        }
        grid.appendChild(cell);
      })(d);
    }
    w.appendChild(grid);
    scrollBot();
  }

  function pickDia(fecha, cell) {
    var d = fecha.getDate();
    lead.citaISO = fecha.getFullYear() + '-' +
      String(fecha.getMonth() + 1).padStart(2, '0') + '-' +
      String(d).padStart(2, '0');
    lead.citaLegible = DIAS[fecha.getDay()] + ' ' + d + ' de ' + MESES[fecha.getMonth()];

    var w = document.getElementById('botCal');
    if (w) {
      w.classList.add('locked');
      Array.prototype.forEach.call(w.querySelectorAll('button'), function (b) { b.disabled = true; });
      cell.classList.add('sel');
      cell.disabled = true;
    }
    addMsg(lead.citaLegible, 'user');

    step = 'hora';
    var esSabado = fecha.getDay() === 6;
    botSay('Anotado, ' + lead.citaLegible + (esSabado ? ' (sábado, solo mañanas)' : '') + '. ¿A qué hora te viene mejor?', 550, function () {
      showSlots(slotsDe(fecha));
    });
  }

  function showSlots(franjas) {
    var w = document.createElement('div');
    w.className = 'bot-slots';
    w.id = 'botSlots';
    w.setAttribute('role', 'group');
    w.setAttribute('aria-label', 'Elige la franja horaria');
    franjas.forEach(function (h) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = h;
      b.setAttribute('aria-label', 'A las ' + h);
      b.addEventListener('click', function () { pickHora(h, b); });
      w.appendChild(b);
    });
    botBody.appendChild(w);
    scrollBot();
  }

  function pickHora(h, btn) {
    lead.citaHora = h;
    var w = document.getElementById('botSlots');
    if (w) {
      w.classList.add('locked');
      Array.prototype.forEach.call(w.querySelectorAll('.chip'), function (b) { b.disabled = true; });
      btn.classList.add('sel');
    }
    addMsg(h, 'user');
    step = 'nombre';
    botSay('Perfecto. ¿A nombre de quién anoto la visita?', 550);
  }

  /* ============ CIERRE ============
     Ya tenemos nombre, teléfono, servicio, zona y (salvo urgencia) la cita:
     el flujo termina con una tarjeta de confirmación, no con otra petición
     al usuario. Solo la rama urgente conserva un CTA de llamada, porque ahí
     la espera sí importa. */
  function cerrarConTarjeta() {
    typing(true);
    setTimeout(function () {
      typing(false);

      var card = document.createElement('div');
      card.className = 'bot-done';
      card.setAttribute('role', 'status');
      card.setAttribute('aria-live', 'polite');

      var ic = document.createElement('span');
      ic.className = 'bot-done__ic';
      ic.setAttribute('aria-hidden', 'true');
      ic.innerHTML = '<svg viewBox="0 0 24 24"><use href="#ic-check"/></svg>';

      var body = document.createElement('div');
      body.className = 'bot-done__body';

      var titulo = document.createElement('b');
      /* el ✓ del titular es decorativo: el icono ya está al lado y un lector
         de pantalla no tiene por qué leer "marca de verificación" */
      titulo.innerHTML = '<span aria-hidden="true">✓ </span>';
      titulo.appendChild(document.createTextNode('Tenemos tus datos'));

      var texto = document.createElement('p');
      texto.textContent = 'Te llamamos al ' + lead.telefono +
        ' para darte presupuesto sin compromiso. ¡Gracias, ' + lead.nombre + '!';

      body.appendChild(titulo);
      body.appendChild(texto);

      if (lead.citaLegible && lead.citaHora) {
        var cita = document.createElement('p');
        cita.className = 'bot-done__cita';
        cita.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-clock"/></svg>';
        cita.appendChild(document.createTextNode(
          'Visita anotada: ' + lead.citaLegible + ' a las ' + lead.citaHora +
          ' · ' + lead.servicio.toLowerCase() + ' en ' + lead.zona
        ));
        body.appendChild(cita);
      }

      /* Solo en urgencias: un único CTA secundario para no esperar la llamada */
      if (lead.urgente) {
        var cta = document.createElement('a');
        cta.className = 'bot-done__cta';
        cta.href = 'tel:' + TEL;
        cta.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ic-phone"/></svg>';
        cta.appendChild(document.createTextNode('Para atención inmediata, llámanos'));
        body.appendChild(cta);
      }

      card.appendChild(ic);
      card.appendChild(body);
      botBody.appendChild(card);
      scrollBot();
      cerrarInput();
    }, reduceMotion ? 0 : 900);
  }

  /* La conversación ha terminado: se deshabilita el input para que quede claro
     que no hay que escribir nada más. */
  function cerrarInput() {
    if (botForm) botForm.classList.add('is-done');
    if (botInput) {
      botInput.disabled = true;
      botInput.value = '';
      botInput.placeholder = 'Conversación finalizada';
    }
    var send = botForm && botForm.querySelector('.bot-send');
    if (send) send.disabled = true;
  }

  /* leads_web no tiene columnas zona/servicio: el servicio va en `interes`
     y la zona se guarda en `mensaje` (convención del resto de demos). La cita
     sí tiene columnas propias: cita_dia (ISO) y cita_hora.

     La pasarela REST devuelve algún 503 suelto sin llegar a Postgres (visto en
     esta demo el 2026-08-10). Como el lead es lo único que no se puede perder,
     se reintenta una vez ante 503 o ante fallo de red. */
  function saveLead() {
    var mensaje = 'Servicio: ' + lead.servicio +
                  ' | Zona: ' + lead.zona +
                  (lead.citaLegible ? ' | Visita: ' + lead.citaLegible + ' ' + lead.citaHora : '') +
                  (lead.urgente ? ' | URGENTE' : '');
    var body = JSON.stringify({
      nombre: lead.nombre,
      telefono: lead.telefono,
      sector: SECTOR,
      interes: lead.servicio,
      mensaje: mensaje,
      origen: ORIGEN,
      cita_dia: lead.citaISO,
      cita_hora: lead.citaHora
    });

    function insertar(reintentado) {
      return fetch(SUPABASE_URL + '/rest/v1/' + LEADS_TABLE, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Prefer': 'return=minimal'
        },
        body: body
      }).then(function (r) {
        if (r.status === 503 && !reintentado) return esperarYReintentar();
        return r;
      }, function () {
        if (!reintentado) return esperarYReintentar();
      });
    }

    function esperarYReintentar() {
      return new Promise(function (res) { setTimeout(res, 800); })
        .then(function () { return insertar(true); });
    }

    insertar(false).catch(function () {});
  }

  /* El aviso lo manda la Edge Function a Telegram (token server-side).
     Va por sendBeacon para que salga aunque el usuario cierre la pestaña justo
     después de dar el teléfono.

     OJO con el Content-Type: tiene que ser 'text/plain;charset=UTF-8'. Con
     'application/json' el beacon deja de ser una petición simple, Chrome lanza
     el preflight CORS, la función registra el OPTIONS y descarta el POST —
     y sendBeacon() devuelve true igual, así que el aviso se pierde en silencio.
     La función parsea con req.json() y no mira el Content-Type. */
  function notifyLead() {
    var payload = JSON.stringify({
      nombre: lead.nombre,
      telefono: lead.telefono,
      sector: SECTOR,
      servicio: lead.servicio,
      zona: lead.zona,
      urgente: lead.urgente,
      origen: ORIGEN,
      cita_dia: lead.citaLegible,
      cita_hora: lead.citaHora
    });

    if (navigator.sendBeacon) {
      var blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
      if (navigator.sendBeacon(NOTIFY_FN, blob)) return;
    }
    /* sin sendBeacon (o si la cola del navegador lo rechaza): fetch keepalive,
       también con un Content-Type de la lista segura para evitar el preflight */
    fetch(NOTIFY_FN, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: payload
    }).catch(function () {});
  }

  if (botForm) {
    botForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = botInput.value.trim();
      if (!v) return;
      botInput.value = '';
      handle(v, null);
    });
  }
})();
