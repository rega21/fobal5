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

## Pendiente

### PIN por grupo + RLS

Similar al PIN de admin existente. El flujo sería:

1. Usuario entra sin `?group=` → ve el selector de grupos
2. Elige su grupo → se le pide el PIN
3. PIN correcto → carga los datos, se guarda en `sessionStorage` para no pedirlo en cada recarga
4. PIN incorrecto → no accede

Implementación:
- Columna `pin_hash` en la tabla `groups` (hasheado, no texto plano)
- Validación contra Supabase antes de setear el `group_id`
- Con el PIN validado se puede habilitar RLS real usando un token de sesión con `group_id` como claim

Sin PIN, RLS no aporta seguridad real porque toda la app usa la misma anon key — Supabase no puede distinguir de qué grupo viene cada request.

### ~~insertPlayerRatingLimited (RPC)~~ — COMPLETADO
Función SQL actualizada para aceptar `p_group_id DEFAULT NULL`. El cliente pasa `activeGroupId` en cada llamada.

### Imagen/logo por grupo
El selector actual muestra solo el nombre. Si se quiere mostrar un logo por grupo, habría que agregar una columna `logo_url` a la tabla `groups`.

---

## Para agregar un nuevo grupo

1. Insertar en Supabase:
```sql
INSERT INTO groups (name, slug) VALUES ('Nombre del grupo', 'slug-corto');
```

2. Compartir la URL con el grupo:
```
fobaAmigo5.vercel.app?group=slug-corto
```

No hay más pasos — la app ya está preparada para manejarlo.
