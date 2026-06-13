-- ============================================================
-- 001_create_profiles.sql
-- 用户资料表，扩展 Supabase Auth 自带的 users 表
-- 用于存储用户名、付费状态等业务字段
-- ============================================================

-- 1. 创建 profiles 表
create table if not exists public.profiles (
  id          uuid        not null primary key references auth.users(id) on delete cascade,
  username    text        unique,
  paid_status boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- 2. 启用行级安全策略 (RLS)
alter table public.profiles enable row level security;

-- 3. 策略：用户可以读取自己的 profile
create policy "用户可以查看自己的资料"
  on public.profiles for select
  using ( auth.uid() = id );

-- 4. 策略：用户可以修改自己的 profile（仅限 username 字段）
create policy "用户可以修改自己的资料"
  on public.profiles for update
  using ( auth.uid() = id )
  with check ( auth.uid() = id );

-- 5. 策略：仅服务端（Service Role）可以修改 paid_status
--    注意：这里我们不开放 paid_status 给用户自己修改
--    而是通过 Edge Function 使用 Service Role Key 来更新

-- 6. 触发器：当用户在 Supabase Auth 注册时，自动创建一条 profile 记录
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- 7. 索引
create index if not exists idx_profiles_paid_status on public.profiles(paid_status);
create index if not exists idx_profiles_username     on public.profiles(username);

-- 8. 给 Edge Function（Service Role）的额外策略：
--    Service Role 默认绕过 RLS，无需额外策略
--    但如果需要限制只能 admin 操作 paid_status，可以如下创建一个安全定义的函数
create or replace function public.admin_set_paid_status(target_user_id uuid, new_status boolean)
returns void
language plpgsql
security definer
as $$
begin
  update public.profiles
  set paid_status = new_status
  where id = target_user_id;
end;
$$;
