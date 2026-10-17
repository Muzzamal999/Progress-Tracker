-- Locking: a student's profile is final once completed, and a task can only be submitted once.
-- Additive: replaces update_my_profile and submit_project. Run it ONCE, inside BEGIN; ... COMMIT;
--  * update_my_profile: the first save completes the profile (profile_completed_at); every later call is refused.
--    Admins can still correct a profile (save_student is unchanged).
--  * submit_project: a task that already has a pending/approved submission is locked. Only a REJECTED submission
--    can be changed, and only through resubmit_project (unchanged), which an admin triggers by rejecting it.

create or replace function public.update_my_profile(p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public.current_student_id();
  v_name text := left(trim(p->>'name'), 120);
  v_track public.track := (p->>'track')::public.track;
  v_batch uuid := nullif(p->>'batch_id', '')::uuid;
  v_done timestamptz;
begin
  if sid is null then raise exception 'not a student account' using errcode = '42501'; end if;
  select profile_completed_at into v_done from public.students where id = sid;
  if v_done is not null then raise exception 'Your profile is locked. Ask an administrator if something must change.'; end if;
  if v_name is null or v_name = '' then raise exception 'Name is required'; end if;
  if v_batch is null then raise exception 'Choose your batch'; end if;
  if p ? 'image_url' and p->>'image_url' is not null and (
       p->>'image_url' !~ '^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/upload/'
       or coalesce(p->>'image_public_id', '') not like 'student-journey/avatars/%' or (p->>'image_public_id') like '%..%') then
    raise exception 'Invalid profile image';
  end if;
  if not exists (select 1 from public.batches b join public.classes c on c.id = b.class_id
                 where b.id = v_batch and b.is_active and c.is_active) then
    raise exception 'That batch is not open for enrolment';
  end if;
  update public.students set
    name = v_name, track = v_track, batch_id = v_batch,
    bio = nullif(left(trim(coalesce(p->>'bio', '')), 1000), ''),
    skills = coalesce(array(select jsonb_array_elements_text(coalesce(p->'skills', '[]'::jsonb))), '{}'),
    image_url = case when p ? 'image_url' then p->>'image_url' else image_url end,
    image_public_id = case when p ? 'image_public_id' then p->>'image_public_id' else image_public_id end,
    profile_completed_at = now()
  where id = sid;
end $$;

create or replace function public.submit_project(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid := public._require_ready_student(); v_id uuid; v_task uuid := nullif(p->>'task_id', '')::uuid;
begin
  if v_task is not null and exists (select 1 from public.submissions where student_id = sid and task_id = v_task and status <> 'rejected') then
    raise exception 'You have already submitted this task. Submissions are locked once sent.';
  end if;
  insert into public.submissions (student_id, task_id, title, description, type, stack, link, attachments, lab_report)
  values (sid, v_task, left(trim(p->>'title'), 120), nullif(left(trim(coalesce(p->>'description', '')), 4000), ''),
          coalesce((p->>'type')::public.project_type, 'mini'),
          coalesce(array(select jsonb_array_elements_text(coalesce(p->'stack', '[]'::jsonb))), '{}'),
          nullif(trim(coalesce(p->>'link', '')), ''), public._check_attachments(p->'attachments', 1, 'student-journey/evidence'),
          public._check_pdf(p->'lab_report', 'student-journey/lab-reports', true))
  returning id into v_id;
  return v_id;
end $$;
