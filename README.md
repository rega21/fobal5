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

## Estado actual

- `players`: fuente base (atributos iniciales).
- `player_ratings`: votos comunitarios por jugador/usuario-dispositivo.
- El promedio comunitario se calcula al vuelo en frontend.
- `N/5` representa solo votos comunitarios (no reemplaza ni borra los stats base del jugador).
- `feedback`: creación en Supabase vía `createFeedback` + servicio cliente con control de envío.

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