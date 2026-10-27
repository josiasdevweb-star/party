-- Notifications de connexions : l'admin peut les effacer de sa liste sans fausser les statistiques.
-- Une nouvelle visite du même appareil refait apparaître la connexion (dismissed_at repasse à NULL).

alter table public.analytics_visitors add column if not exists dismissed_at timestamptz;

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
            page_path    = excluded.page_path,
            dismissed_at = null;
end;
$$;

-- Admin uniquement : efface une connexion de la liste des notifications.
create or replace function public.admin_dismiss_visitor(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.app_role() is distinct from 'admin' then
        raise exception 'accès refusé' using errcode = '42501';
    end if;
    update public.analytics_visitors set dismissed_at = now() where id = p_id;
end;
$$;

-- Admin uniquement : efface toutes les connexions de la liste des notifications.
create or replace function public.admin_dismiss_all_visitors()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if public.app_role() is distinct from 'admin' then
        raise exception 'accès refusé' using errcode = '42501';
    end if;
    update public.analytics_visitors set dismissed_at = now() where dismissed_at is null;
end;
$$;

revoke execute on function public.admin_dismiss_visitor(uuid) from public;
revoke execute on function public.admin_dismiss_visitor(uuid) from anon;
grant  execute on function public.admin_dismiss_visitor(uuid) to authenticated;

revoke execute on function public.admin_dismiss_all_visitors() from public;
revoke execute on function public.admin_dismiss_all_visitors() from anon;
grant  execute on function public.admin_dismiss_all_visitors() to authenticated;
