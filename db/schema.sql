-- ============================================================
--  App Contable de Gular — Esquema de base de datos + seguridad
-- ------------------------------------------------------------
--  Cómo usar:
--    1) Entrá a tu proyecto en https://supabase.com
--    2) Menú izquierdo → "SQL Editor" → "New query"
--    3) Pegá TODO este archivo y apretá "Run"
--  Esto crea las tablas, los índices (para que ande rápido) y
--  las reglas de seguridad (RLS) que protegen los datos.
-- ============================================================


-- ============================================================
--  TABLAS
-- ============================================================

-- Miembros autorizados de Gular. Cada perfil se vincula 1:1 con
-- un usuario de Supabase Auth. Si tu usuario NO está en esta tabla,
-- no podés ver ni tocar nada (lo garantizan las reglas de abajo).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null,
  email       text,
  created_at  timestamptz not null default now()
);

-- Categorías de movimientos (ej: Sueldos, Impuestos, Ingresos por proyecto)
create table if not exists public.categorias (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  tipo        text not null check (tipo in ('ingreso','egreso')),
  color       text not null default '#64748b',
  created_at  timestamptz not null default now()
);

-- Proyectos / clientes de Gular (opcional por movimiento)
create table if not exists public.proyectos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Movimientos de caja (lo central)
create table if not exists public.movimientos (
  id               uuid primary key default gen_random_uuid(),
  tipo             text not null check (tipo in ('ingreso','egreso')),
  monto            numeric(14,2) not null check (monto > 0),
  moneda           text not null default 'ARS' check (moneda in ('ARS','USD')),
  fecha            date not null default current_date,
  descripcion      text not null,
  categoria_id     uuid references public.categorias(id) on delete set null,
  proyecto_id      uuid references public.proyectos(id) on delete set null,
  comprobante_path text,                       -- ruta del archivo en Storage (opcional)
  created_by       uuid not null references public.profiles(id),  -- quién lo cargó
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Índices: hacen que las consultas filtradas sean instantáneas aunque
-- haya miles de movimientos.
create index if not exists idx_mov_fecha     on public.movimientos (fecha desc);
create index if not exists idx_mov_categoria on public.movimientos (categoria_id);
create index if not exists idx_mov_proyecto  on public.movimientos (proyecto_id);
create index if not exists idx_mov_creador   on public.movimientos (created_by);


-- Mantiene updated_at al día automáticamente
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_mov_touch on public.movimientos;
create trigger trg_mov_touch before update on public.movimientos
  for each row execute function public.touch_updated_at();


-- ============================================================
--  SEGURIDAD — Row Level Security (RLS)
-- ------------------------------------------------------------
--  Regla de oro: SOLO usuarios autenticados que además son
--  miembros (están en la tabla profiles) pueden leer/escribir.
--  Un atacante sin sesión no ve absolutamente nada.
-- ============================================================

-- Helper: ¿el usuario actual es miembro de Gular?
-- SECURITY DEFINER para que pueda consultar profiles sin entrar en
-- recursión con las propias reglas de profiles.
create or replace function public.es_miembro()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

-- Activar RLS en todas las tablas (sin esto, las reglas no aplican)
alter table public.profiles    enable row level security;
alter table public.categorias  enable row level security;
alter table public.proyectos   enable row level security;
alter table public.movimientos enable row level security;

-- --- profiles ---
drop policy if exists "miembros leen perfiles" on public.profiles;
create policy "miembros leen perfiles" on public.profiles
  for select using (public.es_miembro());

-- --- categorias ---
drop policy if exists "miembros leen categorias" on public.categorias;
create policy "miembros leen categorias" on public.categorias
  for select using (public.es_miembro());
drop policy if exists "miembros gestionan categorias" on public.categorias;
create policy "miembros gestionan categorias" on public.categorias
  for all using (public.es_miembro()) with check (public.es_miembro());

-- --- proyectos ---
drop policy if exists "miembros leen proyectos" on public.proyectos;
create policy "miembros leen proyectos" on public.proyectos
  for select using (public.es_miembro());
drop policy if exists "miembros gestionan proyectos" on public.proyectos;
create policy "miembros gestionan proyectos" on public.proyectos
  for all using (public.es_miembro()) with check (public.es_miembro());

-- --- movimientos ---
drop policy if exists "miembros leen movimientos" on public.movimientos;
create policy "miembros leen movimientos" on public.movimientos
  for select using (public.es_miembro());

drop policy if exists "miembros crean movimientos" on public.movimientos;
create policy "miembros crean movimientos" on public.movimientos
  for insert with check (public.es_miembro() and created_by = auth.uid());

drop policy if exists "miembros editan movimientos" on public.movimientos;
create policy "miembros editan movimientos" on public.movimientos
  for update using (public.es_miembro()) with check (public.es_miembro());

drop policy if exists "miembros borran movimientos" on public.movimientos;
create policy "miembros borran movimientos" on public.movimientos
  for delete using (public.es_miembro());


-- ============================================================
--  SEGURIDAD — Storage (comprobantes/facturas)
-- ------------------------------------------------------------
--  Antes de correr esto, creá el bucket:
--    Supabase → "Storage" → "New bucket"
--    Nombre: comprobantes   |   Public: NO (privado)
--  Así los archivos NO quedan accesibles por URL pública: solo
--  los miembros con sesión pueden verlos (vía URL firmada temporal).
-- ============================================================

drop policy if exists "miembros ven comprobantes" on storage.objects;
create policy "miembros ven comprobantes" on storage.objects
  for select using (bucket_id = 'comprobantes' and public.es_miembro());

drop policy if exists "miembros suben comprobantes" on storage.objects;
create policy "miembros suben comprobantes" on storage.objects
  for insert with check (bucket_id = 'comprobantes' and public.es_miembro());

drop policy if exists "miembros borran comprobantes" on storage.objects;
create policy "miembros borran comprobantes" on storage.objects
  for delete using (bucket_id = 'comprobantes' and public.es_miembro());


-- ============================================================
--  DATOS INICIALES (categorías y proyectos de arranque)
--  Se insertan solo si la tabla está vacía.
-- ============================================================
insert into public.categorias (nombre, tipo, color)
select * from (values
  ('Ingresos por proyecto', 'ingreso', '#16a34a'),
  ('Otros ingresos',        'ingreso', '#0ea5e9'),
  ('Sueldos',               'egreso',  '#dc2626'),
  ('Herramientas / Software','egreso', '#9333ea'),
  ('Impuestos',             'egreso',  '#ea580c'),
  ('Retiros socios',        'egreso',  '#f59e0b'),
  ('Otros gastos',          'egreso',  '#78716c')
) as v(nombre, tipo, color)
where not exists (select 1 from public.categorias);

insert into public.proyectos (nombre)
select * from (values
  ('Meridian'), ('Martegani'), ('Santal'), ('General Gular')
) as v(nombre)
where not exists (select 1 from public.proyectos);


-- ============================================================
--  PASO FINAL — dar de alta a los miembros
-- ------------------------------------------------------------
--  1) En Supabase → "Authentication" → "Users" → "Add user"
--     creá los usuarios (email + contraseña) para vos y tu socio.
--  2) Después corré esto (cambiá el nombre/email por los reales)
--     para que esos usuarios sean MIEMBROS de Gular:
--
--  insert into public.profiles (id, nombre, email)
--  select id, 'Lucas', email from auth.users
--  where email = 'lucascolari@hotmail.com'
--  on conflict (id) do nothing;
--
--  insert into public.profiles (id, nombre, email)
--  select id, 'Socio', email from auth.users
--  where email = 'EMAIL_DE_TU_SOCIO'
--  on conflict (id) do nothing;
-- ============================================================
