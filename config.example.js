// Copiar a config.js. Usar SOLO el proyecto Supabase de desarrollo (Pandy-Dev / Excel Pandy_Dev_Supabase.xlsx).
// No pegar URL ni keys del proyecto de producción: la app local y los E2E deben apuntar al mismo ref de dev.
// Recomendado: npm run dev:supabase:volcar (genera config.js y .env desde el Excel).
// config.js está en .gitignore.

window.SUPABASE_ANON_KEY = '';
window.SUPABASE_URL = '';
// Opcional: panda celeste 192×192 (igual que build Preview). Quitá el comentario para confundir menos con prod en local.
// window.PANDI_ICON_192_DEFAULT = '/assets/favicon-192x192-dev.png';

// Opcional: scripts locales. No exponer en el navegador.
// window.SUPABASE_SERVICE_ROLE_KEY = '';
