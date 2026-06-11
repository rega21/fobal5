# Falta Uno 5

App web PWA para organizar partidos de fútbol 5 — jugadores, equipos, historial y estadísticas.

## Features

- **Grupos con membresía** — login con Google, solicitud de acceso, panel de admin para aprobar/rechazar miembros
- **Gestión de jugadores** con 6 stats (Ataque, Defensa, Visión, Resistencia, Garra, Técnica)
- **Calificación comunitaria** por usuario con radar chart en tiempo real
- **Balanceo automático de equipos 5v5** por evaluación exhaustiva de combinaciones con pesos por stat
- **Armado manual de equipos** con asignación por jugador
- **Historial de partidos** — vistas Lista, Calendario y Tabla General
- **Votación de mejor gol** por partido (ventana de 8hs)
- **Dark / Light mode**
- **PWA instalable** en móvil (Android y iOS)

## Stack

- Vanilla JS, sin bundler ni framework
- [Supabase](https://supabase.com) — base de datos, auth y RLS
- [Chart.js](https://www.chartjs.org) — radar chart y bar chart
- [Flatpickr](https://flatpickr.js.org) — date/time picker
- Google Maps Places API — autocomplete de ubicación de cancha

## Estructura

```
app.js                          # Lógica principal
src/
  api/client.js                 # FobalApi — wrapper de Supabase REST
  auth/                         # Login y sesión de usuario
  controllers/                  # adminPlayersController, matchController, historyController
  services/                     # playerRatingsService, voterTrackingService, mvpVotesService, ...
  views/                        # trajectoryView, trajectoryModal, playersView, ...
```

## PWA — importante al hacer push

Actualizar la versión del cache en `sw.js` para que los usuarios con la app instalada reciban los cambios:

```js
const CACHE_NAME = 'fobal5-2026-05-07'; // <- cambiar fecha/sufijo en cada push
```

Sin este cambio, la versión instalada no se actualiza hasta que el usuario cierre y reabra la app manualmente.
