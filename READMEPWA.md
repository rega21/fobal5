# PWA — Notas técnicas

## Cómo funciona la PWA

El archivo `sw.js` (service worker) cachea los assets estáticos para que la app funcione offline o con mala señal. El manifest (`manifest.json`) define el nombre, ícono y `start_url: "/"`.

## Persistencia del grupo activo

### El problema con iOS

En iOS, los PWAs instalados en la pantalla de inicio tienen su propio contenedor de storage **aislado del navegador**. WebKit puede limpiar ese storage entre sesiones, lo que provocaba que el usuario tuviera que elegir grupo y poner el PIN cada vez que abría la app.

### La solución

La autenticación del grupo se guarda en **dos lugares**:

1. `localStorage` — rápido, disponible inmediatamente
2. `document.cookie` con expiración de 1 año — más persistente en iOS PWA

Al cargar, `loadGroupFromStorage()` intenta primero `localStorage`; si está vacío, lee la cookie. "Salir del grupo" borra ambos.

```js
// Guardar (app.js)
function saveGroupToStorage(group) { ... }     // escribe localStorage + cookie
function loadGroupFromStorage() { ... }        // lee localStorage, fallback a cookie
function removeGroupFromStorage() { ... }      // borra ambos
```

## Actualizar el caché del service worker

Cuando se hacen cambios en `app.js`, `index.html` u otros assets, hay que actualizar el `CACHE_NAME` en `sw.js` para que las PWAs instaladas descarguen la versión nueva:

```js
// sw.js
const CACHE_NAME = 'fobal5-YYYY-MM-DD';  // cambiar la fecha al deployar
```

El service worker detecta el cambio de nombre, instala el nuevo caché y elimina el viejo automáticamente. Con `skipWaiting()` y `clients.claim()` el cambio se aplica en la misma sesión sin necesidad de cerrar la app.

## Flujo al abrir la PWA

```
Abrir PWA (start_url: "/")
    │
    ├─ ¿?group= en URL? → resolveGroup(grupo)
    │       ├─ ¿grupo en localStorage/cookie? → enterGroup() directamente
    │       └─ no → mostrar PIN overlay
    │
    └─ no → loadGroupFromStorage()
            ├─ hay grupo guardado → enterGroup() directamente (sin selector, sin PIN)
            └─ no hay → mostrar selector de grupos
```

## URL de producción

- **URL actual**: `faltauno5.vercel.app`
- **URL vieja**: `fobalfoca5.vercel.app` → redirige automáticamente (307) a la nueva
- **Proyecto en Vercel**: `faltauno5`
- **Nombre en manifest**: "Falta Uno"

### Historial de cambios de dominio
El proyecto originalmente se llamaba `fobalfoca5`. Al querer renombrarlo a `faltauno`, Vercel bloqueó ese subdominio al reservarlo internamente al cambiar el Project Name antes que el dominio. El orden correcto es: **primero cambiar el dominio, después el Project Name**. La URL quedó como `faltauno5.vercel.app`.

## Instalar la PWA en iOS

1. Abrir la URL en Safari
2. Compartir → "Agregar a pantalla de inicio"
3. Confirmar el nombre y tocar "Agregar"

No funciona desde Chrome ni Firefox en iOS (restricción de Apple — solo Safari puede instalar PWAs en iOS).
