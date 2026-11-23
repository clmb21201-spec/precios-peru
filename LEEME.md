# Precios del Perú: cómo publicarlo en Cloudflare

Esta carpeta contiene la web completa:

- **Visualizador** (`https://TU-DIRECCIÓN/`): todas las pantallas abiertas ven lo mismo. Si alguien elige una ciudad, cambia de página o de filtro, el cambio aparece en todas las demás.
- **Lector** (`https://TU-DIRECCIÓN/lector`): cada persona lo usa por su cuenta, sin afectar a nadie.
- **Robot**: consulta el SISAP del Midagri a las 9:00, 11:00, 12:00 y 15:00 (hora de Lima). Toma el precio mayorista promedio de las 28 ciudades y guarda la lista del día. Si un precio sale en blanco en una consulta, lo vuelve a buscar en la siguiente. Cada ciudad se compara solo con el día anterior; si ese día no hubo precios, o si el producto cambió de unidad, no se muestra comparación.

## Publicar desde GitHub (sin terminal)

1. Entra a Cloudflare → **Workers & Pages** → **Create** → **Import a repository** (Importar un repositorio).
2. Conecta tu cuenta de GitHub si lo pide y elige el repositorio **precios-peru**.
3. Deja todo como viene y pulsa **Deploy** (Implementar). Cloudflare lo publica solo y te muestra la dirección, algo como `https://precios-peru.TU-CUENTA.workers.dev`.
4. **Primera carga de precios:** abre una vez `https://precios-peru.TU-CUENTA.workers.dev/api/actualizar`. En dos o tres minutos ya habrá precios. Desde ahí el robot trabaja solo.

Cada vez que se suba un cambio al repositorio, Cloudflare vuelve a publicar la web automáticamente.

## Publicar desde tu computadora (alternativa)

Instala Node.js (nodejs.org, «LTS»), abre una terminal dentro de esta carpeta y escribe `npm install`, luego `npx wrangler login` y luego `npx wrangler deploy`.

## Direcciones

| Para qué | Dirección |
|---|---|
| Visualizador sincronizado | `https://precios-peru.TU-CUENTA.workers.dev/` |
| Lector independiente | `https://precios-peru.TU-CUENTA.workers.dev/lector` |
| Ver cuándo corrió el robot | `https://precios-peru.TU-CUENTA.workers.dev/api/estado-robot` |
| Forzar una revisión (máx. una cada 10 min) | `https://precios-peru.TU-CUENTA.workers.dev/api/actualizar` |

## Si algo falla

- **El robot no trae precios:** revisa `/api/estado-robot`. Si en Cloudflare (Workers → precios-peru → Logs) aparece «exceeded CPU», el plan gratuito se quedó corto. El plan Workers Paid (5 dólares al mes) lo resuelve.
- **Para cambiar algo y volver a publicar:** edita los archivos y ejecuta otra vez `npx wrangler deploy`.

## Nota sobre el SISAP

El archivo robots.txt del SISAP pide no ser consultado por programas automáticos. El robot hace pocas consultas (28 ciudades, 4 veces al día) y la web cita siempre la fuente, pero conviene que el área legal lo apruebe o que se le pidan los datos directamente al Midagri.

Fuente: SISAP – Midagri · Elaboración: ECData, Economía y Núcleo Audiovisual.
