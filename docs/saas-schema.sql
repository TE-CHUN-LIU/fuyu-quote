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
-- 5. 註冊即建公司：新使用者第一次登入時自動開一間個人公司並設為 owner
--    （之後可改成邀請制；先用這個讓單人立刻能用）
-- ──────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  insert into public.organizations(name, slug)
    values (
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), '我的公司'),
      'org-' || replace(new.id::text, '-', '')
    )
    returning id into new_org;

  insert into public.organization_members(organization_id, user_id, role)
    values (new_org, new.id, 'owner');

  insert into public.subscriptions(organization_id, status, plan, current_period_end)
    values (new_org, 'trialing', 'free', now() + interval '14 days');

  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 完成。下一步（前端）：
--  1. index.html 載入 Supabase Auth（magic link 或 Google），登入後才顯示雲端/AI 按鈕。
--  2. app.js 雲端 list/upsert/delete 改打 quotes 表（帶 session JWT，RLS 自動隔離公司）。
--  3. /api/ai-import 先用 JWT 查 org → org_subscription_active() gate，再記一筆 ai_import_jobs。
