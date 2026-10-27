-- Mesure d'audience anonyme (Supabase uniquement) + rôle admin.
-- Aucune écriture directe pour anon : tout passe par track_visit / track_click (SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.analytics_visitors (
    id               uuid primary key default gen_random_uuid(),
    visitor_id       text not null unique,
    device_type      text not null check (device_type in ('mobile', 'desktop', 'tablet')),
    operating_system text,
    browser          text,
    utm_source       text not null default 'direct',
    utm_medium       text not null default 'none',
    utm_campaign     text not null default 'organic',
    utm_term         text,
    utm_content      text,
    page_path        text,
    referrer         text,
    visits_count     integer not null default 1,
    first_seen       timestamptz not null default now(),
    last_seen        timestamptz not null default now(),
    created_at       timestamptz not null default now()
);

create index if not exists analytics_visitors_created_at_idx   on public.analytics_visitors (created_at desc);
create index if not exists analytics_visitors_utm_source_idx   on public.analytics_visitors (utm_source);
create index if not exists analytics_visitors_utm_campaign_idx on public.analytics_visitors (utm_campaign);
create index if not exists analytics_visitors_device_type_idx  on public.analytics_visitors (device_type);

create table if not exists public.analytics_clicks (
    id          uuid primary key default gen_random_uuid(),
    visitor_id  text not null,
    click_id    text not null,
    page_path   text,
    device_type text,
    created_at  timestamptz not null default now()
);

create index if not exists analytics_clicks_created_at_idx on public.analytics_clicks (created_at desc);
create index if not exists analytics_clicks_click_id_idx   on public.analytics_clicks (click_id);

-- ---------------------------------------------------------------------------
-- Rôle admin
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
    id   uuid primary key references auth.users (id) on delete cascade,
    nom  text,
    role text not null default 'user' check (role in ('admin', 'user'))
);

create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role from public.profiles where id = auth.uid();
$$;

revoke execute on function public.app_role() from public;
revoke execute on function public.app_role() from anon;
grant  execute on function public.app_role() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS : aucune policy d'écriture, lecture réservée à l'admin
-- ---------------------------------------------------------------------------
alter table public.analytics_visitors enable row level security;
alter table public.analytics_clicks   enable row level security;
alter table public.profiles           enable row level security;

revoke all on public.analytics_visitors from anon, authenticated;
revoke all on public.analytics_clicks   from anon, authenticated;
revoke all on public.profiles           from anon, authenticated;

grant select on public.analytics_visitors to authenticated;
grant select on public.analytics_clicks   to authenticated;
grant select on public.profiles           to authenticated;

drop policy if exists "admin lit les visiteurs" on public.analytics_visitors;
create policy "admin lit les visiteurs"
    on public.analytics_visitors for select to authenticated
    using (public.app_role() = 'admin');

drop policy if exists "admin lit les clics" on public.analytics_clicks;
create policy "admin lit les clics"
    on public.analytics_clicks for select to authenticated
    using (public.app_role() = 'admin');

drop policy if exists "chacun lit son profil" on public.profiles;
create policy "chacun lit son profil"
    on public.profiles for select to authenticated
    using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- track_visit
-- ---------------------------------------------------------------------------
create or replace function public.track_visit(
    p_visitor_id       text,
    p_device_type      text,
    p_operating_system text,
    p_browser          text,
    p_utm_source       text,
    p_utm_medium       text,
    p_utm_campaign     text,
    p_utm_term         text,
    p_utm_content      text,
    p_page_path        text,
    p_referrer         text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_visitor text;
    v_device  text;
begin
    if p_visitor_id is null
       or p_visitor_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'visitor_id invalide' using errcode = '22023';
    end if;

    v_visitor := lower(p_visitor_id);
    v_device  := case when p_device_type in ('mobile', 'desktop', 'tablet') then p_device_type else 'desktop' end;

    insert into public.analytics_visitors as v (
        visitor_id, device_type, operating_system, browser,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        page_path, referrer
    )
    values (
        v_visitor,
        v_device,
        left(nullif(btrim(p_operating_system), ''), 40),
        left(nullif(btrim(p_browser), ''), 40),
        coalesce(left(nullif(lower(btrim(p_utm_source)), ''), 100), 'direct'),
        coalesce(left(nullif(lower(btrim(p_utm_medium)), ''), 100), 'none'),
        coalesce(left(nullif(lower(btrim(p_utm_campaign)), ''), 100), 'organic'),
        left(nullif(lower(btrim(p_utm_term)), ''), 100),
        left(nullif(lower(btrim(p_utm_content)), ''), 100),
        left(p_page_path, 300),
        left(p_referrer, 500)
    )
    on conflict (visitor_id) do update
        set visits_count = v.visits_count + 1,
            last_seen    = now(),
            page_path    = excluded.page_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- track_click
-- ---------------------------------------------------------------------------
create or replace function public.track_click(
    p_visitor_id  text,
    p_click_id    text,
    p_page_path   text,
    p_device_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_click text;
begin
    if p_visitor_id is null
       or p_visitor_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'visitor_id invalide' using errcode = '22023';
    end if;

    v_click := left(regexp_replace(lower(coalesce(p_click_id, '')), '[^a-z0-9_-]', '', 'g'), 60);
    if v_click = '' then
        raise exception 'click_id invalide' using errcode = '22023';
    end if;

    insert into public.analytics_clicks (visitor_id, click_id, page_path, device_type)
    values (
        lower(p_visitor_id),
        v_click,
        left(p_page_path, 300),
        case when p_device_type in ('mobile', 'desktop', 'tablet') then p_device_type else 'desktop' end
    );
end;
$$;

revoke execute on function public.track_visit(text, text, text, text, text, text, text, text, text, text, text) from public;
revoke execute on function public.track_click(text, text, text, text) from public;
grant  execute on function public.track_visit(text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant  execute on function public.track_click(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Création de l'admin (à faire à la main, voir les étapes données avec le projet) :
--   1. Supabase > Authentication > Users > Add user (email + mot de passe).
--   2. insert into public.profiles (id, nom, role)
--      select id, 'Admin', 'admin' from auth.users where email = 'votre@email.com';
-- Inscriptions publiques : Authentication > Sign In / Providers > désactiver "Allow new users to sign up".
-- ---------------------------------------------------------------------------
