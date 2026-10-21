# WhiteMoon Reformas — demo de reformas, electricidad y fontanería

Demo de WhiteMoon Agencia IA. Empresa **ficticia**: sin precios, cifras, reseñas ni casos inventados.

**Producción:** https://nexusforgeia.github.io/WHITEMOON-REFORMAS-ELECTRICIDAD/

- HTML/CSS/JS vanilla, GitHub Pages. Frontend heredado de la demo de clínicas dentales (capa holográfica CSS, `holo.js`), paleta pizarra + ámbar.
- Asistente **Dani** (`assets/js/watio.js`): servicio → zona → día → hora → nombre → teléfono. La rama de urgencias salta el calendario y ofrece llamar. Guarda en Supabase `leads_web` (`origen='demo-reformas-electricidad'`, `sector='reformas-electricidad-fontaneria'`; servicio en `interes`, zona en `mensaje`) y avisa por Telegram con `reformas-notify`.
- El aviso va por `fetch` con JSON (la función parsea con `req.json()`); con la clave publishable en cabeceras. Secretos de Telegram solo en Supabase Secrets.
- Despliegue de la función: `supabase functions deploy reformas-notify --project-ref mlaqtniujnvfxcvcourm --no-verify-jwt`.
- Fotos: ver `CREDITS.md`. Local: `python3 -m http.server`.
