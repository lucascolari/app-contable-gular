-- ============================================================
--  MIGRACIÓN — Sección de Inversiones
-- ------------------------------------------------------------
--  Corré este archivo UNA sola vez en Supabase:
--    Supabase → "SQL Editor" → "New query" → pegá TODO → "Run"
--
--  Qué hace:
--   • Crea la tabla "inversiones" (cripto, acciones, oro, otras).
--   • La conecta con la caja: al invertir, la plata SALE de la caja
--     (se crea un egreso); al retirar, VUELVE (se crea un ingreso).
--   • Aplica las mismas reglas de seguridad (RLS) que el resto:
--     solo miembros de Gular pueden ver/tocar.
--  Es seguro: no borra ni toca tus datos actuales.
-- ============================================================


-- ---------- Tabla de inversiones ----------
create table if not exists public.inversiones (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('cripto','acciones','oro','otras')),
  nombre          text not null,                               -- ej: Bitcoin, Apple, Oro
  monto_invertido numeric(14,2) not null check (monto_invertido > 0),  -- capital puesto
  valor_actual    numeric(14,2) not null check (valor_actual >= 0),    -- cuánto vale hoy (a mano)
  moneda          text not null default 'USD' check (moneda in ('ARS','USD')),
  fecha           date not null default current_date,
  estado          text not null default 'activa' check (estado in ('activa','cerrada')),
  notas           text,
  created_by      uuid not null references public.profiles(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- Enlace con la caja (movimientos) ----------
-- Cada inversión genera movimientos de caja. Si se borra la inversión,
-- sus movimientos asociados se borran solos (on delete cascade).
alter table public.movimientos
  add column if not exists inversion_id uuid
  references public.inversiones(id) on delete cascade;

create index if not exists idx_mov_inversion on public.movimientos (inversion_id);
create index if not exists idx_inv_estado    on public.inversiones (estado);

-- ---------- updated_at automático ----------
drop trigger if exists trg_inv_touch on public.inversiones;
create trigger trg_inv_touch before update on public.inversiones
  for each row execute function public.touch_updated_at();

-- ---------- Seguridad (RLS): solo miembros ----------
alter table public.inversiones enable row level security;

drop policy if exists "miembros leen inversiones" on public.inversiones;
create policy "miembros leen inversiones" on public.inversiones
  for select using (public.es_miembro());

drop policy if exists "miembros crean inversiones" on public.inversiones;
create policy "miembros crean inversiones" on public.inversiones
  for insert with check (public.es_miembro() and created_by = auth.uid());

drop policy if exists "miembros editan inversiones" on public.inversiones;
create policy "miembros editan inversiones" on public.inversiones
  for update using (public.es_miembro()) with check (public.es_miembro());

drop policy if exists "miembros borran inversiones" on public.inversiones;
create policy "miembros borran inversiones" on public.inversiones
  for delete using (public.es_miembro());

-- ---------- Categoría "Inversiones" (para los movimientos de caja) ----------
insert into public.categorias (nombre, tipo, color)
select 'Inversiones', 'egreso', '#2563eb'
where not exists (select 1 from public.categorias where nombre = 'Inversiones');
