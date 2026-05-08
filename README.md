# Fobal5

App web PWA para organizar partidos y equipos de fútbol 5.

## Features

- Gestión de jugadores con 6 stats (Ataque, Defensa, Medio, Resistencia, Garra, Técnica)
- Calificación comunitaria por dispositivo con radar chart
- Balanceo automático de equipos 5v5 por evaluación exhaustiva
- Historial de partidos con vista Lista y Calendario
- Votación de MVP por partido
- Tabla General con victorias históricas por jugador
- Dark / Light mode
- PWA instalable en móvil

## Stack

- Vanilla JS sin bundler
- Supabase (jugadores, ratings, partidos, feedback)
- Chart.js (radar chart, bar chart)
- Flatpickr (date/time picker)

## PWA — importante al hacer push

Actualizar la versión del cache en `sw.js` para que la app instalada descargue los nuevos archivos:

```js
const CACHE_NAME = 'fobal5-2026-05-07'; // <- cambiar en cada push
```

> Notas técnicas y changelog detallado en [DEVNOTES.md](DEVNOTES.md)
