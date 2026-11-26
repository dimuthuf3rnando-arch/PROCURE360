import {
  Area,
  AreaChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AwardTrendItem, DimensionScores } from '../../types/api';
import { formatCompactLKR, formatCompactNumber, formatLKR, formatNumber } from '../../lib/format';

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-lift">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-1 text-[13px] font-semibold text-ink">{formatLKR(payload[0].value)}</p>
      {payload[0].payload?.count !== undefined && (
        <p className="mt-0.5 text-[10.5px] text-muted">{formatNumber(payload[0].payload.count)} award(s)</p>
      )}
    </div>
  );
}

export function AwardTrendChart({ data }: { data: AwardTrendItem[] }) {
  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="awardFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--forest)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--forest)" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 5" vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} dy={8} interval="preserveStartEnd" />
          <YAxis
            axisLine={false}
            tickLine={false}
            tickFormatter={(value: number) => formatCompactNumber(value)}
            width={52}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--forest)', strokeDasharray: '4 4' }} />
          <Area
            type="monotone"
            dataKey="total_lkr"
            stroke="var(--forest)"
            strokeWidth={2.2}
            fill="url(#awardFill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function RadarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lift">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold text-ink">{Number(payload[0].value).toFixed(2)} / 5</p>
    </div>
  );
}

export function ScoreRadar({ dimensions }: { dimensions: DimensionScores }) {
  const data = [
    { axis: 'Quality', value: dimensions.quality ?? 0 },
    { axis: 'Schedule', value: dimensions.schedule ?? 0 },
    { axis: 'Compliance', value: dimensions.compliance ?? 0 },
    { axis: 'Safety', value: dimensions.safety ?? 0 },
  ];
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="72%">
          <PolarGrid stroke="var(--line)" />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fill: 'var(--muted)', fontSize: 10.5, fontFamily: 'Inter' }}
          />
          <PolarRadiusAxis domain={[0, 5]} tick={false} axisLine={false} />
          <Radar
            dataKey="value"
            stroke="var(--forest)"
            fill="var(--forest)"
            fillOpacity={0.18}
            strokeWidth={2}
          />
          <Tooltip content={<RadarTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MiniBars({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 1);
  return (
    <span className={`inline-flex h-6 items-end gap-[3px] ${className ?? ''}`} aria-hidden>
      {values.map((value, index) => (
        <span
          key={index}
          className="w-[3px] rounded-full bg-forest"
          style={{ height: `${Math.max(12, (value / max) * 100)}%`, opacity: 0.35 + (index / values.length) * 0.65 }}
        />
      ))}
    </span>
  );
}

export function chartAxisCurrency(value: number): string {
  return formatCompactLKR(value);
}
