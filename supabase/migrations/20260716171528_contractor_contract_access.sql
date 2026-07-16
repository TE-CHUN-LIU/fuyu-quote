-- 富寓承包商契約功能權限：只有已登入且屬於已開通公司的人可使用。
create table if not exists public.organization_features (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, feature_key)
);

alter table public.organization_features enable row level security;

revoke all on table public.organization_features from anon, authenticated;
grant select on table public.organization_features to authenticated;

drop policy if exists organization_features_member_select
  on public.organization_features;
create policy organization_features_member_select
  on public.organization_features
  for select
  to authenticated
  using (public.is_org_member(organization_id));

insert into public.organization_features (organization_id, feature_key, enabled)
values (
  '4187ec65-c7c8-4793-9e60-c113caa528b5',
  'contractor_contract',
  true
)
on conflict (organization_id, feature_key)
do update set enabled = excluded.enabled, updated_at = now();

-- 既有富寓 RPC 僅供已登入帳號使用；移除 PostgreSQL 預設 PUBLIC／anon 執行權。
revoke execute on function public.fuyu_ensure_org() from public, anon;
revoke execute on function public.fuyu_is_platform_admin() from public, anon;
revoke execute on function public.fuyu_my_org() from public, anon;
revoke execute on function public.fuyu_admin_list_orgs() from public, anon;
revoke execute on function public.fuyu_admin_create_company(text, text, text, jsonb) from public, anon;
revoke execute on function public.fuyu_admin_update_org(uuid, text, jsonb) from public, anon;
revoke execute on function public.fuyu_admin_set_subscription(uuid, text, text, timestamptz) from public, anon;

grant execute on function public.fuyu_ensure_org() to authenticated;
grant execute on function public.fuyu_is_platform_admin() to authenticated;
grant execute on function public.fuyu_my_org() to authenticated;
grant execute on function public.fuyu_admin_list_orgs() to authenticated;
grant execute on function public.fuyu_admin_create_company(text, text, text, jsonb) to authenticated;
grant execute on function public.fuyu_admin_update_org(uuid, text, jsonb) to authenticated;
grant execute on function public.fuyu_admin_set_subscription(uuid, text, text, timestamptz) to authenticated;
