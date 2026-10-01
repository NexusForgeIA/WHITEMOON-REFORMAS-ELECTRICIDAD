# Fuentes autoalojadas

| Fichero | Familia | Pesos | Subconjunto |
|---|---|---|---|
| `fraunces-600-latin.woff2` | Fraunces | 600 | latin |
| `sora-400-latin.woff2` · `sora-400-latin-ext.woff2` | Sora (variable) | 400–800 | latin · latin-ext |

Ambas familias están publicadas bajo la **SIL Open Font License 1.1**, que
permite el uso, la modificación y la redistribución, incluida la
incorporación a una web. Son los mismos `woff2` que usa la demo de
inmobiliarias, servidos desde el propio dominio: cero peticiones a Google Fonts.

Fraunces se usa solo en los titulares grandes (h1/h2) y solo existe el 600:
pedir 700 haría que el navegador lo engordara sintéticamente.

Sora es una fuente variable. En la demo de inmobiliarias los ficheros
`sora-400` … `sora-800` son **el mismo binario byte a byte**; aquí se sirve uno
solo y el `@font-face` declara `font-weight:400 800`, para que el navegador no
descargue cinco veces el mismo fichero.

Se precargan `sora-400-latin.woff2` y `fraunces-600-latin.woff2`, para que el
hero se pinte ya con su tipografía y el `swap` no lo reflote (CLS). El
`latin-ext` solo se pide si alguna página necesita esos glifos.
