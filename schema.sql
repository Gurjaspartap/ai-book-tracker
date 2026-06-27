-- Create books table
create table public.books (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  author text,
  description text,
  cover_url text,
  categories text[] default '{}'::text[],
  status text not null check (status in ('will-read', 'reading', 'completed', 'not-completed')),
  current_page integer default 0,
  total_pages integer default 0,
  rating integer check (rating >= 1 and rating <= 5),
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  file_url text,
  file_type text,
  extracted_text_url text,
  language text
);

-- Enable Row Level Security
alter table public.books enable row level security;

-- Policies for RLS isolation
create policy "Users can view their own books" on public.books
  for select using (auth.uid() = user_id);

create policy "Users can insert their own books" on public.books
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own books" on public.books
  for update using (auth.uid() = user_id);

create policy "Users can delete their own books" on public.books
  for delete using (auth.uid() = user_id);

-- Create favorite_authors table
create table public.favorite_authors (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  bio text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.favorite_authors enable row level security;

-- Policies for RLS isolation
create policy "Users can view their own favorite authors" on public.favorite_authors
  for select using (auth.uid() = user_id);

create policy "Users can insert their own favorite authors" on public.favorite_authors
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own favorite authors" on public.favorite_authors
  for update using (auth.uid() = user_id);

create policy "Users can delete their own favorite authors" on public.favorite_authors
  for delete using (auth.uid() = user_id);

-- Migration for existing databases:
-- alter table public.books add column if not exists file_url text;
-- alter table public.books add column if not exists file_type text;
-- alter table public.books add column if not exists extracted_text_url text;
-- alter table public.books add column if not exists language text;

-- =========================================================================
-- Supabase Storage Setup & Policies for 'book-files' bucket
-- =========================================================================

-- Create storage bucket if not exists
insert into storage.buckets (id, name, public)
values ('book-files', 'book-files', true)
on conflict (id) do nothing;

-- 1. Allow public read access to book-files
create policy "Public Access to book-files"
on storage.objects for select
using ( bucket_id = 'book-files' );

-- 2. Allow authenticated users to upload files
create policy "Authenticated users can upload to book-files"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'book-files' );

-- 3. Allow authenticated users to overwrite/update files
create policy "Authenticated users can update book-files"
on storage.objects for update
to authenticated
using ( bucket_id = 'book-files' );

-- 4. Allow authenticated users to delete files
create policy "Authenticated users can delete book-files"
on storage.objects for delete
to authenticated
using ( bucket_id = 'book-files' );

-- =========================================================================
-- Reading Sessions
-- =========================================================================
create table public.reading_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  book_id uuid references public.books(id) on delete cascade,
  duration_minutes integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.reading_sessions enable row level security;

create policy "Users can view their own reading sessions" on public.reading_sessions
  for select using (auth.uid() = user_id);

create policy "Users can insert their own reading sessions" on public.reading_sessions
  for insert with check (auth.uid() = user_id);

create policy "Users can update their own reading sessions" on public.reading_sessions
  for update using (auth.uid() = user_id);

create policy "Users can delete their own reading sessions" on public.reading_sessions
  for delete using (auth.uid() = user_id);
