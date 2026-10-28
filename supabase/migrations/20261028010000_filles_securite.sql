-- Durcissement de la gestion des filles : liens et fichiers contrôlés côté base, vidéos de tous formats.
-- Ré-exécutable sans risque. À lancer dans Supabase > SQL Editor.

-- Un lien ne peut pointer que vers : http(s), tel:, mailto:, un fichier du site ou une ancre (jamais javascript: / data:).
create or replace function public.lien_ok(u text)
returns boolean
language sql
immutable
as $$
    select u ~* '^(https?://[^[:space:]]+|tel:[0-9+ ()-]+|mailto:[^[:space:]]+|#[^[:space:]]*|/[^/[:space:]][^[:space:]]*|[a-z0-9_.-]+\.html([?#][^[:space:]]*)?)$'
$$;

-- Un fichier ne peut venir que du stockage Supabase du projet ou du dossier img/ ou videos/ du site.
create or replace function public.fichier_ok(u text)
returns boolean
language sql
immutable
as $$
    select u ~* '^(https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/models/[^[:space:]"''<>]+|(img|videos)/[a-z0-9_./-]+)$'
$$;

create or replace function public.fichiers_ok(a text[])
returns boolean
language sql
immutable
as $$
    select not exists (select 1 from unnest(a) as x where not public.fichier_ok(x))
$$;

alter table public.models drop constraint if exists models_reservation_ok;
alter table public.models add constraint models_reservation_ok check (public.lien_ok(reservation));

alter table public.models drop constraint if exists models_vignette_ok;
alter table public.models add constraint models_vignette_ok check (vignette = '' or public.fichier_ok(vignette));

alter table public.models drop constraint if exists models_photos_ok;
alter table public.models add constraint models_photos_ok check (public.fichiers_ok(photos));

alter table public.models drop constraint if exists models_videos_ok;
alter table public.models add constraint models_videos_ok check (public.fichiers_ok(videos));

-- Stockage : toutes les vidéos acceptées (mp4, mov, mkv, avi, webm, 3gp…), 500 Mo maximum par fichier
-- (la limite globale du projet, Storage > Settings, reste prioritaire selon votre offre Supabase).
update storage.buckets
   set file_size_limit = 524288000,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/*']
 where id = 'models';
