-- PDF documents: lab manuals can carry a PDF, and every project submission carries a lab report PDF.
-- Additive: two nullable columns and one helper; submit_project / resubmit_project are replaced so a new
-- submission must include a valid lab report. Existing rows are untouched (lab_report stays null on them).
-- Run it ONCE, inside BEGIN; ... COMMIT;

-- A PDF is stored as {url, public_id, name, pages, bytes}. Like screenshots, it must have been uploaded
-- through our signed Cloudinary flow: a Cloudinary delivery URL and a public_id inside the expected folder.
create or replace function public._check_pdf(a jsonb, folder text, required boolean) returns jsonb
language plpgsql immutable as $$
begin
  if a is null or jsonb_typeof(a) = 'null' then
    if required then raise exception 'Attach your lab report as a PDF'; end if;
    return null;
  end if;
  if jsonb_typeof(a) <> 'object'
     or coalesce(a->>'url', '') !~ '^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/upload/'
     or coalesce(a->>'public_id', '') not like folder || '/%' or (a->>'public_id') like '%..%' then
    raise exception 'Invalid PDF attachment';
  end if;
  return jsonb_build_object(
    'url', a->>'url',
    'public_id', a->>'public_id',
    'name', left(coalesce(nullif(trim(a->>'name'), ''), 'document.pdf'), 200),
    'pages', least(greatest(coalesce((a->>'pages')::int, 1), 1), 1000),
    'bytes', greatest(coalesce((a->>'bytes')::bigint, 0), 0)
  );
end $$;
revoke all on function public._check_pdf(jsonb, text, boolean) from public, anon, authenticated;

alter table public.lab_manuals add column pdf        jsonb check (pdf is null or jsonb_typeof(pdf) = 'object');
alter table public.submissions add column lab_report jsonb check (lab_report is null or jsonb_typeof(lab_report) = 'object');

create or replace function public.submit_project(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid := public._require_ready_student(); v_id uuid;
begin
  insert into public.submissions (student_id, task_id, title, description, type, stack, link, attachments, lab_report)
  values (sid, nullif(p->>'task_id', '')::uuid, left(trim(p->>'title'), 120), nullif(left(trim(coalesce(p->>'description', '')), 4000), ''),
          coalesce((p->>'type')::public.project_type, 'mini'),
          coalesce(array(select jsonb_array_elements_text(coalesce(p->'stack', '[]'::jsonb))), '{}'),
          nullif(trim(coalesce(p->>'link', '')), ''), public._check_attachments(p->'attachments', 1, 'student-journey/evidence'),
          public._check_pdf(p->'lab_report', 'student-journey/lab-reports', true))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.resubmit_project(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid := public._require_ready_student();
begin
  update public.submissions set
    title = left(trim(p->>'title'), 120), description = nullif(left(trim(coalesce(p->>'description', '')), 4000), ''),
    type = coalesce((p->>'type')::public.project_type, type),
    stack = coalesce(array(select jsonb_array_elements_text(coalesce(p->'stack', '[]'::jsonb))), '{}'),
    link = nullif(trim(coalesce(p->>'link', '')), ''), attachments = public._check_attachments(p->'attachments', 1, 'student-journey/evidence'),
    lab_report = public._check_pdf(p->'lab_report', 'student-journey/lab-reports', true),
    status = 'pending', reviewed_by = null, reviewed_at = null, resubmit_count = resubmit_count + 1, submitted_at = now()
  where id = p_id and student_id = sid and status = 'rejected';
  if not found then raise exception 'Only your rejected submissions can be resubmitted'; end if;
end $$;
