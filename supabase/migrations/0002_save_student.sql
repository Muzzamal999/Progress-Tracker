-- Atomic create/update of a student, its private email and its whole project list.
-- Everything runs in one transaction: either all of it is saved or none of it.
--
-- student  = { id?, slug?, name, email?, track, badge, skills[], image_url?, image_public_id? }
-- projects = [ { title, type, solo, stack[], link? }, ... ]  (array order becomes `position`)
-- Returns the student's uuid.

create or replace function public.save_student(student jsonb, projects jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  sid     uuid;
  p       jsonb;
  idx     int := 0;
  v_email text := nullif(trim(student->>'email'), '');
  v_skills text[] := coalesce(array(select jsonb_array_elements_text(coalesce(student->'skills', '[]'::jsonb))), '{}');
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  sid := nullif(student->>'id', '')::uuid;

  if sid is null then
    insert into public.students (slug, name, image_url, image_public_id, track, badge, skills)
    values (
      student->>'slug',
      student->>'name',
      student->>'image_url',
      student->>'image_public_id',
      (student->>'track')::public.track,
      (student->>'badge')::public.badge_level,
      v_skills
    )
    returning id into sid;
  else
    -- slug is intentionally NOT updated: shared links must keep working
    update public.students set
      name            = student->>'name',
      image_url       = student->>'image_url',
      image_public_id = student->>'image_public_id',
      track           = (student->>'track')::public.track,
      badge           = (student->>'badge')::public.badge_level,
      skills          = v_skills
    where id = sid;
    if not found then
      raise exception 'student not found' using errcode = 'P0002';
    end if;
    delete from public.projects where student_id = sid;
  end if;

  if v_email is null then
    delete from public.student_private where student_id = sid;
  else
    insert into public.student_private (student_id, email) values (sid, v_email)
    on conflict (student_id) do update set email = excluded.email;
  end if;

  for p in select * from jsonb_array_elements(coalesce(projects, '[]'::jsonb)) loop
    insert into public.projects (student_id, title, type, solo, stack, link, position)
    values (
      sid,
      p->>'title',
      (p->>'type')::public.project_type,
      coalesce((p->>'solo')::boolean, true),
      coalesce(array(select jsonb_array_elements_text(coalesce(p->'stack', '[]'::jsonb))), '{}'),
      nullif(p->>'link', ''),
      idx
    );
    idx := idx + 1;
  end loop;

  return sid;
end;
$$;

revoke all on function public.save_student(jsonb, jsonb) from public, anon;
grant execute on function public.save_student(jsonb, jsonb) to authenticated;
