import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Database } from './types/database'
import { supabase } from './lib/supabase'
import { km, money } from './lib/format'
import { todayIso } from './lib/date'
import { customerLabel } from './lib/customer'
import { PERIODS, monthLabel, periodStart, withinPeriod } from './lib/period'
import type { Period } from './lib/period'
import { t, tn } from './lib/i18n'
import {
  AXIS_TICK,
  CHART_INK,
  SERIES,
  TOOLTIP_STYLE,
  compactNumber,
  tooltipNumber,
} from './lib/chart'
import type { TooltipName, TooltipValue } from './lib/chart'

type ByCategory = Database['public']['Views']['v_revenue_by_category']['Row']
type ByService = Database['public']['Views']['v_revenue_by_service']['Row']
type ByMonth = Database['public']['Views']['v_revenue_by_month']['Row']
type Activity = Database['public']['Views']['v_customer_activity']['Row']
type Retention = Database['public']['Views']['v_retention_by_month']['Row']
type Lapsed = Database['public']['Views']['v_lapsed_customers']['Row']

/** A single bar is a number, not a chart — say so instead of drawing one. */
const MIN_POINTS = 2

function Figure({
  title,
  note,
  enough,
  empty,
  children,
}: {
  title: string
  note?: string
  enough: boolean
  empty: string
  children: React.ReactNode
}) {
  return (
    <section className="figure">
      <div className="section-label">
        <span>{title}</span>
        {note && <span className="muted">{note}</span>}
      </div>
      {enough ? children : <p className="empty">{empty}</p>}
    </section>
  )
}

export default function Stats({
  onOpenCustomer,
}: {
  onOpenCustomer: (customerId: string) => void
}) {
  const [byCategory, setByCategory] = useState<ByCategory[]>([])
  const [byService, setByService] = useState<ByService[]>([])
  const [byMonth, setByMonth] = useState<ByMonth[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [retention, setRetention] = useState<Retention[]>([])
  const [lapsed, setLapsed] = useState<Lapsed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [period, setPeriod] = useState<Period>('all-time')
  const today = todayIso()
  const start = periodStart(period, today)

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Fetched whole and filtered in memory: the views are per-month
      // aggregates, so changing period never costs a round trip.
      const [
        categoryResult,
        serviceResult,
        monthResult,
        activityResult,
        retentionResult,
        lapsedResult,
      ] = await Promise.all([
        supabase.from('v_revenue_by_category').select('*'),
        supabase.from('v_revenue_by_service').select('*'),
        supabase.from('v_revenue_by_month').select('*').order('month'),
        supabase.from('v_customer_activity').select('*'),
        supabase.from('v_retention_by_month').select('*').order('month'),
        supabase
          .from('v_lapsed_customers')
          .select('*')
          .order('lifetime_revenue', { ascending: false }),
      ])

      if (cancelled) return

      const failure =
        categoryResult.error ??
        serviceResult.error ??
        monthResult.error ??
        activityResult.error ??
        retentionResult.error ??
        lapsedResult.error

      if (failure) {
        setError(failure.message)
        setLoading(false)
        return
      }

      setByCategory(categoryResult.data ?? [])
      setByService(serviceResult.data ?? [])
      setByMonth(monthResult.data ?? [])
      setActivity(activityResult.data ?? [])
      setRetention(retentionResult.data ?? [])
      setLapsed(lapsedResult.data ?? [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  const months = useMemo(
    () => byMonth.filter((row) => withinPeriod(row.month, start)),
    [byMonth, start],
  )

  const totals = useMemo(() => {
    const revenue = months.reduce((sum, row) => sum + (row.revenue ?? 0), 0)
    const jobs = months.reduce((sum, row) => sum + (row.jobs ?? 0), 0)
    // Recomputed from the sums — averaging the monthly averages would weight
    // a quiet month the same as a busy one.
    const average = jobs > 0 ? revenue / jobs : 0
    const customers = activity.filter((row) =>
      withinPeriod(row.last_job, start),
    ).length
    return { revenue, jobs, average, customers }
  }, [months, activity, start])

  const categoryBars = useMemo(() => {
    const byName = new Map<string, number>()
    for (const row of byCategory) {
      if (!withinPeriod(row.month, start) || !row.category) continue
      byName.set(row.category, (byName.get(row.category) ?? 0) + (row.revenue ?? 0))
    }
    return [...byName.entries()]
      .map(([category, revenue]) => ({ category, revenue }))
      .filter((row) => row.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
  }, [byCategory, start])

  const services = useMemo(() => {
    const merged = new Map<
      string,
      { service: string; category: string; revenue: number; times: number }
    >()
    for (const row of byService) {
      if (!withinPeriod(row.month, start) || !row.service) continue
      const existing = merged.get(row.service) ?? {
        service: row.service,
        category: row.category ?? '',
        revenue: 0,
        times: 0,
      }
      existing.revenue += row.revenue ?? 0
      existing.times += row.times_done ?? 0
      merged.set(row.service, existing)
    }
    const all = [...merged.values()]
    return {
      byRevenue: [...all].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
      byFrequency: [...all].sort((a, b) => b.times - a.times).slice(0, 10),
    }
  }, [byService, start])

  const trend = useMemo(
    () =>
      months.map((row) => ({
        month: monthLabel(row.month),
        revenue: row.revenue ?? 0,
        jobs: row.jobs ?? 0,
      })),
    [months],
  )

  const retentionBars = useMemo(
    () =>
      retention
        .filter((row) => withinPeriod(row.month, start))
        .map((row) => ({
          month: monthLabel(row.month),
          returning: row.returning_customers ?? 0,
          new: row.new_customers ?? 0,
        })),
    [retention, start],
  )

  if (loading) return <p className="muted">{t('app.loading')}</p>

  if (error) {
    return (
      <div className="card notice">
        <p>{t('stats.loadFailed')}</p>
        <p className="muted">{error}</p>
      </div>
    )
  }

  const monthNote = tn(
    months.length,
    'stats.monthsWithJobsOne',
    'stats.monthsWithJobsOther',
  )

  return (
    <>
      <div className="chips stats-periods" role="group" aria-label={t('stats.period')}>
        {PERIODS.map((option) => (
          <button
            type="button"
            key={option.key}
            className="chip"
            aria-pressed={period === option.key}
            onClick={() => setPeriod(option.key)}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>

      <div className="stat-grid">
        <div className="card stat">
          <div className="stat-label">{t('stats.revenue')}</div>
          <div className="stat-value num">
            {money(totals.revenue)}
            <span className="stat-unit">{t('common.currency')}</span>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t('stats.jobs')}</div>
          <div className="stat-value num">{totals.jobs}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t('stats.averageJob')}</div>
          <div className="stat-value num">
            {money(totals.average)}
            <span className="stat-unit">{t('common.currency')}</span>
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t('stats.activeCustomers')}</div>
          <div className="stat-value num">{totals.customers}</div>
        </div>
      </div>

      <Figure
        title={t('stats.byCategory')}
        note={t('stats.withRevenue', { count: categoryBars.length })}
        enough={categoryBars.length >= MIN_POINTS}
        empty={
          categoryBars.length === 0
            ? t('stats.noRevenue')
            : t('stats.onlyOneCategory', {
                category: categoryBars[0].category,
                amount: money(categoryBars[0].revenue),
                currency: t('common.currency'),
              })
        }
      >
        <div className="card chart-card">
          <ResponsiveContainer width="100%" height={Math.max(200, categoryBars.length * 30)}>
            <BarChart
              data={categoryBars}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <CartesianGrid stroke={CHART_INK.grid} horizontal={false} />
              <XAxis
                type="number"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: CHART_INK.grid }}
                tickFormatter={compactNumber}
              />
              <YAxis
                type="category"
                dataKey="category"
                width={150}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(26,28,29,0.04)' }}
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: TooltipValue) => [
                  `${money(tooltipNumber(value))} ${t('common.currency')}`,
                  t('stats.revenue'),
                ]}
              />
              <Bar
                dataKey="revenue"
                fill={SERIES.revenue}
                radius={[0, 4, 4, 0]}
                barSize={14}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Figure>

      <Figure
        title={t('stats.overTime')}
        note={monthNote}
        enough={trend.length >= MIN_POINTS}
        empty={
          trend.length === 0
            ? t('stats.noJobsInPeriod')
            : t('stats.onlyOneMonth', { month: trend[0].month })
        }
      >
        <div className="card chart-card">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis
                dataKey="month"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: CHART_INK.grid }}
              />
              <YAxis
                yAxisId="revenue"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={compactNumber}
              />
              <YAxis
                yAxisId="jobs"
                orientation="right"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: TooltipValue, name: TooltipName) =>
                  name === t('stats.revenue')
                    ? [
                        `${money(tooltipNumber(value))} ${t('common.currency')}`,
                        t('stats.revenue'),
                      ]
                    : [String(tooltipNumber(value)), t('stats.jobs')]
                }
              />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="revenue"
                name={t('stats.revenue')}
                dataKey="revenue"
                stroke={SERIES.revenue}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 0, fill: SERIES.revenue }}
                isAnimationActive={false}
              />
              <Line
                yAxisId="jobs"
                name={t('stats.jobs')}
                dataKey="jobs"
                stroke={SERIES.count}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 0, fill: SERIES.count }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Figure>

      <div className="stats-pair">
        <ServiceBars
          title={t('stats.topByRevenue')}
          rows={services.byRevenue}
          dataKey="revenue"
          color={SERIES.revenue}
          format={(value) => `${money(value)} ${t('common.currency')}`}
          label={t('stats.revenue')}
        />
        <ServiceBars
          title={t('stats.topByFrequency')}
          rows={services.byFrequency}
          dataKey="times"
          color={SERIES.count}
          format={(value) => tn(value, 'stats.timesOne', 'stats.timesOther')}
          label={t('stats.timesDone')}
        />
      </div>

      <Figure
        title={t('stats.retention')}
        note={monthNote}
        enough={retentionBars.length >= MIN_POINTS}
        empty={
          retentionBars.length === 0
            ? t('stats.noneActive')
            : t('stats.onlyOneActiveMonth', { month: retentionBars[0].month })
        }
      >
        <div className="card chart-card">
          <ResponsiveContainer width="100%" height={340}>
            <BarChart
              data={retentionBars}
              margin={{ top: 8, right: 12, bottom: 4, left: 4 }}
            >
              <CartesianGrid stroke={CHART_INK.grid} vertical={false} />
              <XAxis
                dataKey="month"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: CHART_INK.grid }}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(26,28,29,0.04)' }}
                contentStyle={TOOLTIP_STYLE}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* A 2px surface stroke keeps a gap between the stacked fills. */}
              <Bar
                stackId="customers"
                name={t('stats.returning')}
                dataKey="returning"
                fill={SERIES.count}
                stroke={CHART_INK.surface}
                strokeWidth={2}
                barSize={36}
                isAnimationActive={false}
              />
              <Bar
                stackId="customers"
                name={t('stats.new')}
                dataKey="new"
                fill={SERIES.revenue}
                stroke={CHART_INK.surface}
                strokeWidth={2}
                barSize={36}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Figure>

      <section className="figure">
        <div className="section-label">
          <span>{t('stats.lapsed')}</span>
          <span className="muted">{t('stats.lapsedNote')}</span>
        </div>

        {lapsed.length === 0 ? (
          <p className="empty">{t('stats.noLapsed')}</p>
        ) : (
          lapsed.map((row) => (
            <button
              type="button"
              className="card lapsed-row"
              key={row.customer_id}
              onClick={() => row.customer_id && onOpenCustomer(row.customer_id)}
            >
              <div>
                <div className="lapsed-name" dir="auto">
                  {customerLabel(row)}
                </div>
                <div className="list-row-meta num">
                  {row.phone || t('common.noPhone')}
                </div>
              </div>
              <div className="lapsed-side">
                <div className="num list-row-amount">
                  {money(row.lifetime_revenue)}
                </div>
                <div className="list-row-meta">
                  <span className="num">{km(row.days_since_last ?? 0)}</span>{' '}
                  {t('stats.daysSince')}
                </div>
              </div>
            </button>
          ))
        )}
      </section>
    </>
  )
}

type ServiceRow = {
  service: string
  category: string
  revenue: number
  times: number
}

/** Two lines per tick: the service, then its category as secondary text. */
type TickProps = {
  x?: string | number
  y?: string | number
  payload?: { value?: string | number }
}

function ServiceTick({
  x,
  y,
  payload,
  categories,
}: TickProps & { categories: Map<string, string> }) {
  const name = String(payload?.value ?? '')
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text x={-8} y={-3} textAnchor="end" fill="#1a1c1d" fontSize={11}>
        {name.length > 26 ? `${name.slice(0, 25)}…` : name}
      </text>
      <text x={-8} y={9} textAnchor="end" fill={CHART_INK.axis} fontSize={10}>
        {categories.get(name) ?? ''}
      </text>
    </g>
  )
}

function ServiceBars({
  title,
  rows,
  dataKey,
  color,
  format,
  label,
}: {
  title: string
  rows: ServiceRow[]
  dataKey: 'revenue' | 'times'
  color: string
  format: (value: number) => string
  label: string
}) {
  const categories = useMemo(
    () => new Map(rows.map((row) => [row.service, row.category])),
    [rows],
  )

  const withValue = rows.filter((row) => row[dataKey] > 0)

  return (
    <Figure
      title={title}
      note={t('stats.shown', { count: withValue.length })}
      enough={withValue.length >= MIN_POINTS}
      empty={
        withValue.length === 0
          ? t('stats.noServices')
          : t('stats.onlyOneService', { service: withValue[0].service })
      }
    >
      <div className="card chart-card">
        <ResponsiveContainer width="100%" height={Math.max(200, withValue.length * 34)}>
          <BarChart
            data={withValue}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
          >
            <CartesianGrid stroke={CHART_INK.grid} horizontal={false} />
            <XAxis
              type="number"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: CHART_INK.grid }}
              tickFormatter={compactNumber}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="service"
              width={170}
              tickLine={false}
              axisLine={false}
              tick={(props) => <ServiceTick {...props} categories={categories} />}
            />
            <Tooltip
              cursor={{ fill: 'rgba(26,28,29,0.04)' }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value: TooltipValue) => [
                format(tooltipNumber(value)),
                label,
              ]}
            />
            <Bar
              dataKey={dataKey}
              fill={color}
              radius={[0, 4, 4, 0]}
              barSize={14}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Figure>
  )
}
