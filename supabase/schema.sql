create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'user',
  is_super_admin boolean not null default false,
  is_active boolean not null default true,
  assigned_by uuid references public.users(id) on delete set null,
  role_assigned_at timestamptz,
  last_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users disable row level security;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_name text not null,
  description text not null default '',
  permissions text[] not null default '{}',
  created_by uuid references public.users(id) on delete set null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.roles disable row level security;
