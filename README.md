# Fobal5

App web para organizar partidos y equipos de fútbol 5.

## Changelog (demo comunitaria)

- Se implementó calificación comunitaria de jugadores con tabla `player_ratings` en Supabase.
- Cada usuario vota por dispositivo (`voter_key`) con `upsert` para evitar duplicados por jugador.
- Estado visual por jugador: `🗳️ Voto pueblo (N/3)` y `✔ Validado`.
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

## Estado actual

- `players`: fuente base (atributos iniciales).
- `player_ratings`: votos comunitarios por jugador/usuario-dispositivo.
- El promedio comunitario se calcula al vuelo en frontend.
- `N/3` representa solo votos comunitarios (no reemplaza ni borra los stats base del jugador).
- `feedback`: creación en Supabase vía `createFeedback` + servicio cliente con control de envío.

## Próximo paso recomendado

- Persistir promedio validado en `players` cuando un jugador alcance `>= 3` votos.
- Agregar una sección breve de "Parámetros y enlaces de Maps" con ejemplos de entrada/salida para facilitar mantenimiento.