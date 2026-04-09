# Multi-grupos — Plan de implementación

## Contexto

Un usuario preguntó "¿puedo abrir otro grupo?" — lo que dispara la pregunta de si la app puede soportar múltiples grupos independientes (cada uno con sus propios jugadores, partidos y ratings).

## Por qué no un deploy separado

El plan free de Supabase permite solo 2 proyectos. Ya están usados. Un proyecto extra cuesta ~$25/mes, lo cual no tiene sentido para un grupo de amigos.

La solución es **multi-tenancy**: una sola app, una sola base de datos, múltiples grupos.

---

## Cómo funciona la UX

URL única: `fobaAmigo5.vercel.app`

- Entrás sin grupo y hay múltiples → pantalla de selección con botones de cada grupo
- Hacés click en tu grupo → la URL se actualiza y carga los datos de ese grupo
- Entrás con `?group=foca` → resuelve el grupo y carga directo, sin selector

---

## Estado de implementación

### ✅ 1. Supabase (base de datos) — COMPLETADO

```sql
-- Tabla de grupos
CREATE TABLE groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Columna group_id en todas las tablas
ALTER TABLE players        ADD COLUMN group_id uuid REFERENCES groups(id);
ALTER TABLE matches        ADD COLUMN group_id uuid REFERENCES groups(id);
ALTER TABLE player_ratings ADD COLUMN group_id uuid REFERENCES groups(id);
ALTER TABLE feedback       ADD COLUMN group_id uuid REFERENCES groups(id);

-- Datos existentes migrados al grupo "foca" (id: c490f831-bcbc-41ec-9cb9-40a0b3154cca)
UPDATE players        SET group_id = 'c490f831-bcbc-41ec-9cb9-40a0b3154cca';
UPDATE matches        SET group_id = 'c490f831-bcbc-41ec-9cb9-40a0b3154cca';
UPDATE player_ratings SET group_id = 'c490f831-bcbc-41ec-9cb9-40a0b3154cca';
UPDATE feedback       SET group_id = 'c490f831-bcbc-41ec-9cb9-40a0b3154cca';

-- NOT NULL para nuevos registros
ALTER TABLE players        ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE matches        ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE player_ratings ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE feedback       ALTER COLUMN group_id SET NOT NULL;
```

Grupo actual en la BD:
| name | slug | id |
|---|---|---|
| Futbol Foca | foca | c490f831-bcbc-41ec-9cb9-40a0b3154cca |

### ✅ 2. client.js — COMPLETADO

- `activeGroupId` — variable interna del IIFE, se setea con `setGroupId(id)`
- `FobalApi.setGroupId(id)` — nuevo método público para configurar el grupo activo
- `FobalApi.getGroupId()` — devuelve el grupo activo
- `FobalApi.getGroups()` — consulta la tabla `groups` (para el selector de UI)
- Todas las queries de lectura incluyen `&group_id=eq.X` cuando hay grupo activo
- Todas las operaciones de escritura incluyen `group_id` en el payload

**Pendiente en client.js:**
- `insertPlayerRatingLimited` usa una función RPC en Supabase — hay que actualizar la función SQL para que acepte y use `group_id`

### ✅ 3. app.js — COMPLETADO

El init ahora:
1. Lee `?group=foca` de la URL
2. Llama a `getGroups()` para resolver el `group_id`
3. Si hay un solo grupo → lo setea automáticamente (comportamiento actual)
4. Si hay múltiples grupos y no hay param en la URL → muestra el selector
5. Recién entonces llama a `fetchPlayers()` y `fetchMatches()`

### ✅ 4. UI selector de grupos — COMPLETADO

Overlay en `index.html` con id `groupSelectorOverlay`:
- Se muestra solo cuando hay múltiples grupos y no hay `?group=` en la URL
- Botones generados dinámicamente desde la BD
- Al elegir: setea el grupo, actualiza la URL con `?group=slug`, carga los datos

---

### ✅ PIN por grupo — COMPLETADO

- Columna `pin_hash text` en tabla `groups` (SHA-256 del PIN en mayúsculas)
- Modal de PIN aparece la primera vez que se entra a un grupo
- El PIN se normaliza a mayúsculas antes de hashear — el usuario puede escribir en cualquier capitalización
- Grupo autenticado se guarda en `localStorage` con key `fobal5_group` → próximas visitas entran directo
- Hash se valida en el cliente con `crypto.subtle.digest`

Para setear el PIN de un nuevo grupo:
```bash
# Obtener el hash SHA-256 del PIN (en mayúsculas)
echo -n "ELPIN" | sha256sum
```
```sql
UPDATE groups SET pin_hash = '<hash>' WHERE slug = 'slug-del-grupo';
```

---

## Pendiente

### RLS policies en otras tablas
`groups` ya tiene RLS habilitado (SELECT y INSERT públicos, UPDATE/DELETE bloqueados). El resto de las tablas (`players`, `matches`, `player_ratings`, `feedback`) siguen sin RLS — sin JWT no se puede filtrar por grupo a nivel de BD. La seguridad es a nivel de código.

### ~~insertPlayerRatingLimited (RPC)~~ — COMPLETADO
Función SQL actualizada para aceptar `p_group_id DEFAULT NULL`. El cliente pasa `activeGroupId` en cada llamada.

### ~~Imagen/logo por grupo~~ — COMPLETADO
Ver sección "Logo por grupo" más arriba.

### Voto automático al crear jugador — PARCIAL
Se intentó insertar un voto automático en `player_ratings` al crear un jugador (con los mismos valores de los sliders), para que el creador no tenga que votar dos veces. El `markPlayerAsVoted` funciona (muestra EDITAR tras recargar), pero el INSERT directo a `player_ratings` falla silenciosamente. Pendiente de investigar. Por ahora el creador ve VOTAR y puede votar normalmente.

---

## Flujo de onboarding para un nuevo grupo

### Primera vez
1. Usuario entra a `fobaAmigo5.vercel.app`
2. Ve el selector de grupos → elige el suyo (o crea uno nuevo)
3. Ingresa el PIN del grupo
4. Entra a la app con los datos de su grupo
5. El grupo queda guardado en `localStorage` → próximas visitas entran directo sin selector ni PIN

### Próximas visitas
- Entra directo a su grupo, sin selector ni PIN

### ✅ Crear un nuevo grupo — COMPLETADO

- Botón "+ Crear nuevo grupo" en el selector (dashed, secundario)
- Formulario: nombre, logo_url (opcional con preview en tiempo real), PIN, confirmar PIN
- Slug se genera automáticamente del nombre con `toSlug()` — el usuario no lo ve
- Al crear → INSERT en `groups` → auto-entra al grupo nuevo sin pedir PIN
- Cualquiera puede crear un grupo — el PIN protege el acceso entre grupos, no la creación
- Error claro si el slug ya existe (constraint UNIQUE en BD)

### ✅ Logo por grupo — COMPLETADO

- Columna `logo_url text` en tabla `groups` (nullable)
- Selector muestra logo circular de cada grupo (fallback: ⚽ genérico)
- PIN overlay muestra logo del grupo seleccionado
- Topbar actualiza el logo al entrar al grupo
- Foca tiene logo seteado vía `UPDATE groups SET logo_url = '...' WHERE slug = 'foca'`
- Formulario de creación acepta URL de imagen con preview instantáneo

### ✅ Navegación entre grupos — COMPLETADO

- "Salir del grupo" en el menú hamburguesa → borra localStorage y vuelve al selector
- "← Volver" en el overlay de PIN → regresa al selector sin entrar al grupo
- Selector siempre visible cuando no hay grupo guardado en localStorage
