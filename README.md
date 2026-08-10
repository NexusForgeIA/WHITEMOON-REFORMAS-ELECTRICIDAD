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

Al cerrar la conversación:

1. Inserta el lead en Supabase `leads_web` por REST con la *publishable key*
   (`origen='demo-reformas-electricidad'`, `sector='reformas-electricidad-fontaneria'`).
   El servicio va en `interes` y la zona dentro de `mensaje`.
2. Llama a `POST /functions/v1/reformas-notify`, que envía el WhatsApp al
   número de WhiteMoon vía CallMeBot.

La `apikey` de CallMeBot vive **solo** en los Secrets del proyecto Supabase
(`CALLMEBOT_APIKEY`, `WA_NUMBER`). Nunca en el JS del navegador.

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
