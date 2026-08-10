/* =========================================================================
   WhiteMoon · Dani, asistente de reformas — agente IA que capta leads
   Árbol: servicio → zona → nombre → teléfono → cierre.
   Al cerrar: inserta el lead en Supabase (leads_web, REST + publishable key)
   y llama a la Edge Function reformas-notify, que es quien manda el WhatsApp.
   La apikey de CallMeBot vive SOLO en los Secrets de la función, nunca aquí.
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
      saveLead();
      notifyLead();
      var cierre = lead.urgente
        ? 'Listo, ' + lead.nombre + '. Aviso enviado: te llamamos al ' + lead.telefono + ' ahora mismo.\n\nAl ser una urgencia, lo más rápido es que llames tú al [LLAMAR]. Te decimos el precio antes de tocar nada.'
        : 'Listo, ' + lead.nombre + '. Hemos anotado tu solicitud (' + lead.servicio.toLowerCase() + ', ' + lead.zona + ') y te llamamos al ' + lead.telefono + ' para concretar la visita y darte el presupuesto.\n\nSi lo prefieres, puedes llamar tú al [LLAMAR].';
      botSay(cierre, 900);
      setTimeout(function () {
        setChips([{ label: 'Llamar ahora', urgente: true }]);
        var b = botChips.querySelector('.chip');
        if (b) b.addEventListener('click', function () { window.location.href = 'tel:' + TEL; });
      }, reduceMotion ? 0 : 1600);
      return;
    }

    if (step === 'fin') {
      botSay('Ya tenemos tus datos, ' + lead.nombre + '. Si es una urgencia de luz o agua, llama al [LLAMAR] y te atendemos al momento.');
    }
  }

  /* leads_web no tiene columnas zona/servicio: el servicio va en `interes`
     y la zona se guarda en `mensaje` (convención del resto de demos). */
  function saveLead() {
    var mensaje = 'Servicio: ' + lead.servicio +
                  ' | Zona: ' + lead.zona +
                  (lead.urgente ? ' | URGENTE' : '');
    fetch(SUPABASE_URL + '/rest/v1/' + LEADS_TABLE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        nombre: lead.nombre,
        telefono: lead.telefono,
        sector: SECTOR,
        interes: lead.servicio,
        mensaje: mensaje,
        origen: ORIGEN
      })
    }).catch(function () {});
  }

  /* La notificación WhatsApp la envía la Edge Function (CallMeBot server-side).
     No abrimos wa.me en el cliente ni exponemos ninguna apikey. */
  function notifyLead() {
    fetch(NOTIFY_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY
      },
      body: JSON.stringify({
        nombre: lead.nombre,
        telefono: lead.telefono,
        servicio: lead.servicio,
        zona: lead.zona,
        urgente: lead.urgente,
        origen: ORIGEN
      })
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
