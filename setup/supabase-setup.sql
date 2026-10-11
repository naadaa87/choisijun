-- =====================================================================
-- 최시준 홈페이지 — Supabase 설정 SQL (회원 · 게시판 · 레퍼런스 · 문의)
-- 사용법: Supabase → SQL Editor → New query → 이 파일 내용 전체 붙여넣기 → Run
-- 여러 번 실행해도 안전하도록 만들었습니다. (이미 있는 표는 그대로 두고 빠진 것만 추가)
-- =====================================================================

-- ---------------------------------------------------------------
-- 0. 회원 프로필 (회원가입하면 자동으로 한 줄 생성)
-- ---------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  email       text,
  name        text,
  member_type text,
  phone       text,
  marketing   boolean not null default false,
  agreed_at   timestamptz,
  role        text not null default 'member' check (role in ('member', 'admin'))
);
alter table public.profiles enable row level security;

-- 관리자 여부 (정책 안에서 쓰기 위해 security definer)
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own"   on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "profiles: update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 회원은 이름·유형·휴대폰·수신동의만 고칠 수 있음 (role 은 못 바꿈)
revoke update on public.profiles from anon, authenticated;
grant  select on public.profiles to authenticated;
grant  update (name, member_type, phone, marketing, updated_at) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name, member_type, phone, marketing, agreed_at)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(new.raw_user_meta_data->>'name', ''), new.raw_user_meta_data->>'full_name',
                  new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)), 40),
    left(new.raw_user_meta_data->>'member_type', 40),
    left(new.raw_user_meta_data->>'phone', 20),
    coalesce((new.raw_user_meta_data->>'marketing')::boolean, false),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- 회원 탈퇴 (본인 계정만 삭제)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;

-- 글·답글 작성자를 회원 정보로 채우는 공통 트리거
create or replace function public.stamp_author()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p_name text;
begin
  new.user_id  := auth.uid();
  new.is_staff := public.is_admin();
  select name into p_name from public.profiles where id = auth.uid();
  new.author   := left(coalesce(nullif(p_name, ''), new.author, '회원'), 20);
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- 1. 커뮤니티 게시글
-- ---------------------------------------------------------------
create table if not exists public.community_posts (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author     text not null,
  category   text default '질문',
  title      text not null check (char_length(title) <= 60),
  content    text not null check (char_length(content) <= 2000)
);
alter table public.community_posts add column if not exists user_id  uuid references auth.users(id) on delete set null;
alter table public.community_posts add column if not exists is_staff boolean not null default false;
alter table public.community_posts enable row level security;

drop policy if exists "public read"           on public.community_posts;
drop policy if exists "public write"          on public.community_posts;
drop policy if exists "posts: read"           on public.community_posts;
drop policy if exists "posts: member write"   on public.community_posts;
drop policy if exists "posts: delete own"     on public.community_posts;
create policy "posts: read"         on public.community_posts for select using (true);
create policy "posts: member write" on public.community_posts for insert to authenticated with check (auth.uid() is not null);
create policy "posts: delete own"   on public.community_posts for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop trigger if exists posts_stamp on public.community_posts;
create trigger posts_stamp before insert on public.community_posts
  for each row execute function public.stamp_author();

-- ---------------------------------------------------------------
-- 2. 커뮤니티 답글
-- ---------------------------------------------------------------
create table if not exists public.community_comments (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  post_id    uuid not null references public.community_posts(id) on delete cascade,
  author     text not null,
  content    text not null check (char_length(content) <= 500)
);
alter table public.community_comments add column if not exists user_id  uuid references auth.users(id) on delete set null;
alter table public.community_comments add column if not exists is_staff boolean not null default false;
alter table public.community_comments enable row level security;

drop policy if exists "public read"            on public.community_comments;
drop policy if exists "public write"           on public.community_comments;
drop policy if exists "comments: read"         on public.community_comments;
drop policy if exists "comments: member write" on public.community_comments;
drop policy if exists "comments: delete own"   on public.community_comments;
create policy "comments: read"         on public.community_comments for select using (true);
create policy "comments: member write" on public.community_comments for insert to authenticated with check (auth.uid() is not null);
create policy "comments: delete own"   on public.community_comments for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop trigger if exists comments_stamp on public.community_comments;
create trigger comments_stamp before insert on public.community_comments
  for each row execute function public.stamp_author();

-- ---------------------------------------------------------------
-- 3. 레퍼런스 (읽기는 누구나, 등록·삭제는 관리자만)
-- ---------------------------------------------------------------
create table if not exists public.site_references (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category   text,
  year       text,
  title      text,
  "desc"     text,
  image      text,
  link       text
);
alter table public.site_references enable row level security;
drop policy if exists "public read"        on public.site_references;
drop policy if exists "public write"       on public.site_references;
drop policy if exists "refs: read"         on public.site_references;
drop policy if exists "refs: admin write"  on public.site_references;
drop policy if exists "refs: admin delete" on public.site_references;
create policy "refs: read"         on public.site_references for select using (true);
create policy "refs: admin write"  on public.site_references for insert to authenticated with check (public.is_admin());
create policy "refs: admin delete" on public.site_references for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------
-- 4. 문의 (누구나 보낼 수 있고, 본인 것만 보이며, 관리자는 전부 봄)
-- ---------------------------------------------------------------
create table if not exists public.inquiries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  user_id      uuid references auth.users(id) on delete set null default auth.uid(),
  inquiry_type text check (char_length(inquiry_type) <= 40),
  name         text not null check (char_length(name) <= 40),
  contact      text not null check (char_length(contact) <= 60),
  message      text not null check (char_length(message) <= 3000),
  page         text,
  status       text not null default '접수' check (status in ('접수', '진행중', '완료')),
  reply        text check (char_length(reply) <= 2000)
);
alter table public.inquiries enable row level security;
drop policy if exists "inquiries: anyone send"  on public.inquiries;
drop policy if exists "inquiries: read own"     on public.inquiries;
drop policy if exists "inquiries: admin update" on public.inquiries;
create policy "inquiries: anyone send"  on public.inquiries for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
create policy "inquiries: read own"     on public.inquiries for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "inquiries: admin update" on public.inquiries for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- 문의를 보낸 사람이 상태·답변을 고치지 못하도록 (관리자 화면은 status, reply 만 수정)
revoke update on public.inquiries from anon, authenticated;
grant  update (status, reply) on public.inquiries to authenticated;
-- 문의 내용은 보낸 뒤 고칠 수 없게 함 (insert 시 status·reply 를 임의로 넣지 못하도록)
create or replace function public.inquiry_defaults()
returns trigger language plpgsql as $$
begin
  new.status := '접수';
  new.reply  := null;
  new.user_id := auth.uid();
  return new;
end;
$$;
drop trigger if exists inquiries_defaults on public.inquiries;
create trigger inquiries_defaults before insert on public.inquiries
  for each row execute function public.inquiry_defaults();

-- ---------------------------------------------------------------
-- 끝. 'Success. No rows returned' 가 나오면 완료입니다.
-- 본인 계정을 관리자로 만들 때는 회원가입을 먼저 한 뒤 아래 한 줄을 따로 실행하세요.
--   update public.profiles set role = 'admin' where email = '본인이메일@example.com';
-- ---------------------------------------------------------------
