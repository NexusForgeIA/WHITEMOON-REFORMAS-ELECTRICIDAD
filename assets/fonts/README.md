# Fuentes autoalojadas

| Fichero | Familia | Subconjunto |
|---|---|---|
| `sora-latin.woff2` · `sora-latin-ext.woff2` | Sora (variable, 200–700) | latin · latin-ext |
| `space-grotesk-latin.woff2` · `space-grotesk-latin-ext.woff2` | Space Grotesk (variable, 400–700) | latin · latin-ext |

Ambas familias están publicadas bajo la **SIL Open Font License 1.1**, que
permite el uso, la modificación y la redistribución, incluida la
incorporación a una web. Los ficheros son los `woff2` que sirve Google
Fonts (Sora v17, Space Grotesk v22), descargados y servidos desde el
propio dominio.

Se autoalojan por dos motivos:

1. **CLS.** Con la hoja de Google Fonts cargada en asíncrono, la fuente
   llegaba después del primer pintado y el `swap` reflotaba el hero: en una
   medición de Lighthouse móvil eso costó 0,33 de CLS. Con el `woff2` en el
   mismo dominio y precargado, el texto se pinta ya con Sora.
2. **Latencia.** Se ahorran dos conexiones nuevas
   (`fonts.googleapis.com` para el CSS y `fonts.gstatic.com` para el
   `woff2`), que en móvil throttleado eran varios cientos de milisegundos.

Solo se precargan los subconjuntos `latin`; los `latin-ext` se piden únicamente
si alguna página necesita esos glifos.
