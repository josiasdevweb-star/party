-- ---------------------------------------------------------------------------
-- Gestion des filles depuis l'espace admin (fiches + photos + vidéos)
-- À exécuter UNE fois dans Supabase > SQL Editor. Ré-exécutable sans risque.
-- Prérequis : la migration analytics (fonction app_role) est déjà en place.
-- ---------------------------------------------------------------------------

create table if not exists public.models (
    id          text primary key check (id ~ '^[0-9a-z-]{1,20}$'),
    prenom      text not null check (char_length(prenom) between 1 and 60),
    nom         text not null default '' check (char_length(nom) <= 60),
    categorie   text not null default '' check (char_length(categorie) <= 80),
    description text not null default '' check (char_length(description) <= 2000),
    accroche    text not null default '' check (char_length(accroche) <= 80),
    reservation text not null default '#!' check (char_length(reservation) <= 500),
    vignette    text not null default '' check (char_length(vignette) <= 600),
    photos      text[] not null default '{}' check (coalesce(array_length(photos, 1), 0) <= 3),
    videos      text[] not null default '{}' check (coalesce(array_length(videos, 1), 0) <= 2),
    position    integer not null default 0,
    created_at  timestamptz not null default now()
);

create index if not exists models_position_idx on public.models (position, id);

alter table public.models enable row level security;

revoke all on public.models from anon, authenticated;
grant select on public.models to anon, authenticated;
grant insert, update, delete on public.models to authenticated;

drop policy if exists "tout le monde lit les filles" on public.models;
create policy "tout le monde lit les filles"
    on public.models for select to anon, authenticated
    using (true);

drop policy if exists "admin ajoute une fille" on public.models;
create policy "admin ajoute une fille"
    on public.models for insert to authenticated
    with check (public.app_role() = 'admin');

drop policy if exists "admin modifie une fille" on public.models;
create policy "admin modifie une fille"
    on public.models for update to authenticated
    using (public.app_role() = 'admin')
    with check (public.app_role() = 'admin');

drop policy if exists "admin supprime une fille" on public.models;
create policy "admin supprime une fille"
    on public.models for delete to authenticated
    using (public.app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Stockage des fichiers : bucket public « models » (lecture pour tous, écriture admin)
-- Limite 50 Mo par fichier (plafond du plan gratuit).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models', 'models', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
    set public = true,
        file_size_limit = 52428800,
        allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];

drop policy if exists "admin envoie des fichiers filles" on storage.objects;
create policy "admin envoie des fichiers filles"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'models' and public.app_role() = 'admin');

drop policy if exists "admin remplace des fichiers filles" on storage.objects;
create policy "admin remplace des fichiers filles"
    on storage.objects for update to authenticated
    using (bucket_id = 'models' and public.app_role() = 'admin')
    with check (bucket_id = 'models' and public.app_role() = 'admin');

drop policy if exists "admin supprime des fichiers filles" on storage.objects;
create policy "admin supprime des fichiers filles"
    on storage.objects for delete to authenticated
    using (bucket_id = 'models' and public.app_role() = 'admin');

drop policy if exists "admin liste les fichiers filles" on storage.objects;
create policy "admin liste les fichiers filles"
    on storage.objects for select to authenticated
    using (bucket_id = 'models' and public.app_role() = 'admin');
