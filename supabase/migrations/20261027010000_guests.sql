-- Invités : prénom, ville et pays saisis dans le formulaire d'accès aux profils.
-- Écriture uniquement via submit_guest (SECURITY DEFINER) ; lecture réservée à l'admin (app_role() = 'admin').

create table if not exists public.guest_registrations (
    id         uuid primary key default gen_random_uuid(),
    visitor_id text not null unique,
    first_name text not null check (char_length(first_name) between 1 and 60),
    city       text not null check (char_length(city) between 1 and 60),
    country    text not null check (char_length(country) between 1 and 60),
    model_id   text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists guest_registrations_created_at_idx on public.guest_registrations (created_at desc);
create index if not exists guest_registrations_country_idx    on public.guest_registrations (country);

alter table public.guest_registrations enable row level security;

revoke all on public.guest_registrations from anon, authenticated;
grant select on public.guest_registrations to authenticated;

drop policy if exists "admin lit les invites" on public.guest_registrations;
create policy "admin lit les invites"
    on public.guest_registrations for select to authenticated
    using (public.app_role() = 'admin');

create or replace function public.submit_guest(
    p_visitor_id text,
    p_first_name text,
    p_city       text,
    p_country    text,
    p_model_id   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_first   text;
    v_city    text;
    v_country text;
    v_model   text;
begin
    if p_visitor_id is null
       or p_visitor_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'visitor_id invalide' using errcode = '22023';
    end if;

    -- caractères de contrôle retirés, espaces normalisés, 60 caractères maximum
    v_first   := left(btrim(regexp_replace(regexp_replace(coalesce(p_first_name, ''), '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), 60);
    v_city    := left(btrim(regexp_replace(regexp_replace(coalesce(p_city, ''),       '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), 60);
    v_country := left(btrim(regexp_replace(regexp_replace(coalesce(p_country, ''),    '[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), 60);

    if v_first = '' or v_city = '' or v_country = '' then
        raise exception 'prénom, ville et pays obligatoires' using errcode = '22023';
    end if;

    v_model := case when p_model_id ~ '^[0-9]{1,3}$' then p_model_id else null end;

    insert into public.guest_registrations as g (visitor_id, first_name, city, country, model_id)
    values (lower(p_visitor_id), v_first, v_city, v_country, v_model)
    on conflict (visitor_id) do update
        set first_name = excluded.first_name,
            city       = excluded.city,
            country    = excluded.country,
            updated_at = now();
end;
$$;

revoke execute on function public.submit_guest(text, text, text, text, text) from public;
grant  execute on function public.submit_guest(text, text, text, text, text) to anon, authenticated;

-- Le visiteur peut savoir si sa soumission existe encore (elle disparaît quand l'admin le fait repasser).
create or replace function public.guest_exists(p_visitor_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (select 1 from public.guest_registrations where visitor_id = lower(p_visitor_id));
$$;

revoke execute on function public.guest_exists(text) from public;
grant  execute on function public.guest_exists(text) to anon, authenticated;

-- Admin uniquement : supprime la soumission d'un invité pour qu'il puisse repasser le formulaire.
create or replace function public.admin_reset_guest(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.app_role() is distinct from 'admin' then
        raise exception 'accès refusé' using errcode = '42501';
    end if;
    delete from public.guest_registrations where id = p_id;
end;
$$;

revoke execute on function public.admin_reset_guest(uuid) from public;
revoke execute on function public.admin_reset_guest(uuid) from anon;
grant  execute on function public.admin_reset_guest(uuid) to authenticated;
