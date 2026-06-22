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
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
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
