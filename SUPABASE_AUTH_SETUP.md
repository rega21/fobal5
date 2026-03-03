# Supabase Admin Login Setup

## 1) Instalar Supabase CLI

- https://supabase.com/docs/guides/cli

## 2) Login y link del proyecto

```bash
supabase login
supabase link --project-ref TU_PROJECT_REF
```

## 3) Configurar secreto del PIN (solo backend)

```bash
supabase secrets set ADMIN_PIN=1989
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` se usa solo en `admin-feedback-list` para leer `feedback` de forma segura desde backend.

## 4) Deploy de la función

```bash
supabase functions deploy admin-login --no-verify-jwt
supabase functions deploy admin-feedback-list --no-verify-jwt
```

## 5) URL final para el frontend

La URL será:

`https://TU_PROJECT_REF.supabase.co/functions/v1/admin-login`

Copia esa URL en [src/api/authClient.js](src/api/authClient.js) en la constante `AUTH_LOGIN_URL`.

## 6) Probar

- Abre la app y entra como admin con tu PIN.
- Desde el menú, entra en `Reportes o Mejoras` para ver el listado de reportes como admin.
- Si falla, revisa logs:

```bash
supabase functions logs admin-login
supabase functions logs admin-feedback-list
```

## Nota de seguridad

- El PIN ya no queda hardcodeado en frontend.
- La validación vive en la función de Supabase.
- Para un nivel más alto, puedes devolver un token firmado y validar ese token en acciones de admin.
