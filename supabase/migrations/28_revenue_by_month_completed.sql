-- 28_revenue_by_month_completed.sql
--
-- Stats counted a job that had not happened.
--
-- 27 filtered the three views that count *visits* and left the revenue views
-- alone, on the grounds that they all sum lines filtered to 'done' so an open
-- job is worth zero to them. That was true of the money and false of
-- everything beside it: v_revenue_by_month is built `from jobs j join lateral
-- (…done lines…)`, so the lateral protects `revenue` and nothing protects the
-- job count. With one job open, the Stats jobs tile read 23 against 22
-- completed jobs. The comment in 27 saying these views needed no change has
-- been corrected.
--
-- The view is wrong in two places, both fixed by the same predicate:
--
--   * the month spine. `month` is grouped from j.start_date over every job, so
--     a month whose only job was open would appear as a row of its own — an
--     empty point on the trend and an extra entry in "{n} months with jobs".
--   * count(distinct j.id), and with it count(distinct j.customer_id) and
--     avg_job_value, whose denominator is that same count. An open job with no
--     revenue does not just add one to the tally; it drags the average job
--     value down by dividing real money over imaginary work.
--
-- Fixing this view alone clears the Jobs tile, the Average job tile, the job
-- line on the revenue trend, and the months note. Stats reads `jobs`, `revenue`
-- and `times_done` and computes its own average from the first two, so nothing
-- else on that screen is downstream of it.
--
-- ── the other two revenue views, and why they are not here ───────────────
-- v_revenue_by_category and v_revenue_by_service are correct already, but by
-- accident of their shape rather than by saying so. Both are
--
--   from job_items ji join jobs j on j.id = ji.job_id … where ji.status = 'done'
--
-- an *inner* join filtered to done lines, so a job with no done lines produces
-- no rows at all and drops out of `jobs`, `lines` and `times_done` without
-- anybody filtering on the job's own status.
--
-- That is worth knowing before touching them. Loosening either join to an
-- outer one, or moving the ji.status test into the join condition instead of
-- the where clause, would let open jobs back in — and would do it silently,
-- because the numbers would still look plausible. If either view is ever
-- rewritten, give it `and j.status = 'completed'` explicitly rather than
-- relying on the join to keep doing this job.

-- ── v_revenue_by_month ───────────────────────────────────────────────────
-- Same shape as 27: `create or replace`, because the column list is unchanged
-- and a drop would take the view's grants with it — grants being what keeps
-- technicians out of the cost columns. The replace path keeps grants but
-- replaces reloptions outright, so a view carrying security_invoker = true and
-- rebuilt without a `with` clause would silently revert to running as its
-- owner. The block reads the current options first and puts them back.
do $migrate$
declare
  saved text[];
begin
  select c.reloptions into saved
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'v_revenue_by_month';

  execute $view$
    create or replace view public.v_revenue_by_month as
    select (date_trunc('month', (j.start_date)::timestamp with time zone))::date as month,
           count(distinct j.id)                                                  as jobs,
           count(distinct j.customer_id)                                         as customers,
           sum(l.revenue)                                                        as revenue,
           case
             when count(distinct j.id) > 0
               then round((sum(l.revenue) / (count(distinct j.id))::numeric), 3)
             else null::numeric
           end                                                                   as avg_job_value
      from jobs j
      join lateral (
            select coalesce(
                     sum(((ji.part_price + ji.labor_price) + ji.sub_price)),
                     (0)::numeric
                   ) as revenue
              from job_items ji
             where ji.job_id = j.id
               and ji.status = 'done'::item_status
          ) l on true
     -- A where clause, not a join condition: the join here is to a lateral
     -- that always returns exactly one row, so there is no outer join to
     -- protect and nothing to drop out. This is the opposite of
     -- v_customer_activity in 27, where the same test had to sit in the join
     -- precisely because a where clause there would have deleted every
     -- customer who had never had a completed job.
     --
     -- 'completed' rather than "not open": a cancelled job is not revenue and
     -- not a visit either. Nothing is cancelled today — an abandoned job is
     -- deleted outright — but the enum value still exists and this should not
     -- start counting them if it ever comes back.
     where j.status = 'completed'::job_status
     group by ((date_trunc('month', (j.start_date)::timestamp with time zone))::date)
     order by ((date_trunc('month', (j.start_date)::timestamp with time zone))::date);
  $view$;

  if saved is not null then
    execute format('alter view public.v_revenue_by_month set (%s)',
                   array_to_string(saved, ', '));
  end if;
end
$migrate$;

-- ── after applying ───────────────────────────────────────────────────────
-- No type regeneration: a view body does not appear in the generated types,
-- and the column list is unchanged.
--
-- 1. Unlike 27, this one is NOT a no-op against current data — that is the
--    point. `jobs_counted` must equal `completed_jobs` exactly, and must have
--    fallen by `not_completed` from what it read before:
--
--      select (select coalesce(sum(jobs), 0) from public.v_revenue_by_month)
--               as jobs_counted,
--             (select count(*) from public.jobs where status = 'completed')
--               as completed_jobs,
--             (select count(*) from public.jobs where status <> 'completed')
--               as not_completed;
--
--    With one job open today: jobs_counted 22, completed_jobs 22,
--    not_completed 1. Before this ran, jobs_counted was 23.
--
-- 2. Revenue must not have moved. It was already correct, and a change here
--    would mean the predicate landed somewhere it should not have:
--
--      select coalesce(sum(revenue), 0) as revenue_total
--        from public.v_revenue_by_month;
--
-- 3. Grants and reloptions unchanged, against the baseline from 27:
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
