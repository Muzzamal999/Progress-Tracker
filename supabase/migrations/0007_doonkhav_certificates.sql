-- DOONKHAV Technologies rebrand + Program/Batch Completion certificates.
-- Additive and idempotent: no table is dropped, no row is deleted, no existing column changes type.
-- Run once, as a single transaction, from this file (see README "Applying migration 0003 safely" for the pattern).

begin;

-- ===== branding: rebrand the existing singleton row to DOONKHAV Technologies =====
alter table public.organization_settings
  add column if not exists secondary_color text not null default '#D5A33B';
do $$ begin
  alter table public.organization_settings add constraint org_secondary_color_chk check (secondary_color ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null; end $$;

-- Only overwrite the still-default name/colour so a site that has already been customised keeps its choices.
update public.organization_settings
  set org_name = 'DOONKHAV Technologies', accent_color = '#0B2D4A', secondary_color = '#D5A33B'
  where org_name = 'Student Journey Atlas' and accent_color = '#4f46e5';

-- ===== certificates: support a second, badge-less "program/batch completion" certificate type =====
do $$ begin
  create type public.certificate_type as enum ('skill', 'completion');
exception when duplicate_object then null; end $$;

alter table public.certificates
  add column if not exists certificate_type public.certificate_type not null default 'skill',
  add column if not exists batch_id     uuid references public.batches(id) on delete set null,
  add column if not exists program_name text,  -- snapshot: class name at issuance
  add column if not exists batch_name   text,  -- snapshot: batch name at issuance
  add column if not exists started_on   date,
  add column if not exists completed_on date,
  add column if not exists issued_by    uuid references auth.users(id) on delete set null;

-- A skill certificate still needs its badge; a completion certificate needs its batch, not a badge.
alter table public.certificates alter column badge_id drop not null;
do $$ begin
  alter table public.certificates add constraint certificates_type_shape_chk check (
    (certificate_type = 'skill' and badge_id is not null and badge_name is not null)
    or
    (certificate_type = 'completion' and batch_id is not null and batch_name is not null)
  );
exception when duplicate_object then null; end $$;

-- One completion certificate per student per batch (re-issuing updates it in place; see the RPC below).
create unique index if not exists certificates_completion_uq on public.certificates (student_id, batch_id) where certificate_type = 'completion';

-- ===== admin RPC: issue (or re-issue) a program/batch completion certificate =====
-- Manually triggered by an admin, per the chosen business rule (not date-automatic). Idempotent: calling it
-- again for the same student+batch updates the same certificate row instead of creating a duplicate.
create or replace function public.issue_completion_certificate(p_student uuid, p_batch uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_batch_name text; v_class_name text; v_starts date; v_ends date; v_cert_id uuid;
begin
  if not public.is_admin() then raise exception 'not authorized' using errcode = '42501'; end if;

  select s.name into v_name from public.students s where s.id = p_student;
  if v_name is null then raise exception 'Student not found'; end if;

  select b.name, c.name, b.starts_on, b.ends_on
    into v_batch_name, v_class_name, v_starts, v_ends
    from public.batches b join public.classes c on c.id = b.class_id
    where b.id = p_batch;
  if v_batch_name is null then raise exception 'Batch not found'; end if;

  insert into public.certificates (
    certificate_number, student_id, badge_id, certificate_type, student_name, badge_name,
    verified_projects, batch_id, program_name, batch_name, started_on, completed_on, issued_by
  ) values (
    'CERT-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
    p_student, null, 'completion', v_name, null,
    (select count(*) from public.submissions where student_id = p_student and status = 'approved'),
    p_batch, v_class_name, v_batch_name, v_starts, coalesce(v_ends, current_date), auth.uid()
  )
  on conflict (student_id, batch_id) where certificate_type = 'completion' do update
    set revoked_at = null, revoke_reason = null, issued_at = now(), student_name = excluded.student_name,
        verified_projects = excluded.verified_projects, program_name = excluded.program_name,
        batch_name = excluded.batch_name, started_on = excluded.started_on, completed_on = excluded.completed_on,
        issued_by = excluded.issued_by
  returning id into v_cert_id;

  return v_cert_id;
end $$;
revoke all on function public.issue_completion_certificate(uuid, uuid) from public, anon;
grant execute on function public.issue_completion_certificate(uuid, uuid) to authenticated;

-- ===== public verification: now reports the certificate type and completion fields too =====
create or replace function public.verify_certificate(p_number text)
returns table (
  certificate_number text, certificate_type public.certificate_type, student_name text, badge_name text,
  verified_projects int, program_name text, batch_name text, completed_on date,
  issued_at timestamptz, valid boolean, revoked_at timestamptz, org_name text
)
language sql stable security definer set search_path = public as $$
  select c.certificate_number, c.certificate_type, c.student_name, c.badge_name, c.verified_projects,
         c.program_name, c.batch_name, c.completed_on,
         c.issued_at, c.revoked_at is null, c.revoked_at, o.org_name
  from public.certificates c cross join public.organization_settings o
  where c.certificate_number = upper(trim(p_number));
$$;
grant execute on function public.verify_certificate(text) to anon, authenticated;

commit;
