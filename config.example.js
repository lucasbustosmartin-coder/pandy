// Alternativa manual: copiar este archivo a config.js (no recomendado si ya usás .env).
// Lo habitual en local es NO editar config.js: definí SUPABASE_URL y SUPABASE_ANON_KEY en .env
// (plantilla .env.example) y ejecutá npm run dev — build-config.js genera config.js solo.
//
// Otra vía: npm run dev:supabase:volcar con docs/Pandy_Dev_Supabase.xlsx (ver docs/PANDY_DEV_SUPABASE.md).
// Usar SOLO proyecto Supabase de desarrollo; config.js está en .gitignore.

window.SUPABASE_ANON_KEY = '';
window.SUPABASE_URL = '';
// Opcional: panda celeste (igual que build Preview). Quitá comentarios para diferenciar de prod en local.
// window.PANDI_ICON_192_DEFAULT = '/assets/favicon-192x192-dev.png';
// window.PANDI_FAVICON_32_DEFAULT = '/assets/favicon-32x32-dev.png';
// window.PANDI_FAVICON_16_DEFAULT = '/assets/favicon-16x16-dev.png';

// Opcional: scripts locales. No exponer en el navegador.
// window.SUPABASE_SERVICE_ROLE_KEY = '';
