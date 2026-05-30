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

## v1.4 — Autenticación de usuarios

- **Login con Google y email/contraseña:** implementado via Supabase Auth + SDK JS (CDN). Pantalla de login con `src/auth/userAuth.js` (servicio) y `src/auth/loginScreen.js` (UI). Estilos en `styles/auth.css`.
- **Flujo: grupos primero, login después:** el selector de grupos se muestra sin requerir login. Al elegir un grupo sin sesión activa, aparece el login como overlay. Tras autenticarse, recarga y entra al grupo automáticamente. Razón: el login sin contexto ("¿para qué me logueo?") era confuso.
- **voter_key reemplazado por user.id:** los nuevos votos usan el `user.id` de Supabase en lugar del UUID anónimo por dispositivo. Votos históricos (voter_key anónimo) se conservan intactos. Implementado en `playerRatingsService` via `setCurrentUserId()`.
- **PIN de grupos eliminado:** con login implementado, el PIN era redundante. Los grupos son abiertos a cualquier usuario logueado (estado transitorio hasta implementar membresía).
- **Avatar de usuario en topbar:** foto de perfil de Google (o iniciales) visible en el topbar cuando hay sesión activa. Desaparece al cerrar sesión.
- **"Cerrar sesión" unificado con Exit:** el botón ahora hace signOut + limpia grupo guardado + recarga. Vuelve al selector de grupos.
- **Mejor gol opcional:** el campo "Mejor gol" al confirmar un partido ya no es obligatorio — se puede guardar resultado sin seleccionarlo.
- **Etiqueta "Centro" → "Medio"** en el radar chart de rating.
- **Auth screen como modal contextual:** fondo con imagen del estadio (igual que el selector de grupos). Muestra el logo y nombre del grupo seleccionado en vez del branding genérico. Botón "← Volver" para cancelar y volver al selector. Sin card container — elementos directamente sobre el fondo, consistente con "Crear nuevo grupo".
- **PIN eliminado de "Crear nuevo grupo":** campos PIN y Confirmar PIN removidos del formulario. La columna `pin_hash` queda en la tabla `groups` con valor NULL para grupos nuevos (limpieza pendiente).
- **Fix loop infinito de recargas post-login:** `onAuthStateChange` de Supabase se dispara múltiples veces (SIGNED_IN, INITIAL_SESSION, TOKEN_REFRESHED). Flag `appStarted` en `initWithAuth` garantiza que `location.reload()` solo se ejecuta una vez.
- **Error handling en carga de grupos:** si Supabase falla al cargar grupos, muestra "No se pudo conectar al servidor" + botón Reintentar en lugar de quedarse en estado vacío.
- **Flatpickr crash en mobile corregido:** `fp.calendarContainer` es `undefined` en modo nativo (mobile). Agregado guard `if (!fp.calendarContainer) return` en `onReady`.

## v1.7 — Fix RLS round 2 + hydratación de votos por cuenta

### Fix RLS `group_members` (políticas acumuladas)
- **Problema:** al hacer drop + recreate de políticas en v1.6, las viejas nunca se borraron. Quedaron 10 políticas activas en simultáneo, incluyendo dos con queries recursivas (`EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = group_members.group_id ...)`). PostgreSQL evalúa todas las policies con OR — si una entra en loop, el server devuelve HTTP 500 aunque otra sea válida.
- **Causa específica:** `"miembros pueden ver su grupo"` (SELECT) y `"admin puede actualizar estado"` (UPDATE) hacían subquery sobre `group_members` dentro de una policy de `group_members` → recursión infinita. También había un `"read_all"` con `USING (true)` que exponía todas las filas sin autenticación.
- **Fix:** drop de las 10 políticas existentes + recrear solo las 5 limpias. La regla a seguir: siempre hacer drop all + recreate en un solo script, nunca agregar encima.
- **Política `admin delete` agregada:** faltaba política DELETE para que los admins puedan expulsar miembros.

### Fix overlay selector de grupos (scroll escapado)
- **Problema:** al hacer "Cerrar sesión" o "Cambiar de grupo", el overlay del selector usaba `position: absolute` → relativo al documento. Si la página estaba scrolleada, el overlay aparecía arriba pero el contenido de la app seguía siendo scrolleable por debajo.
- **Fix:** cambiado a `position: fixed; inset: 0` en `index.html`. Cubre exactamente el viewport sin importar el scroll. Se eliminó `min-height: 100vh` (redundante con `inset: 0`).

### Fix "Editar" vs "Calificar" entre browsers (hydratación desde servidor)
- **Problema raíz:** el estado de "ya voté" vivía exclusivamente en `localStorage` (`fobal5_voted_players`). Cada browser tiene su propio localStorage → en un segundo browser, todos los jugadores mostraban "Calificar" aunque el usuario ya hubiera votado desde otra sesión.
- **Problema adicional (pre-login):** antes del login, cada browser generaba un UUID anónimo en localStorage como `voter_key`. Un mismo usuario podía votar múltiples veces al mismo jugador desde distintos browsers, generando duplicados que sesgaban los promedios comunitarios.
- **Solución — `hydrateVotedPlayersFromServer()`:** al cargar jugadores, si el usuario está autenticado, se hace una query bulk a `player_ratings` filtrando por `voter_key = auth.uid()` y `group_id`. Los IDs retornados se marcan como votados en localStorage. Si el usuario no está autenticado, cae al flow anterior de `reconcileLocalVotesWithServer`.
- **`getRatedPlayerIds(voterKey)` en `client.js`:** nuevo método usando `SupabaseClient` (no raw fetch) para respetar RLS y auth. Query: `player_ratings?select=player_id` con filtro por `voter_key` y `group_id`.
- **Fix path `adminPlayersController`:** `fetchPlayers` tenía un early return cuando `adminPlayersController` estaba activo, saltando la hydration. Corregido para correr hydrate + reconcile en ambos paths.
- **Limpieza de datos históricos:** se eliminaron todos los registros de `player_ratings` (34 voter_keys distintos, todos anónimos de sesiones de testing). A partir de ahora los votos quedan ligados al `auth.uid` del usuario — consistentes entre browsers y dispositivos.

## v1.6 — Revisión de código + fixes de coherencia UX

### Fix RLS en `group_members` (causa raíz resuelta)
- **Problema:** `FobalApi` usaba `fetch` directo con JWT manual en `Authorization`. Supabase devolvía HTTP 500 con cualquier política RLS activa — el JWT se pasaba bien pero PostgREST no lo validaba correctamente en ese contexto.
- **Solución:** `supabaseClient` (creado dentro del IIFE de `userAuth.js`) se expone como `window.SupabaseClient`. Los métodos de `group_members` en `client.js` (`getMembership`, `requestMembership`, `addGroupMember`, `getPendingMembers`, `updateMemberStatus`) se reescribieron para usar `window.SupabaseClient.from(...)` en vez de `fetch` directo. El Supabase JS client maneja el JWT y la sesión automáticamente, lo que permite habilitar RLS correctamente.
- **Estado RLS:** habilitado. Políticas activas en producción (ver abajo). Código deployado en Vercel.

### Políticas RLS de `group_members`
El problema de la query recursiva se resolvió con una función `SECURITY DEFINER`. Las políticas que hacían `WHERE user_id = auth.uid() AND role = 'admin'` sobre la misma tabla `group_members` causaban loop infinito → 500. La función corre con permisos del owner de la DB, bypasseando RLS para esa verificación puntual.

```sql
CREATE OR REPLACE FUNCTION is_group_admin(gid uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = gid AND user_id = auth.uid() AND role = 'admin' AND status = 'approved'
  );
$$;

-- SELECT: usuario ve su propio registro O admin ve todos los del grupo
CREATE POLICY "own membership"    ON group_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin see members" ON group_members FOR SELECT TO authenticated USING (is_group_admin(group_id));
-- INSERT: cualquier usuario autenticado puede insertar su propio registro
CREATE POLICY "insert own"        ON group_members FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
-- UPDATE: solo admins del grupo
CREATE POLICY "admin update"      ON group_members FOR UPDATE TO authenticated USING (is_group_admin(group_id));
```

### Fix: creador de grupo no veía el botón "Miembros"
- `submitCreateGroup` llamaba a `enterGroup(newGroup)` sin setear `currentUserMembership`. Como `enterGroup` muestra el botón "Miembros" solo si `currentUserMembership?.role === "admin"`, el creador nunca lo veía. Fix: se setea `currentUserMembership = { role: "admin", status: "approved" }` antes de llamar `enterGroup`.

### Fix: `membersBtn` no cerraba el menú
- El handler de `membersBtn` hacía `classList.remove("open")` pero el menú usa la clase `"is-open"`. Corregido a `closeTopbarMenu()`.

### UX: "Cerrar sesión" y nuevo "Cambiar de grupo"
- **Problema de coherencia:** "Cerrar sesión" hacía `window.location.replace(urlSinGrupo)` — podía fallar en iOS PWA (abre Safari en vez de navegar dentro de la app), y dejaba al usuario sin una ruta clara de vuelta al selector de grupos.
- **"Cerrar sesión" mejorado:** ya no usa `location.replace`. Ahora: limpia el grupo guardado, actualiza la URL con `history.replaceState` (sin recarga), oculta el botón "Miembros", cierra sesión en Supabase y muestra directamente `window.__showGroupSelector()`. Si el usuario selecciona un grupo → ve la pantalla de login (sin sesión). Al loguearse, `onAuthStateChange` detecta que el auth-screen está visible y ejecuta `location.reload()` para reinicializar con la nueva sesión.
- **"Cambiar de grupo" (nuevo):** botón en el menú del topbar (entre "Miembros" y "Configuración del grupo"). Llama a `window.__showGroupSelector()` sin cerrar sesión. Si el usuario tiene membresía en otro grupo, entra directo. Resuelve el caso donde querías cambiar de grupo sin tener que desloguearte.

## v1.5 — Sistema de membresía (implementado)

### Base de datos
- **Tabla `group_members`:** `group_id`, `user_id`, `role` (admin/member), `status` (pending/approved/rejected), `created_at`, `user_email`, `user_name` (para mostrar en panel de admin sin JOIN). RLS deshabilitado (ver nota abajo).
- **Columna `created_by`** en tabla `groups` (referencia a `auth.users`).
- **Admin inicial:** para grupos existentes (Futbol Foca, MonkeyTest), el usuario `aregaarrospide@gmail.com` fue insertado manualmente como `role=admin, status=approved`.
- **RLS deshabilitado en `group_members`:** se intentaron múltiples políticas (`TO authenticated USING (true)`, `USING (true)`, sin restricción de rol) pero Supabase devolvía HTTP 500 en todos los casos. La causa probable es que `FobalApi` usa `fetch` directo contra la REST API de Supabase en vez del Supabase JS client — el JWT se pasa manualmente en el header `Authorization` pero algo en la validación del proyecto falla. El Supabase JS client (que sí usa `UserAuth`) maneja RLS correctamente. **Solución de raíz pendiente:** mover `getMembership` y los métodos de `group_members` al Supabase JS client en vez de fetch directo. Por ahora RLS permanece deshabilitado — los datos de membresía no son sensibles en este contexto.

### Flujo implementado
- `resolveGroup(group)` verifica membresía antes de llamar `enterGroup()`:
  - **Sin membresía** → pantalla "Solicitar acceso"
  - **Status pending** → pantalla "Tu solicitud está pendiente"
  - **Status approved** → entra al grupo normal
- **Pantalla "Solicitar acceso":** mismo estilo visual que el login (fondo cancha, logo del grupo). Botón inserta fila en `group_members` con `status=pending`, guardando `user_email` y `user_name` del usuario autenticado.
- **Al crear un grupo:** el creador se inserta automáticamente en `group_members` como `role=admin, status=approved`.
- **Panel de miembros (solo admins):** botón "Miembros" aparece en el menú del topbar solo si el usuario es admin del grupo activo. Muestra badge rojo con cantidad de solicitudes pendientes. Modal lista solicitudes con nombre/email del solicitante y botones Aprobar / Rechazar.

### Fixes técnicos
- **Race condition auth/grupos:** los dos IIFEs (`init` de grupos e `initWithAuth`) corren en paralelo. Si `getMembership` se ejecutaba antes de que `initWithAuth` seteara el JWT, la query llegaba con el anon key. Fix: `authReadyPromise` — `resolveGroup` hace `await authReadyPromise` antes de verificar membresía. `initWithAuth` resuelve la promise después de obtener la sesión.
- **`window.__showGroupSelector` no disponible al volver:** la función se definía dentro del bloque `if (overlay && list)` al que solo se llegaba si no había grupo guardado. Al presionar "Volver" desde "Solicitar acceso", la función era `undefined`. Fix: `renderGroupList` y `window.__showGroupSelector` se definen al inicio del IIFE, antes de cualquier `return`.
- **`const overlay` redeclarado:** al mover las definiciones al inicio del IIFE quedó una declaración duplicada en el bloque "Mostrar selector". Eliminada.
- **`pinInput is null`:** al abrir "Crear nuevo grupo", el código intentaba hacer `.value = ""` sobre elementos DOM que ya no existen (fueron eliminados del HTML). Eliminadas las dos líneas.

### Token JWT en FobalApi
- `FobalApi.setUserToken(token)` — nuevo método. Cuando hay sesión activa, `initWithAuth` pasa `session.access_token` para que las queries a Supabase usen el JWT del usuario en vez del anon key. Se actualiza en cada `onAuthStateChange`.

### Visual del login
- Botón "← Volver" movido al pie del card, ancho completo, estilo consistente con "Crear nuevo grupo" (borde sutil, fondo transparente).
- Botón "Iniciar sesión" corregido: le faltaba la clase base `btn` → `font-weight: 600` no se aplicaba.

## v1.3 — Cambios recientes

- **Ícono PWA corregido (Safari/iOS):** el `apple-touch-icon` y el `rel="icon"` del HTML apuntaban a `futbolFoca.png`. Safari ignora el `manifest.json` y usa exclusivamente esas etiquetas para el ícono de la app instalada. Corregido a `FaltaUnoVerde.png`.
- **Modal Info App:** reemplazado emoji ⚽ por imagen `FaltaUnoLogoIntro.png`; eliminados título y versión redundantes debajo del logo.
- **Sliders en mobile:** área táctil del thumb era de 6px (el height del input), imposible de agarrar en touch. Solución: input a `height: 44px` con `background: transparent`, track via `::-webkit-slider-runnable-track` a 6px, gradiente de color pasado como CSS variable `--track-gradient` seteada desde JS con `setProperty` (en vez de `el.style.background`).
- **Emparejamiento con variedad:** el algoritmo evalúa las 252 combinaciones posibles (5v5), toma los 15 mejores por costo y elige uno al azar — los equipos varían partido a partido sin perder el balance.
- **Co-ocurrencia para evitar repetir equipos:** reemplaza el filtro de "último partido". Ahora se leen los últimos 5 partidos jugados del localStorage y se construye un mapa de pares con decaimiento (partido más reciente peso 5, el más antiguo peso 1). Ese mapa se suma al costo de cada combinación candidata con factor 0.1 — los pares que jugaron juntos recientemente quedan penalizados en el ranking sin romper el balance matemático.
- **Tabla General movida a Historial:** removida del menú hamburguesa y del bottom nav. Ahora es la tercera opción del toggle dentro de Historial (`Lista | Calendario | Tabla`). `view-trajectory` eliminada como sección independiente; el chart vive en `#historyTrajectoryContainer` dentro de `view-history`. El body class `view-trajectory` (efecto teal en bottom nav, dark mode) se aplica/remueve desde `renderHistory()` según el modo activo.
- **MVP renombrado a Mejor gol:** solo cambian los textos visibles al usuario (`Mejor gol: Puntín` en cards, labels de selects, toasts y alerts). Los nombres de campo internos (`mvp`, `mvp_name`, `mvpVotes`, etc.) en Supabase, localStorage y código quedan intactos para no romper datos existentes.
- **Drag de sliders en mobile:** agregado `touch-action: none` al slider para que el browser no interprete el arrastre horizontal como scroll del modal. Sin esto, el click funcionaba pero el drag no.
- **Espaciado entre sliders reducido:** `margin-bottom` del `.slider-group` bajado a `-8px` para compensar el espacio interno del input de 44px.
- **Radar removido del modal de votación:** el radar en tiempo real dentro del modal de calificación ocupaba la mitad de la pantalla sin aportar info real (valores en 0 por defecto). Queda solo en el rating global donde muestra datos consolidados.
- **Modal de votación rediseñado:** título centrado en el header con acción + nombre del jugador (`Calificar Nombre` / `Editar Nombre`). Botón de guardar simplificado a `Guardar` (en vez de repetir el nombre). Botón en tarjeta: `CALIFICAR` (sin emoji, primera vez) / `✏️ EDITAR` (con lápiz, ya calificado).
- **Modal no se cierra al guardar:** al guardar una calificación el modal permanece abierto. El título cambia a "✓ Guardado" en verde por 1.5s y luego a "Editar Nombre", permitiendo seguir calificando otros jugadores con las flechas < > sin reabrir el modal.
- **Estrella de acceso rápido al rating:** en el header del modal de calificación aparece una estrella a la izquierda. ⭐ amarilla si el jugador tiene 3+ votos (abre el modal de rating global al clickear), ☆ gris si tiene menos (indica pendiente). Usa `getPlayerCommunitySummary(playerId).votes` para determinar el estado.

## v1.2 — Cambios recientes

- **Vista Calendario en Historial:** toggle Lista/Calendario en la sección de historial. El calendario marca en verde los partidos pendientes y en rojo los jugados. Click en un día abre el card del partido directamente.
- **Flatpickr en selector de fecha/hora:** reemplaza el `<input type="datetime-local">` nativo (que en desktop se veía como campos de texto manuales) por un calendar picker consistente entre plataformas. Incluye soporte dark mode, hora editable en formato 24h, locale español y botón "Listo" para cerrar.

## v1.1 — Cambios recientes

- **Safe area PWA (iOS):** agregado `viewport-fit=cover` al meta viewport para que `env(safe-area-inset-bottom/top)` funcione correctamente en la app instalada. El topbar y el bottom nav ahora respetan el notch y la barra de inicio.
- **Modal "Nuevo jugador":** ahora incluye las 6 stats (Ataque, Defensa, Medio, Resistencia, Garra, Técnica) con sliders coloreados y valor inicial en 0, igual que el modal de edición.
- **Rename:** "Reportes" → "Sugerencias" en menú hamburguesa, título de modal y toast de error.
- **Jugadores sin votos:** reemplazado emoji ⏳ y texto "XX" por ☆ y "Pendiente" en la tarjeta del jugador.

---

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

- **⚠️ Google Maps — habilitar billing en GCP:** el autocomplete de cancha (`gmp-place-autocomplete`) requiere facturación activa en el proyecto de Google Cloud. Sin billing, todos los requests a Places API fallan con `BillingNotEnabledMapError`. Pasos: Google Cloud Console → proyecto de la key `AIzaSyBJn...` → Billing → vincular cuenta → verificar que estén habilitadas **Maps JavaScript API** y **Places API (New)**. El código ya fue migrado de `Autocomplete` (deprecado desde marzo 2025) a `PlaceAutocompleteElement`.
- Persistir promedio validado en `players` cuando un jugador alcance `>= COMMUNITY_MIN_VOTES` votos.
- Agregar una sección breve de "Parámetros y enlaces de Maps" con ejemplos de entrada/salida para facilitar mantenimiento.
- **Loading state global:** agregar spinner de carga y botón de reload en todas las secciones que dependen de la API (Jugadores, Historial, Tabla General). Previene que el usuario vea contenido vacío o sin estilos mientras Supabase responde.

## Decisión arquitectónica: reemplazar PIN por membresía

**Contexto:** con login implementado, pedir PIN al entrar a un grupo es redundante — son dos sistemas de seguridad que hacen lo mismo.

**Decisión:** eliminar el PIN de grupos. El acceso se controla por membresía: el creador del grupo aprueba quién puede entrar.

**Estado actual (transitorio):** PIN eliminado. Los grupos son abiertos para cualquier usuario logueado — cualquiera que tenga la app puede ver y entrar a cualquier grupo. Esto es temporal hasta implementar el sistema de membresía.

**Próximo paso — sistema de membresía:**
- Agregar tabla `group_members` en Supabase: `group_id`, `user_id`, `status` (pending / approved / rejected), `created_at`.
- Al elegir un grupo: verificar si el usuario tiene membresía aprobada.
  - Si tiene membresía → entra directo.
  - Si no → muestra pantalla "Solicitar acceso" con botón para enviar solicitud.
- Panel de admin del grupo: lista de solicitudes pendientes con botones Aprobar / Rechazar.
- El creador del grupo es automáticamente el primer miembro aprobado y el admin.
- Eliminar columna `pin_hash` de la tabla `groups` una vez migrado.

**Flujo de login fusionado con selector de grupo (implementado):**
- El selector de grupos se muestra primero, sin requerir login.
- Al elegir un grupo → si no está autenticado, se muestra el login.
- Una vez logueado → entra directo al grupo elegido.
- Razón: mostrar login antes del selector era raro — el usuario no tenía contexto de para qué se estaba logueando. Ahora el login tiene sentido ("estoy ingresando a Futbol Foca").

## Roadmap: Autenticación con Google (Gmail)

- Implementar login con Google OAuth via Supabase Auth.
- Supabase tiene el proveedor Google integrado; las credenciales de GCP ya están configuradas en el proyecto.
- Flujo: activar Google OAuth en Supabase dashboard → agregar botón "Continuar con Google" → reemplazar `voter_key` por `user.id` de Supabase en nuevos votos.
- **Migración de votos existentes:** los votos anteriores (con `voter_key` anónimo) se conservan como referencia histórica. No se migran ni eliminan — el cálculo de promedios considera ambos tipos.
- Base natural para implementar multi-grupo después (cada usuario ya tiene identidad).

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