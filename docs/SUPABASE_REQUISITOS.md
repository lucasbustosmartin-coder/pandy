# Crear proyecto Supabase – Pandi

## Pasos

### 1. Crear proyecto en Supabase

1. Entrá a [supabase.com](https://supabase.com) e iniciá sesión.
2. **New project**: elegí nombre (ej. "pandi"), contraseña de base de datos y región.
3. Esperá a que el proyecto esté listo.

### 2. Obtener URL y API Key

1. En el dashboard: **Project Settings** (ícono engranaje) → **API**.
2. Copiá:
   - **Project URL** (ej. `https://xxxxx.supabase.co`).
   - **anon public** (para el frontend).
   - **service_role** (secret). Usala solo en scripts o entorno local, nunca en el frontend ni en el repo.

### 3. Archivo `.env` en la raíz del proyecto

En la carpeta Pandi creá `.env` con:

```env
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

No subas este archivo a Git (está en `.gitignore`).

### 4. Config para el frontend

Copiá `config.example.js` a `config.js` y pegá la **anon key** y la **URL** del proyecto. En Vercel, `config.js` se genera en el build desde variables de entorno (ver `docs/GIT_Y_VERCEL.md`).

### 5. Scripts SQL

Los archivos en `sql/` se ejecutan en el **SQL Editor** de Supabase. Cuando definas tablas para la app, creá los DDL en `sql/` (ej. `supabase_*.sql`) y ejecutalos en ese orden.

---

**Resumen:** Crear proyecto → copiar URL y keys → `.env` y `config.js` → ejecutar scripts en `sql/` según la app.
