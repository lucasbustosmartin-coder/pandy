-- Asignar rol Admin al usuario lucas.bustos.martin@gmail.com
-- Ejecutar en Supabase SQL Editor después de que el usuario exista en Authentication.
-- Si aún no se registró, que lo haga desde la app o crealo en Authentication → Users.

INSERT INTO public.app_user_profile (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'lucas.bustos.martin@gmail.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- Verificar (debe devolver 1 fila con role = admin):
-- SELECT p.email, u.role FROM public.user_profiles p LEFT JOIN public.app_user_profile u ON u.user_id = p.id WHERE p.email = 'lucas.bustos.martin@gmail.com';
