-- 27_open_jobs_excluded.sql
--
-- Run 26 first and let it commit — this file references 'open', which the
-- enum only accepts once 26's transaction is behind it.
--
-- An open job is a job that has been started at the counter and not finished.
-- It is not a visit, not revenue, and not evidence the customer came in. Three
-- views counted it as all three the moment such a job could exist.
--
-- ── what did NOT need changing, and why ──────────────────────────────────
-- The revenue views — v_revenue_by_category, v_revenue_by_month,
-- v_revenue_by_service — and v_job_totals all sum lines filtered to
-- `ji.status = 'done'`. New job writes its lines 'open' and flips them to
-- 'done' only on completion, so an open job contributes zero to all of them
-- with no change here. That is a property of 26's design, not luck, and it is
-- why the line status is a real fourth state rather than a flag on the job.
--
-- v_job_totals additionally selects j.status through unfiltered, so screens
-- that want completed-only money filter it client-side rather than needing a
-- second view.
--
-- v_lapsed_customers reads v_customer_activity and needs no edit of its own:
-- once the base view stops seeing open jobs, a customer whose only recent job
-- is open goes back to reporting their last *completed* visit, and a customer
-- with no completed jobs at all has last_job null and is excluded by the
-- view's own `last_job is not null`.

-- ── the line default fails safe ──────────────────────────────────────────
-- job_items.status defaulted to 'done', so any insert omitting the column
-- created a completed line and fired trg_create_reminder — a reminder for
-- work nobody did. That was harmless while lines were only ever written at
-- the end of a job with the status spelled out; it is not harmless now that
-- lines are written before the work happens.
--
-- Nothing relies on the old default. Both insert paths in the app write
-- `status: 'done'` explicitly (NewJob's save and the Jobs edit dialog's
-- added-lines insert), and the Jobs update path does not touch the column at
-- all, so an edit to a completed line cannot knock it back to open.

alter table public.job_items
  alter column status set default 'open'::item_status;

comment on column public.job_items.status is
  'open = entered, work not done yet; done = performed (fires trg_create_reminder); flagged = noticed and recommended; declined = offered and refused. Defaults to open so a line that forgets to say makes no reminder.';

-- ── why create or replace, and not drop ──────────────────────────────────
-- A dropped view loses its grants, and grants are what keep technicians out
-- of the cost columns. `create or replace` keeps grants and ownership, and is
-- available here because none of these three changes its column list — only
-- the rows that reach it. The gotcha about `create or replace` being unable
-- to rename or reorder columns is the reason to check that claim, not a
-- reason to reach for drop: all three keep every column, in order, with the
-- same types.
--
-- No GRANT statements appear below, deliberately. Re-granting after a replace
-- is at best redundant, and at worst wrong — this file cannot know what the
-- current grants are, and a guess that names one role too many would widen
-- access while looking like diligence. The baseline captured before this runs
-- is the only authority on what these should be; the verification query at the
-- foot diffs against it.
--
-- What `create or replace` does NOT keep is reloptions. The replace path runs
-- AT_ReplaceRelOptions, which replaces the option list outright rather than
-- merging it, so a view carrying `security_invoker = true` and rebuilt without
-- a `with` clause silently reverts to running as its owner — RLS on the
-- underlying tables stops applying, and no grant listing anywhere shows a
-- difference. Each block below therefore reads the current options first and
-- puts them back afterwards, whatever they are.

-- ── v_customer_activity ──────────────────────────────────────────────────
do $migrate$
declare
  saved text[];
begin
  select c.reloptions into saved
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'v_customer_activity';

  execute $view$
    create or replace view public.v_customer_activity as
    select cu.id                                 as customer_id,
           cu.name_en,
           cu.name_ar,
           cu.phone,
           cu.whatsapp_opt_in,
           min(j.start_date)                     as first_job,
           max(j.start_date)                     as last_job,
           count(distinct j.id)                  as jobs,
           coalesce(sum(l.revenue), (0)::numeric) as lifetime_revenue,
           (current_date - max(j.start_date))    as days_since_last
      from customers cu
      -- The status test belongs in the join condition, not a where clause.
      -- This is a left join: a where clause on the right-hand table turns it
      -- into an inner one, and every customer who has never had a completed
      -- job would drop out of the view entirely instead of appearing with
      -- jobs = 0 and last_job null. Those are exactly the customers the
      -- contact-health and lapsed screens exist to surface.
      --
      -- 'completed' rather than "not open": a cancelled job is abandoned
      -- entry, and counting it as a visit would un-lapse a customer who never
      -- actually came in.
      left join jobs j
        on j.customer_id = cu.id
       and j.status = 'completed'::job_status
      left join lateral (
            select coalesce(
                     sum(ji.part_price + ji.labor_price + ji.sub_price),
                     (0)::numeric
                   ) as revenue
              from job_items ji
             where ji.job_id = j.id
               and ji.status = 'done'::item_status
          ) l on true
     group by cu.id, cu.name_en, cu.name_ar, cu.phone, cu.whatsapp_opt_in;
  $view$;

  if saved is not null then
    execute format('alter view public.v_customer_activity set (%s)',
                   array_to_string(saved, ', '));
  end if;
end
$migrate$;

-- ── v_retention_by_month ─────────────────────────────────────────────────
-- Both halves need the filter: the month spine, so a month whose only job is
-- open does not appear as a month at all, and the join, so an open job does
-- not make its customer active in a month they were not.
--
-- KNOWN, PRE-EXISTING, DELIBERATELY NOT FIXED HERE: active_customers is
-- `count(*)` over a row set that has one row per job, so a customer with two
-- jobs in a month is counted twice — the column reports jobs, not customers,
-- and new_customers/returning_customers are split the same way. The fix is
-- `count(distinct j.customer_id)` in all three, but it would move every
-- historical figure on the Stats screen, which is a decision about the
-- numbers rather than a consequence of open jobs. Raised separately.
do $migrate$
declare
  saved text[];
begin
  select c.reloptions into saved
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'v_retention_by_month';

  execute $view$
    create or replace view public.v_retention_by_month as
    select m.month,
           count(*) filter (
             where (date_trunc('month', (a.first_job)::timestamp with time zone))::date = m.month
           ) as new_customers,
           count(*) filter (
             where (date_trunc('month', (a.first_job)::timestamp with time zone))::date < m.month
           ) as returning_customers,
           count(*) as active_customers
      from (
            select distinct
                   (date_trunc('month', (jobs.start_date)::timestamp with time zone))::date as month
              from jobs
             where jobs.status = 'completed'::job_status
           ) m
      join jobs j
        on (date_trunc('month', (j.start_date)::timestamp with time zone))::date = m.month
       and j.status = 'completed'::job_status
      join v_customer_activity a
        on a.customer_id = j.customer_id
     group by m.month
     order by m.month;
  $view$;

  if saved is not null then
    execute format('alter view public.v_retention_by_month set (%s)',
                   array_to_string(saved, ', '));
  end if;
end
$migrate$;

-- ── v_service_usage ──────────────────────────────────────────────────────
-- Feeds the service picker's ordering, so an open job's lines would push a
-- service up the list before anyone had performed it — and a job abandoned
-- at the counter would leave that distortion behind permanently.
--
-- Filtered on the job, not the line. With lines flipped to 'done' at
-- completion, an 'open' line only ever survives on an open or cancelled job,
-- and both are excluded here. A 'flagged' or 'declined' line on a completed
-- job still counts as a use — that is the existing behaviour and arguably
-- wrong, but it is a separate question from this one and no such lines exist.
do $migrate$
declare
  saved text[];
begin
  select c.reloptions into saved
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'v_service_usage';

  execute $view$
    create or replace view public.v_service_usage as
    select ji.service_id,
           count(*) as uses,
           count(*) filter (where j.start_date > (current_date - 90)) as uses_90d,
           max(j.start_date) as last_used
      from job_items ji
      join jobs j on j.id = ji.job_id
     where j.status = 'completed'::job_status
     group by ji.service_id;
  $view$;

  if saved is not null then
    execute format('alter view public.v_service_usage set (%s)',
                   array_to_string(saved, ', '));
  end if;
end
$migrate$;

-- ── after applying ───────────────────────────────────────────────────────
-- No type regeneration is needed for this file: a default and three view
-- bodies do not appear in the generated types. 26 is the one that does.
--
-- 1. Grants and reloptions — run the same query captured as the baseline and
--    diff. Nothing should differ, on any view, including ones not touched
--    here (a difference elsewhere would mean something cascaded):
--
--      select c.relname                                as view,
--             coalesce(g.rolname, 'PUBLIC')            as grantee,
--             string_agg(acl.privilege_type, ', '
--                        order by acl.privilege_type)  as privileges,
--             max(o.rolname)                           as owner,
--             max(array_to_string(c.reloptions, ', ')) as reloptions
--        from pg_class c
--        join pg_namespace n on n.oid = c.relnamespace
--        join pg_roles o     on o.oid = c.relowner
--        cross join lateral
--             aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) as acl
--        left join pg_roles g on g.oid = acl.grantee
--       where n.nspname = 'public'
--         and c.relkind = 'v'
--       group by c.relname, g.rolname
--       order by c.relname, grantee;
--
-- 2. The default:
--
--      select column_default
--        from information_schema.columns
--       where table_schema = 'public'
--         and table_name = 'job_items'
--         and column_name = 'status';
--
--    Expected: 'open'::item_status
--
-- 3. The views still see every completed job and nothing else. All 22 jobs
--    are 'completed' today, so every figure below must read the same after
--    this file as before it. This migration is a no-op against current data;
--    anything that moves is a mistake in it, not a consequence of it. Run it
--    once before and once after:
--
--      select (select count(*) from public.v_customer_activity
--               where jobs > 0)                             as customers_with_jobs,
--             (select count(*) from public.v_lapsed_customers)
--                                                           as lapsed,
--             (select count(*) from public.v_retention_by_month)
--                                                           as retention_months,
--             (select coalesce(sum(active_customers), 0)
--                from public.v_retention_by_month)          as retention_total,
--             (select count(*) from public.v_service_usage) as services_used,
--             (select coalesce(sum(uses), 0)
--                from public.v_service_usage)               as service_uses;
