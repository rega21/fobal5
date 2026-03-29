# Fobal5

App web para organizar partidos y equipos de fútbol 5.

## Changelog (demo comunitaria)

- Se implementó calificación comunitaria de jugadores con tabla `player_ratings` en Supabase.
- Cada usuario vota por dispositivo (`voter_key`) con `upsert` para evitar duplicados por jugador.
- Estado visual por jugador: `🗳️ Voto pueblo (N/5)` y `✔ Validado` (configurable con `COMMUNITY_MIN_VOTES`).
- Modal adaptado por contexto:
  - Usuario comunidad: `Calificar jugador`.
  - Jugador ya validado: `Actualizar jugador`.
  - Admin: `Editar jugador`.
- Regla de seguridad al guardar: si Ataque, Defensa y Medio son `0`, se muestra confirmación antes de persistir.
- Integración de `players` migrada a Supabase (con fallback), manteniendo `matches` como estaba.
- Sincronización de jugadores entre MockAPI y Supabase completada.
- Lógica actual: base en `players`; promedio comunitario calculado desde `player_ratings` y mostrado en UI al validar.
- Se removió el título superior de la sección de jugadores para limpiar el layout; navegación queda en tabs inferiores.
- Botones de sección jugadores en español (`Buscar`, `Agregar`) y alineados a la derecha.
- Header actualizado con menú hamburguesa (`☰`) y opciones: `Admin`, `Reportes o Mejoras`, `Info App`.
- Animaciones e interacción del menú mejoradas (apertura con `opacity/translateY`, hover sutil en desktop y `active` con ligera compresión).
- Feedback desacoplado en `feedbackService` con validaciones (mínimo de mensaje), cooldown local y honeypot anti-spam.
- Manejo de links de Maps robustecido para historial: se parsea `query` en URL para generar enlaces compatibles móviles cuando aplica.
- Balanceo de equipos actualizado: se reemplazó el greedy por evaluación exhaustiva `5v5` (todas las combinaciones), con score ponderado por rol (`Ataque 0.45`, `Medio 0.30`, `Defensa 0.25`) y costo de balance por línea para reducir acumulación de perfiles similares en un mismo equipo.

## 6 Stats + Radar Chart

- Se agregaron 3 stats nuevos a `player_ratings` en Supabase: `stamina`, `garra`, `technique` (tipo `int2`).
- La función RPC `insert_player_rating_limited` fue actualizada para aceptar los 6 parámetros y usa `ON CONFLICT (player_id, voter_key) DO UPDATE` (UPSERT), permitiendo actualizar el voto existente.
- La vista `player_ratings_with_player` usa `COALESCE(stat, 0::smallint)` en todos los campos para compatibilidad con votos anteriores (que tienen `NULL` en los 3 nuevos stats).
- El cálculo de promedio general (`avgOverall`) aplica **Opción A**: divide solo por la cantidad de stats con votos reales, preservando el rating de votos antiguos que solo tienen 3 stats.
- Stamina, Garra y Técnica requieren mínimo **3 votos** para mostrarse con valor; si no los alcanzan, aparecen como `(–)` en el radar.
- Se implementó detección automática de rol por ponderación de stats: **Delantero**, **Defensor**, **Mediocampista**, **Extremo**, **Todoterreno**. El rol se muestra como badge con color en el modal de rating.
- Modal de rating rediseñado con fondo oscuro (`#1a1a2e`) y radar chart (Chart.js CDN) con etiquetas que incluyen el valor numérico directamente (`Ataque (7.2)`).

## UX: Radar como protagonista

- Se eliminó el badge de rol (Mediocampista / Delantero / etc.) del modal de rating; el radar comunica el perfil del jugador visualmente sin necesidad de etiqueta.
- Se eliminaron las barras de stats (`stat-bars`) del modal de rating; el radar ocupa todo el espacio y es el elemento central. Las barras quedaron comentadas en el código para poder reactivarlas si se quiere retroceder.
- Se eliminaron los valores numéricos de las etiquetas del radar (`Ataque (7.2)` → `Ataque`): el score global ya aparece en el header del modal con la estrella, y los números sobre el radar distraían de leer la forma del jugador.
- El radar se agrandó progresivamente al liberar espacio (320→360→400px ancho, 270→320→380px alto).

## UX: Modal de votación y rating rediseñados

- Modal de votación (`editPlayerModal`) con fondo oscuro unificado.
- Radar chart en tiempo real dentro del modal de votación: se actualiza al mover cada slider y cambia de color según el stat dominante.
- Sliders con color individual por stat (thumb + track): Ataque rojo, Defensa cyan, Medio verde, Stamina/Garra dorado, Técnica violeta.
- Identidad del jugador separada del modal de votación: click en el nombre de la tarjeta abre un mini modal de edición (`identityModal`).
- Modal de rating (`ratingDetailsModal`) con barras de colores por stat + radar chart coloreado por stat dominante.
- Sistema de colores consistente (`STAT_COLORS`) compartido entre radares, sliders y barras.

## Estado actual

- `players`: fuente base (atributos iniciales).
- `player_ratings`: votos comunitarios por jugador/usuario-dispositivo.
- El promedio comunitario se calcula al vuelo en frontend.
- `N/5` representa solo votos comunitarios (no reemplaza ni borra los stats base del jugador).
- `feedback`: creación en Supabase vía `createFeedback` + servicio cliente con control de envío.

## Pendiente: promedio con 6 stats

Cuando Stamina, Garra y Técnica tengan suficientes votos consolidados (umbral actual: 4), el promedio general deberá incluir los 6 stats dividiendo solo por los que tienen valor real (no `null`), para mantener compatibilidad con jugadores con votos viejos.

Orden de peso propuesto para fútbol 5 (espacios reducidos):
1. **Ataque** — lo más visible y valorado
2. **Garra** — intensidad y cuerpo en cancha chica
3. **Técnica** — el enganche, la elección, el regate en espacio reducido
4. **Medio** — distribución y control del partido
5. **Stamina** — menos determinante en cancha chica que en fútbol 11
6. **Defensa** — importante pero menos "glamoroso" en el formato

## PWA (Progressive Web App)

Implementada. La app se puede instalar en el celular como app nativa desde Chrome/Edge/Safari.

**Archivos clave:**
- `manifest.json` — nombre, colores, ícono
- `sw.js` — service worker con cache de assets estáticos
- `icons/futbolFoca.png` — logo light mode
- `icons/futbolFocapt2.jpg` — logo dark mode (se swapea automáticamente)

### ⚠️ Importante: cada vez que se hace push con cambios

Hay que actualizar la versión del cache en `sw.js` para que la app instalada descargue los nuevos archivos:

```js
// sw.js — línea 1
const CACHE_NAME = 'fobal5-2026-03-27b'; // <- cambiar fecha/sufijo en cada push
```

Sin este cambio, los usuarios con la app instalada siguen viendo la versión vieja hasta que cierren y abran la app manualmente.

## Próximo paso recomendado

- Persistir promedio validado en `players` cuando un jugador alcance `>= COMMUNITY_MIN_VOTES` votos.
- Agregar una sección breve de "Parámetros y enlaces de Maps" con ejemplos de entrada/salida para facilitar mantenimiento.

## Roadmap: Escalabilidad multi-grupo

La app está pensada actualmente como grupo único (FutbolFoca). Para escalar a múltiples grupos independientes, se contemplan dos etapas:

### Etapa 1: Multi-grupo administrado (grupos creados manualmente)
- Crear tabla `groups` en Supabase con: id, nombre, slug/código, admin_pin, created_at.
- Agregar columna `group_id` a: `players`, `matches`, `player_ratings`, `feedback`.
- Implementar selector de grupo al inicio de la app (dropdown o búsqueda).
- Login por grupo: seleccionar grupo → ingresar PIN del grupo → acceder a datos del grupo.
- Filtrar todas las queries por `group_id` en [src/api/client.js](src/api/client.js).
- Alcance: vos creas los grupos manualmente en Supabase; usuarios eligen grupo + PIN para operar.

### Etapa 2: Crear grupo (auto-creación por usuario)
- Pantalla inicial con opciones: "Crear mi grupo" o "Unirme a un grupo existente".
- Crear grupo: usuario elige nombre + PIN propio → se genera entrada en `groups` → accede a grupo vacío.
- Unirse a grupo: elegir grupo + ingresar PIN → acceder a datos del grupo.
- Permisos iguales para todos los usuarios dentro de un grupo; solo admin (con PIN) puede borrar historial.
- No requiere tabla de membresías ni permisos por rol; el PIN del grupo actúa como credencial.

**Nota**: La etapa 1 valida que el modelo de datos aisle correctamente; la etapa 2 agrega creación autónoma sin cambios arquitectónicos mayores.



# Migración de matches a Supabase

- `matches` migrado de MockAPI a Supabase con schema extendido: `status`, `location`, `address`, `scheduled_at`, `place_id`, `maps_url`, `latitude`, `longitude`, `date_display`, `mvp_name`, `mvp_voting_ends_at`, `mvp_votes`, `notes`.
- `match_players` extendido con columnas `name` y `nickname` para evitar JOIN con `players` (sin FK declarada).
- `getMatches` usa dos queries en paralelo (`matches` + `match_players`) y merge en JS.
- `createMatch` y `updateMatch` escriben a ambas tablas; `deleteMatch` limpia `match_players` antes de borrar el match.
- Mapeo bidireccional en `client.js`: camelCase (app) ↔ snake_case (Supabase).
- Fecha formateada desde `scheduled_at` con locale fijo `es-UY` (DD/MM/YYYY, 24hs) para consistencia entre OS.
- Orden: `played_at desc nullslast, scheduled_at desc nullslast` — partidos jugados primero, pendientes por fecha programada.
- Fallback MockAPI mantenido para entornos sin Supabase.

# Tabla General (ex Trayectoria)

- Accesible desde el menú hamburguesa → "Tabla General".
- Bar chart horizontal (Chart.js + `chartjs-plugin-datalabels`) con victorias totales por jugador, ordenadas de mayor a menor.
- Gradiente en barras: dark mode `#008B8B → #1a3a4a`, light mode `#008B8B → #4BC0C0`.
- Estrella ☆ en el nombre del líder; jugadores con 0 victorias incluidos en el chart con label `0`.
- Agrupación por `player.id` para evitar duplicados cuando el mismo jugador tiene nombre y apodo distintos en partidos distintos.
- Efecto de borde gradiente teal + estela en el bottom nav, solo en dark mode al estar en esta vista (clase `body.view-trajectory`).
- Implementado en `src/views/trajectoryView.js`; sólo considera partidos con `status === "played"` y score definido.

## Modal de estadísticas por jugador

- Click en cualquier barra del chart abre un modal con las stats del jugador.
- Implementado en `src/views/trajectoryModal.js` (IIFE, expuesto en `window.TrajectoryModal`).
- Stats mostradas: Jugados, Ganados, Perdidos, Empates + barra de Win Rate con gradiente teal.
- Iconos: reloj (jugados), copa (ganados), escudo (perdidos), handshake Lucide (empates).
- **Nota:** la key interna del stat "Resistencia" sigue siendo `stamina` en el código para no romper datos existentes.

# Dark Mode

- Modo oscuro implementado con CSS variables (`[data-theme="dark"]` en `<html>`).
- Toggle en menú hamburguesa ("Modo Oscuro" / "Modo Claro"), sin iconos.
- Preferencia persistida en `localStorage` (`fobal5_theme`) y aplicada antes del primer render.
- Ítem "Rating Global" agregado al menú hamburguesa como punto de entrada alternativo al tap en la estrella.
- Cobertura de dark mode: topbar, cards, botones, modales, formularios, match setup, historial, asignación manual de equipos y sección de confirmación de partido.

# Límite de votos por jugador

- Implementado en backend (Supabase): máximo 3 votos por jugador cada 24hs por usuario (`voter_key`), via RPC `insert_player_rating_limited`.
- Al abrir el modal, el frontend consulta `checkVoteLimitReached` en `FobalApi`:
  - Si el límite fue alcanzado: botón de guardar en pestaña **Puntos** aparece deshabilitado con mensaje informativo.
  - Pestaña **Identidad**: botón siempre habilitado, independiente del límite.
- Al cambiar entre pestañas, el estado del botón se recalcula usando `currentEditReachedVoteLimit`.