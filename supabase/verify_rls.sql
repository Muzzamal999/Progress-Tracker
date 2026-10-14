-- Sanity checks to run in the SQL editor after setup (as the `anon` role).
set role anon;
select count(*) as students_readable from public.students;          -- works
select count(*) as private_rows_visible from public.student_private; -- must be 0
-- Both of these must fail / affect 0 rows:
-- insert into public.students (slug, name) values ('x','x');
-- update public.students set name = 'x';
reset role;
