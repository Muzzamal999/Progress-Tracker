-- Per-student identity override for the class exchange: the admin can show or hide one specific
-- participant's name to whoever they end up talking to, overriding the exchange's own anonymity default.
-- Additive and idempotent: no table is dropped, no row is deleted, no existing column changes type.

begin;

-- null = follow the exchange's is_anonymous setting; true = always reveal this student's name to their
-- counterpart(s); false = always keep this student's name hidden, even if the exchange isn't anonymous.
alter table public.exchange_participants
  add column if not exists reveal_identity boolean;

-- A student can only read their OWN exchange_participants row (RLS), so resolving whether a CONNECTED
-- counterpart's identity should be shown needs this narrow, security-definer lookup: it returns only a
-- yes/no reveal flag per requested student, nothing else about them, and only for students the caller is
-- actually connected to (active or pending) within that exchange.
create or replace function public.exchange_identity_reveals(p_exchange uuid, p_student_ids uuid[])
returns table (student_id uuid, reveal boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := public.current_student_id(); v_default boolean;
begin
  if v_me is null then raise exception 'not authorized' using errcode = '42501'; end if;
  select is_anonymous into v_default from public.exchanges where id = p_exchange;
  if v_default is null then raise exception 'Exchange not found'; end if;

  return query
    select s, coalesce(ep.reveal_identity, not v_default)
    from unnest(p_student_ids) as s
    left join public.exchange_participants ep on ep.exchange_id = p_exchange and ep.student_id = s
    where exists (
      select 1 from public.exchange_connections c
      where c.exchange_id = p_exchange and c.status in ('pending', 'active')
        and ((c.provider_student_id = v_me and c.acceptor_student_id = s) or (c.acceptor_student_id = v_me and c.provider_student_id = s))
    );
end $$;
revoke all on function public.exchange_identity_reveals(uuid, uuid[]) from public, anon;
grant execute on function public.exchange_identity_reveals(uuid, uuid[]) to authenticated;

commit;
