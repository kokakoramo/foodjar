-- My Food Jar v6 — Supabase schema + private image storage
-- 在 Supabase SQL Editor 執行一次。
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  jar_name text not null default '我的飯飯罐',
  budget numeric not null default 8000,
  theme text not null default 'blush',
  avatar text not null default '🍓',
  updated_at timestamptz not null default now()
);

create table if not exists public.meals (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  title text,
  type text not null default '午餐',
  price numeric not null check (price >= 0),
  payment text,
  note text,
  image_path text,
  image_url text,
  sticker boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.meals add column if not exists image_path text;
create index if not exists meals_user_date_idx on public.meals(user_id,date desc);

alter table public.profiles enable row level security;
alter table public.meals enable row level security;

drop policy if exists "profile own row" on public.profiles;
create policy "profile own row" on public.profiles for all using (auth.uid()=id) with check (auth.uid()=id);
drop policy if exists "meals own rows" on public.meals;
create policy "meals own rows" on public.meals for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

-- Private bucket: each user can only access files inside their own user-id folder.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('meal-images','meal-images',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "meal image read own" on storage.objects;
create policy "meal image read own" on storage.objects for select using (
  bucket_id='meal-images' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "meal image insert own" on storage.objects;
create policy "meal image insert own" on storage.objects for insert with check (
  bucket_id='meal-images' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "meal image update own" on storage.objects;
create policy "meal image update own" on storage.objects for update using (
  bucket_id='meal-images' and (storage.foldername(name))[1]=auth.uid()::text
) with check (
  bucket_id='meal-images' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists "meal image delete own" on storage.objects;
create policy "meal image delete own" on storage.objects for delete using (
  bucket_id='meal-images' and (storage.foldername(name))[1]=auth.uid()::text
);
