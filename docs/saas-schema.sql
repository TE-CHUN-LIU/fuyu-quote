-- 富寓報價系統 SaaS schema（第一步：登入制 + 公司隔離 + 訂閱 gate）
-- 對應 docs/saas-subscription-roadmap.md。
-- 在 Supabase SQL Editor 貼上整段執行一次。
-- 重要：本檔「不動」現有 public.fuyu_quotes（共用密碼版），兩套可並存；
--       前端切到 Supabase Auth 後再逐步把資料搬進 public.quotes。

-- ──────────────────────────────────────────────
-- 1. 列舉型別
-- ──────────────────────────────────────────────
do $$ begin
  create type public.org_role as enum ('admin', 'owner', 'editor', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sub_status as enum ('trialing', 'active', 'past_due', 'canceled', 'incomplete');
exception when duplicate_object then null; end $$;

-- ──────────────────────────────────────────────
-- 2. 資料表
-- ──────────────────────────────────────────────
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            public.org_role not null default 'editor',
  created_at      timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.subscriptions (
  organization_id        uuid primary key references public.organizations(id) on delete cascade,
  status                 public.sub_status not null default 'trialing',
  plan                   text not null default 'free',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  provider               text,
  provider_customer_id   text,
  provider_subscription_id text,
  updated_at             timestamptz not null default now()
);

create table if not exists public.quotes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_name   text,
  project_name    text,
  data            jsonb not null,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists quotes_org_idx on public.quotes(organization_id, updated_at desc);

create table if not exists public.ai_import_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id        uuid references public.quotes(id) on delete set null,
  file_name       text,
  status          text not null default 'pending',
  model           text,
  input_bytes     bigint,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists ai_jobs_org_idx on public.ai_import_jobs(organization_id, created_at desc);

-- ──────────────────────────────────────────────
-- 3. 輔助函式（避免 RLS policy 互相遞迴查 members）
-- ──────────────────────────────────────────────
-- 目前登入者是否為該公司成員
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- 目前登入者在該公司是否具有指定（含以上）權限；admin>owner>editor>viewer
create or replace function public.has_org_role(org uuid, need public.org_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
      and case m.role
            when 'admin'  then 4 when 'owner' then 3
            when 'editor' then 2 when 'viewer' then 1 end
        >=
          case need
            when 'admin'  then 4 when 'owner' then 3
            when 'editor' then 2 when 'viewer' then 1 end
  );
$$;

-- 該公司訂閱是否有效（gate 雲端儲存與 AI 匯入用）
create or replace function public.org_subscription_active(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.organization_id = org
      and s.status in ('trialing', 'active')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- ──────────────────────────────────────────────
-- 4. RLS
-- ──────────────────────────────────────────────
alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.subscriptions         enable row level security;
alter table public.quotes                enable row level security;
alter table public.ai_import_jobs        enable row level security;

-- organizations：成員可讀；owner/admin 可改名
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations
  for select using (public.is_org_member(id));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations
  for update using (public.has_org_role(id, 'owner'));

-- organization_members：成員可看同公司名單；owner/admin 可增刪成員
drop policy if exists mem_select on public.organization_members;
create policy mem_select on public.organization_members
  for select using (public.is_org_member(organization_id));
drop policy if exists mem_write on public.organization_members;
create policy mem_write on public.organization_members
  for all using (public.has_org_role(organization_id, 'owner'))
  with check (public.has_org_role(organization_id, 'owner'));

-- subscriptions：成員可讀；寫入只由後端 service_role 處理（不開前端 policy）
drop policy if exists sub_select on public.subscriptions;
create policy sub_select on public.subscriptions
  for select using (public.is_org_member(organization_id));

-- quotes：成員可讀；editor 以上＋訂閱有效才可建立/修改；owner 以上可刪
drop policy if exists quote_select on public.quotes;
create policy quote_select on public.quotes
  for select using (public.is_org_member(organization_id));
drop policy if exists quote_insert on public.quotes;
create policy quote_insert on public.quotes
  for insert with check (
    public.has_org_role(organization_id, 'editor')
    and public.org_subscription_active(organization_id)
  );
drop policy if exists quote_update on public.quotes;
create policy quote_update on public.quotes
  for update using (
    public.has_org_role(organization_id, 'editor')
    and public.org_subscription_active(organization_id)
  );
drop policy if exists quote_delete on public.quotes;
create policy quote_delete on public.quotes
  for delete using (public.has_org_role(organization_id, 'owner'));

-- ai_import_jobs：成員可讀；寫入由後端 /api/ai-import 用 service_role 記錄
drop policy if exists aijob_select on public.ai_import_jobs;
create policy aijob_select on public.ai_import_jobs
  for select using (public.is_org_member(organization_id));

-- ──────────────────────────────────────────────
-- 5. 第一次登入時自建公司（冪等 RPC，不掛全域 auth.users trigger）
--    ⚠️ 本 Supabase 為 MMT 共用專案：若掛 on auth.users 的 trigger，
--       會對「整個專案所有新註冊者」都開一間富寓公司，污染其他用途。
--       因此改由前端登入後呼叫 fuyu_ensure_org()，只有用富寓的人才會建公司。
-- ──────────────────────────────────────────────
create or replace function public.fuyu_ensure_org()
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  existing uuid;
  new_org uuid;
  uname text;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select organization_id into existing
    from public.organization_members where user_id = uid limit 1;
  if existing is not null then return existing; end if;

  select coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1), '我的公司')
    into uname from auth.users where id = uid;

  insert into public.organizations(name, slug)
    values (coalesce(uname, '我的公司'), 'org-' || replace(uid::text, '-', ''))
    returning id into new_org;

  insert into public.organization_members(organization_id, user_id, role)
    values (new_org, uid, 'owner');

  insert into public.subscriptions(organization_id, status, plan, current_period_end)
    values (new_org, 'trialing', 'free', now() + interval '14 days');

  return new_org;
end; $$;

grant execute on function public.fuyu_ensure_org() to authenticated;

-- ──────────────────────────────────────────────
-- 6. 平台超級管理員（跨公司、看得到/改得了全部資料）
--    密碼不寫在這裡、也不進 git：管理員帳號在 Supabase Auth 建立，
--    這裡只記「哪個 user 是超管」。設定步驟見檔尾。
-- ──────────────────────────────────────────────
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- 只有超管自己讀得到這張表（避免一般使用者探測誰是超管）
drop policy if exists padmin_self on public.platform_admins;
create policy padmin_self on public.platform_admins
  for select using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- 給前端判斷是否顯示「管理員」介面用
create or replace function public.fuyu_is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin();
$$;
grant execute on function public.fuyu_is_platform_admin() to authenticated;

-- 超管的全表通行 policy（PERMISSIVE，與上面各表的成員 policy 以 OR 合併）
drop policy if exists org_admin_all    on public.organizations;
create policy org_admin_all    on public.organizations
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists mem_admin_all    on public.organization_members;
create policy mem_admin_all    on public.organization_members
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists sub_admin_all    on public.subscriptions;
create policy sub_admin_all    on public.subscriptions
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists quote_admin_all  on public.quotes;
create policy quote_admin_all  on public.quotes
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists aijob_admin_all  on public.ai_import_jobs;
create policy aijob_admin_all  on public.ai_import_jobs
  for all using (public.is_platform_admin()) with check (public.is_platform_admin());

-- ──────────────────────────────────────────────
-- 設定超級管理員（在 Supabase 後台做，不要寫進 git）
-- ──────────────────────────────────────────────
-- 1. Supabase → Authentication → Users → Add user：
--    填你的 Email、設密碼、勾「Auto Confirm User」。
-- 2. 回到 SQL Editor，把下面的 Email 換成剛建立的，執行一次：
--      insert into public.platform_admins(user_id)
--      select id from auth.users where email = '你的Email'
--      on conflict do nothing;
-- 之後用該帳號登入 fuyu，就會自動有跨公司超管權限。

-- 完成。下一步（前端已接好）：
--  1. index.html / app.js 已用 Supabase Auth 登入，雲端讀寫改打 quotes 表（RLS 依公司隔離）。
--  2. 待辦：/api/ai-import 改成驗 JWT → org_subscription_active() gate，再記一筆 ai_import_jobs。
--  3. 待辦：把舊 fuyu_quotes（共用密碼版）的資料一次性搬進 quotes（需指定歸屬公司）。
