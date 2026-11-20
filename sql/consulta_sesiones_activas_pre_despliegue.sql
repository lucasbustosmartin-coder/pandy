-- Pre-despliegue: ¿hay usuarios (distintos de quien despliega) con sesión activa?
-- Solo lectura. Correr en Pandy (prod) antes de aplicar SQL o desplegar; también en Pandy-Dev si el cambio es allí.
-- Criterio de "sesión abierta": sesión refrescada en los últimos 60 min (el front renueva el token
-- ~cada hora mientras la app está abierta) o consultas en curso desde la app (rol authenticator).
-- Si aparece alguien distinto de quien despliega → NO desplegar; avisar y reintentar más tarde.

SELECT u.email,
       a.role,
       COALESCE(s.refreshed_at, s.updated_at) AS ultima_actividad,
       s.created_at,
       s.user_agent
  FROM auth.sessions s
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.app_user_profile a ON a.user_id = s.user_id
 WHERE COALESCE(s.refreshed_at, s.updated_at, s.created_at) > now() - interval '60 minutes'
   AND (s.not_after IS NULL OR s.not_after > now())
 ORDER BY ultima_actividad DESC;

SELECT pid, state, now() - query_start AS duracion, left(query, 120) AS query
  FROM pg_stat_activity
 WHERE usename = 'authenticator' AND state <> 'idle' AND pid <> pg_backend_pid();
