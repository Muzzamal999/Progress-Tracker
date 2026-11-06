-- Class/batch communication portal ("Exchange"): admin-configured, anonymous provider <-> acceptor
-- matching between classes/batches (or hand-picked students), with in-app chat and full admin oversight.
-- Additive and idempotent: no table is dropped, no row is deleted, no existing column changes type.
-- Run once, as a single transaction, from this file (same pattern as 0003/0006/0007).

begin;

-- ===== enums =====
do $$ begin create type public.exchange_status as enum ('draft', 'open', 'closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.exchange_role   as enum ('provider', 'acceptor'); exception when duplicate_object then null; end $$;
do $$ begin create type public.connection_status as enum ('pending', 'active', 'rejected', 'ended'); exception when duplicate_object then null; end $$;

-- ===== exchanges: one admin-configured portal between a provider pool and an acceptor pool =====
create table if not exists public.exchanges (
  id                          uuid primary key default gen_random_uuid(),
  title                       text not null check (length(trim(title)) > 0),
  description                 text,
  status                      public.exchange_status not null default 'draft',
  is_anonymous                boolean not null default true,   -- identities hidden in the student-facing UI
  requires_approval           boolean not null default false,  -- if true, a request is 'pending' until an admin decides
  max_connections_per_acceptor int check (max_connections_per_acceptor is null or max_connections_per_acceptor > 0),
  max_connections_per_provider int check (max_connections_per_provider is null or max_connections_per_provider > 0),
  opens_at                    timestamptz,
  closes_at                   timestamptz,
  created_by                  uuid references auth.users(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create table if not exists public.exchange_participants (
  exchange_id uuid not null references public.exchanges(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  role        public.exchange_role not null,
  added_at    timestamptz not null default now(),
  primary key (exchange_id, student_id, role)
);
create index if not exists exchange_participants_student_idx on public.exchange_participants (student_id);

-- ===== listings: what a provider posts (visible to acceptors as an anonymous "box") =====
create table if not exists public.exchange_listings (
  id                 uuid primary key default gen_random_uuid(),
  exchange_id        uuid not null references public.exchanges(id) on delete cascade,
  provider_student_id uuid not null references public.students(id) on delete cascade,
  project_name       text not null check (length(trim(project_name)) between 1 and 160),
  description        text check (description is null or length(description) <= 4000),
  links              jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 8),
  pdf                jsonb,  -- { url, public_id, name, pages, bytes }, optional
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (exchange_id, provider_student_id)
);

-- ===== connections: an acceptor locked onto one provider's listing (the chat "room") =====
create table if not exists public.exchange_connections (
  id                  uuid primary key default gen_random_uuid(),
  exchange_id         uuid not null references public.exchanges(id) on delete cascade,
  listing_id          uuid references public.exchange_listings(id) on delete set null,
  provider_student_id uuid not null references public.students(id) on delete cascade,
  acceptor_student_id uuid not null references public.students(id) on delete cascade,
  status              public.connection_status not null default 'pending',
  requested_at        timestamptz not null default now(),
  decided_at          timestamptz,
  decided_by          uuid references auth.users(id) on delete set null,
  ended_at            timestamptz,
  ended_reason        text
);
create index if not exists exchange_connections_exchange_idx on public.exchange_connections (exchange_id, status);
create index if not exists exchange_connections_provider_idx on public.exchange_connections (exchange_id, provider_student_id, status);
create index if not exists exchange_connections_acceptor_idx on public.exchange_connections (exchange_id, acceptor_student_id, status);

-- ===== messages: the chat thread inside one active connection =====
create table if not exists public.exchange_messages (
  id              uuid primary key default gen_random_uuid(),
  connection_id   uuid not null references public.exchange_connections(id) on delete cascade,
  sender_student_id uuid not null references public.students(id) on delete cascade,
  body            text not null check (length(trim(body)) between 1 and 4000),
  created_at      timestamptz not null default now()
);
create index if not exists exchange_messages_connection_idx on public.exchange_messages (connection_id, created_at);

drop trigger if exists exchanges_touch on public.exchanges;
create trigger exchanges_touch before update on public.exchanges for each row execute function public.touch_updated_at();
drop trigger if exists exchange_listings_touch on public.exchange_listings;
create trigger exchange_listings_touch before update on public.exchange_listings for each row execute function public.touch_updated_at();

-- ===== RPCs: all connection state transitions go through here (validated, idempotent where it matters) =====

-- Acceptor: request to connect to a listing. Requires the caller to be an 'acceptor' participant of that
-- exchange, the exchange to be open (and within its window), the listing active, and under the configured caps.
-- Re-requesting the same listing while already pending/active just returns the existing connection.
create or replace function public.request_connection(p_listing_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_acceptor uuid := public.current_student_id();
  v_exchange uuid; v_provider uuid; v_listing_active boolean;
  v_status public.exchange_status; v_requires_approval boolean; v_opens timestamptz; v_closes timestamptz;
  v_max_acceptor int; v_max_provider int; v_count int; v_conn uuid;
begin
  if v_acceptor is null then raise exception 'not authorized' using errcode = '42501'; end if;

  select exchange_id, provider_student_id, is_active into v_exchange, v_provider, v_listing_active
    from public.exchange_listings where id = p_listing_id;
  if v_exchange is null then raise exception 'Listing not found'; end if;
  if not v_listing_active then raise exception 'This listing is no longer accepting connections'; end if;

  select status, requires_approval, opens_at, closes_at, max_connections_per_acceptor, max_connections_per_provider
    into v_status, v_requires_approval, v_opens, v_closes, v_max_acceptor, v_max_provider
    from public.exchanges where id = v_exchange;
  if v_status <> 'open' or (v_opens is not null and now() < v_opens) or (v_closes is not null and now() >= v_closes) then
    raise exception 'This exchange is not currently open';
  end if;
  if not exists (select 1 from public.exchange_participants where exchange_id = v_exchange and student_id = v_acceptor and role = 'acceptor') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select id into v_conn from public.exchange_connections
    where exchange_id = v_exchange and acceptor_student_id = v_acceptor and provider_student_id = v_provider and status in ('pending', 'active');
  if v_conn is not null then return v_conn; end if;

  if v_max_acceptor is not null then
    select count(*) into v_count from public.exchange_connections where exchange_id = v_exchange and acceptor_student_id = v_acceptor and status in ('pending', 'active');
    if v_count >= v_max_acceptor then raise exception 'You have reached the maximum number of connections for this exchange'; end if;
  end if;
  if v_max_provider is not null then
    select count(*) into v_count from public.exchange_connections where exchange_id = v_exchange and provider_student_id = v_provider and status in ('pending', 'active');
    if v_count >= v_max_provider then raise exception 'This provider is no longer accepting new connections'; end if;
  end if;

  insert into public.exchange_connections (exchange_id, listing_id, provider_student_id, acceptor_student_id, status, decided_at)
  values (v_exchange, p_listing_id, v_provider, v_acceptor, case when v_requires_approval then 'pending' else 'active' end,
          case when v_requires_approval then null else now() end)
  returning id into v_conn;
  return v_conn;
end $$;

-- Acceptor: withdraw a request that is still awaiting admin approval (can't cancel once active/locked).
create or replace function public.cancel_connection(p_connection uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_acceptor uuid := public.current_student_id(); n int;
begin
  update public.exchange_connections set status = 'ended', ended_at = now(), ended_reason = 'Cancelled by the requester'
    where id = p_connection and acceptor_student_id = v_acceptor and status = 'pending';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nothing to cancel'; end if;
end $$;

-- Admin: approve or reject a pending request.
create or replace function public.admin_decide_connection(p_connection uuid, p_decision public.review_status) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected'; end if;
  update public.exchange_connections
    set status = case when p_decision = 'approved' then 'active' else 'rejected' end, decided_at = now(), decided_by = auth.uid()
    where id = p_connection and status = 'pending';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Request not found or already decided'; end if;
end $$;

-- Admin: directly pair a provider and an acceptor (bypasses listing selection and the configured caps).
create or replace function public.admin_force_connection(p_exchange uuid, p_provider uuid, p_acceptor uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_listing uuid; v_conn uuid;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  if not exists (select 1 from public.exchange_participants where exchange_id = p_exchange and student_id = p_provider and role = 'provider') then
    raise exception 'That student is not a provider in this exchange';
  end if;
  if not exists (select 1 from public.exchange_participants where exchange_id = p_exchange and student_id = p_acceptor and role = 'acceptor') then
    raise exception 'That student is not an acceptor in this exchange';
  end if;

  select id into v_conn from public.exchange_connections
    where exchange_id = p_exchange and provider_student_id = p_provider and acceptor_student_id = p_acceptor and status in ('pending', 'active');
  if v_conn is not null then
    update public.exchange_connections set status = 'active', decided_at = now(), decided_by = auth.uid() where id = v_conn;
    return v_conn;
  end if;

  select id into v_listing from public.exchange_listings where exchange_id = p_exchange and provider_student_id = p_provider;
  insert into public.exchange_connections (exchange_id, listing_id, provider_student_id, acceptor_student_id, status, decided_at, decided_by)
  values (p_exchange, v_listing, p_provider, p_acceptor, 'active', now(), auth.uid())
  returning id into v_conn;
  return v_conn;
end $$;

-- Admin: end a connection (frees the acceptor to request someone else, if the exchange allows it).
create or replace function public.admin_end_connection(p_connection uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  update public.exchange_connections set status = 'ended', ended_at = now(),
    ended_reason = coalesce(nullif(trim(p_reason), ''), 'Ended by an administrator')
    where id = p_connection and status in ('pending', 'active');
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Connection not found or already ended'; end if;
end $$;

revoke all on function public.request_connection(uuid), public.cancel_connection(uuid),
  public.admin_decide_connection(uuid, public.review_status), public.admin_force_connection(uuid, uuid, uuid),
  public.admin_end_connection(uuid, text) from public, anon;
grant execute on function public.request_connection(uuid), public.cancel_connection(uuid),
  public.admin_decide_connection(uuid, public.review_status), public.admin_force_connection(uuid, uuid, uuid),
  public.admin_end_connection(uuid, text) to authenticated;

-- ===== RLS =====
alter table public.exchanges              enable row level security;
alter table public.exchange_participants  enable row level security;
alter table public.exchange_listings      enable row level security;
alter table public.exchange_connections   enable row level security;
alter table public.exchange_messages      enable row level security;

create policy "participants read their exchanges" on public.exchanges for select using (
  public.is_admin() or exists (select 1 from public.exchange_participants p where p.exchange_id = exchanges.id and p.student_id = public.current_student_id())
);
create policy "admin writes exchanges" on public.exchanges for all using (public.is_admin()) with check (public.is_admin());

create policy "students read own participation" on public.exchange_participants for select using (
  public.is_admin() or student_id = public.current_student_id()
);
create policy "admin writes participants" on public.exchange_participants for all using (public.is_admin()) with check (public.is_admin());

create policy "participants read listings" on public.exchange_listings for select using (
  public.is_admin()
  or provider_student_id = public.current_student_id()
  or (is_active and exists (select 1 from public.exchange_participants p where p.exchange_id = exchange_listings.exchange_id and p.student_id = public.current_student_id()))
);
create policy "provider creates own listing" on public.exchange_listings for insert with check (
  provider_student_id = public.current_student_id()
  and exists (select 1 from public.exchange_participants p where p.exchange_id = exchange_listings.exchange_id and p.student_id = public.current_student_id() and p.role = 'provider')
  and exists (select 1 from public.exchanges e where e.id = exchange_listings.exchange_id and e.status = 'open')
);
create policy "provider updates own listing" on public.exchange_listings for update using (
  provider_student_id = public.current_student_id()
) with check (provider_student_id = public.current_student_id());
create policy "admin manages listings" on public.exchange_listings for all using (public.is_admin()) with check (public.is_admin());

create policy "connection participants read" on public.exchange_connections for select using (
  public.is_admin() or provider_student_id = public.current_student_id() or acceptor_student_id = public.current_student_id()
);
create policy "admin manages connections" on public.exchange_connections for all using (public.is_admin()) with check (public.is_admin());

create policy "connection participants read messages" on public.exchange_messages for select using (
  public.is_admin() or exists (
    select 1 from public.exchange_connections c
    where c.id = exchange_messages.connection_id
      and (c.provider_student_id = public.current_student_id() or c.acceptor_student_id = public.current_student_id())
  )
);
create policy "connection participants send messages" on public.exchange_messages for insert with check (
  sender_student_id = public.current_student_id()
  and exists (
    select 1 from public.exchange_connections c join public.exchanges e on e.id = c.exchange_id
    where c.id = exchange_messages.connection_id and c.status = 'active'
      and (c.provider_student_id = public.current_student_id() or c.acceptor_student_id = public.current_student_id())
      and e.status = 'open' and (e.closes_at is null or now() < e.closes_at)
  )
);

-- ===== realtime: let the chat subscribe to new messages =====
do $$ begin
  alter publication supabase_realtime add table public.exchange_messages;
exception when duplicate_object then null; end $$;

commit;
