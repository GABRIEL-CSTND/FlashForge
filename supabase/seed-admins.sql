-- One-time script: make the first admins (#51). Run after the profiles
-- migration. Each person must have signed in to FlashForge at least once so
-- their profile row exists.
--
-- Later admins are added from the admin page (#60) instead of editing this file.

update public.profiles as p
set role = 'admin',
    role_chosen_at = coalesce(p.role_chosen_at, now())
from auth.users as u
where u.id = p.id
  and lower(u.email) in (
    'castanedag438@gmail.com'
  );

-- Check the result: should list every admin.
select u.email, p.role, p.role_chosen_at
from public.profiles as p
join auth.users as u on u.id = p.id
where p.role = 'admin';
