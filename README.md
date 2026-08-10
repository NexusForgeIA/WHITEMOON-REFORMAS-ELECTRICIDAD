# WhiteMoon · Reformas, Electricidad y Fontanería (demo)

Demo comercial de WhiteMoon Agencia IA para el sector de reformas, electricidad
y fontanería. Web estática (HTML/CSS/JS puro, sin frameworks) desplegada en
GitHub Pages, con un agente IA que capta leads reales.

**Producción:** https://nexusforgeia.github.io/WHITEMOON-REFORMAS-ELECTRICIDAD/

## Qué hay dentro

| Ruta | Qué es |
|---|---|
| `index.html` | Página completa: topbar, header, hero, servicios, zonas, FAQ, footer y el agente. |
| `assets/css/style.css` | Design system WhiteMoon (`#7c4dff` sobre `#08080d`/`#0e0e16`/`#13131e`) y responsive 900/600. |
| `assets/js/main.js` | Interacciones: menú móvil, rotador del hero, scroll reveal y canvas del hero. |
| `assets/js/dani.js` | Agente "Dani": árbol de conversación, alta del lead y aviso al equipo. |
| `assets/*.jpg` | Fotos del hero, de los seis servicios y de la sección "sobre nosotros". |
| `supabase/functions/reformas-notify/` | Edge Function que envía el aviso de WhatsApp. |
| `robots.txt` · `llms.txt` · `sitemap.xml` | SEO/GEO/AEO. |

## El agente (Dani)

Árbol: **servicio → zona → nombre → teléfono → cierre**. Distingue urgencias
(electricidad y fontanería) de reformas, que siempre se presupuestan con visita.

Al cerrar la conversación dispara **las dos cosas en paralelo**:

1. Insert del lead en Supabase `leads_web` por REST con la *publishable key*
   (`origen='demo-reformas-electricidad'`, `sector='reformas-electricidad-fontaneria'`).
   El servicio va en `interes` y la zona dentro de `mensaje`. Si la pasarela
   devuelve un `503` transitorio, se reintenta una vez.
2. Aviso a `POST /functions/v1/reformas-notify` por `navigator.sendBeacon`, que
   envía el mensaje a **Telegram**.

Ni el insert espera al aviso ni el aviso al insert: así un `503` de la REST no
deja el mensaje de Telegram sin salir.

### Dos detalles que no se pueden tocar

- **El beacon va en `text/plain;charset=UTF-8`**, nunca en `application/json`.
  Con JSON el beacon deja de ser una petición simple, Chrome lanza el preflight
  CORS, la función registra el `OPTIONS` y descarta el `POST` — y
  `sendBeacon()` devuelve `true` igual, así que el aviso se pierde sin rastro.
  La función parsea con `req.json()` y no mira el `Content-Type`.
- **El aviso va por Telegram, nunca por CallMeBot** (regla fija del proyecto).
  `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` viven **solo** en los Secrets del
  proyecto Supabase. Nunca en el JS del navegador.

La función aplica además el guard estándar de WhiteMoon: sin `nombre` **y**
`telefono` responde `400 {"ok":false,"error":"lead incompleto"}` y no avisa.

## Desplegar la Edge Function

```bash
supabase functions deploy reformas-notify \
  --project-ref mlaqtniujnvfxcvcourm \
  --no-verify-jwt
```

## Contenido

Sin testimonios, reseñas, NIF ni casos inventados. El bloque de reseñas es un
espacio reservado a valoraciones reales verificadas. Fotografías de Unsplash,
descargadas y servidas en local.
