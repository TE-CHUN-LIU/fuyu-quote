-- 富寓報價單 雲端儲存設定
-- 在 Supabase 後台 → SQL Editor 貼上整段執行一次即可。
-- ⚠️ 執行前：把全部 4 個 '__你的密碼__' 換成你自己的密碼（建議 8 碼以上、英數混合）。

-- 1. 資料表（RLS 開啟、不建任何 policy → 外部一律讀不到，只能透過下面的函式存取）
create table if not exists public.fuyu_quotes (
  id            uuid primary key default gen_random_uuid(),
  customer_name text,
  project_name  text,
  data          jsonb not null,
  updated_at    timestamptz not null default now()
);
alter table public.fuyu_quotes enable row level security;

-- 2. 後端函式（security definer：以擁有者身份執行，繞過 RLS；先驗密碼才放行）

-- 列出全部
create or replace function public.fuyu_list(pass text)
returns setof public.fuyu_quotes
language plpgsql security definer set search_path = public as $$
begin
  if pass is distinct from '__你的密碼__' then raise exception 'unauthorized'; end if;
  return query select * from public.fuyu_quotes order by updated_at desc;
end; $$;

-- 新增或更新（p_id 為 null → 新增；有值 → 更新該筆）
create or replace function public.fuyu_upsert(
  pass text, p_id uuid, p_customer text, p_project text, p_data jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if pass is distinct from '__你的密碼__' then raise exception 'unauthorized'; end if;
  if p_id is null then
    insert into public.fuyu_quotes(customer_name, project_name, data)
      values (p_customer, p_project, p_data) returning id into new_id;
  else
    update public.fuyu_quotes
      set customer_name = p_customer, project_name = p_project, data = p_data, updated_at = now()
      where id = p_id returning id into new_id;
    if new_id is null then  -- 該 id 已不存在，補建一筆
      insert into public.fuyu_quotes(id, customer_name, project_name, data)
        values (p_id, p_customer, p_project, p_data) returning id into new_id;
    end if;
  end if;
  return new_id;
end; $$;

-- 刪除
create or replace function public.fuyu_delete(pass text, p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if pass is distinct from '__你的密碼__' then raise exception 'unauthorized'; end if;
  delete from public.fuyu_quotes where id = p_id;
end; $$;

-- 3. 只開放這些函式給匿名前端執行
grant execute on function public.fuyu_list(text)                              to anon;
grant execute on function public.fuyu_upsert(text, uuid, text, text, jsonb)   to anon;
grant execute on function public.fuyu_delete(text, uuid)                      to anon;
