/* =========================================================================
   WhiteMoon · Dani, asistente de reformas — agente IA que capta leads
   Árbol: servicio → zona → nombre → teléfono → cierre.
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
  var lead = { servicio: '', zona: '', nombre: '', telefono: '', urgente: false };

  var SERVICIOS = [
    { label: 'Reforma integral',      value: 'Reforma integral' },
    { label: 'Reforma de baño',       value: 'Reforma de baño' },
    { label: 'Reforma de cocina',     value: 'Reforma de cocina' },
    { label: 'Electricidad',          value: 'Electricidad: instalación, boletín o avería' },
    { label: 'Fontanería',            value: 'Fontanería: fuga, calentador o sanitarios' },
    { label: 'Es una urgencia',       value: 'Urgencia eléctrica o de fontanería', urgente: true }
  ];

  var ZONAS = [
    'Majadahonda', 'Pozuelo de Alarcón', 'Las Rozas', 'Boadilla del Monte',
    'Villaviciosa de Odón', 'Madrid capital', 'Otra zona de Madrid'
  ];

  /* ============ APERTURA / CIERRE ============ */
  function setBot(open) {
    document.body.classList.toggle('bot-open', open);
    botWin.setAttribute('aria-hidden', open ? 'false' : 'true');
    botFab.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var badge = botFab.querySelector('.badge');
      if (badge) badge.style.display = 'none';
      if (!started) { started = true; start(); }
      setTimeout(function () { if (botInput) botInput.focus(); }, 380);
    } else {
      botFab.focus();
    }
  }
  botFab.addEventListener('click', function () { setBot(true); });
  if (botClose) botClose.addEventListener('click', function () { setBot(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.body.classList.contains('bot-open')) setBot(false);
  });

  /* cualquier CTA con data-bot abre a Dani */
  Array.prototype.forEach.call(document.querySelectorAll('[data-bot]'), function (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      setBot(true);
    });
  });

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

  function botSay(text, delay) {
    typing(true);
    setTimeout(function () {
      typing(false);
      addMsg(text, 'bot');
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

  function start() {
    botSay('Hola, soy Dani, asistente de reformas de WhiteMoon.\n\nHacemos reformas integrales, baños y cocinas, y trabajos de electricidad y fontanería en Majadahonda y Madrid Oeste.\n\n¿Qué necesitas?', 300);
    setTimeout(function () { setChips(SERVICIOS); }, reduceMotion ? 0 : 950);
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
      var match = chip || SERVICIOS.filter(function (s) {
        return s.label.toLowerCase() === text.toLowerCase();
      })[0];
      lead.servicio = match ? match.value : text;
      lead.urgente = match ? !!match.urgente : /urgen|fuga|avería|averia|sin luz|se ha ido la luz|inund|atasc|escape/i.test(text);
      step = 'zona';
      if (lead.urgente) {
        botSay('Entendido, es una urgencia. Si es una fuga de agua o te has quedado sin luz, lo más rápido es que llames ya al [LLAMAR] y te confirmamos la hora de llegada al momento.\n\nSigo tomando los datos igualmente. ¿En qué zona estás?');
      } else {
        botSay('Perfecto. Para una reforma pasamos a verlo sin coste y te damos el presupuesto por escrito.\n\n¿En qué zona está la vivienda o el local?');
      }
      setTimeout(function () {
        setChips(ZONAS.map(function (z) { return { label: z }; }));
      }, reduceMotion ? 0 : 800);
      return;
    }

    if (step === 'zona') {
      lead.zona = text;
      step = 'nombre';
      botSay('Gracias. ¿Cómo te llamas?');
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

  /* ============ CIERRE ============
     Ya tenemos nombre, teléfono, servicio y zona: el flujo termina con una
     tarjeta de confirmación, no con otra petición al usuario. Solo la rama
     urgente conserva un CTA de llamada, porque ahí la espera sí importa. */
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
      titulo.appendChild(document.createTextNode('Datos recibidos'));

      var texto = document.createElement('p');
      texto.textContent =
        'Gracias, ' + lead.nombre + '. Hemos registrado tu solicitud de ' +
        lead.servicio.toLowerCase() + ' en ' + lead.zona +
        '. Te llamamos al ' + lead.telefono +
        ' en breve para concretar la visita y darte el presupuesto.';

      body.appendChild(titulo);
      body.appendChild(texto);

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
     y la zona se guarda en `mensaje` (convención del resto de demos).

     La pasarela REST devuelve algún 503 suelto sin llegar a Postgres (visto en
     esta demo el 2026-08-10). Como el lead es lo único que no se puede perder,
     se reintenta una vez ante 503 o ante fallo de red. */
  function saveLead() {
    var mensaje = 'Servicio: ' + lead.servicio +
                  ' | Zona: ' + lead.zona +
                  (lead.urgente ? ' | URGENTE' : '');
    var body = JSON.stringify({
      nombre: lead.nombre,
      telefono: lead.telefono,
      sector: SECTOR,
      interes: lead.servicio,
      mensaje: mensaje,
      origen: ORIGEN
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
      origen: ORIGEN
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
