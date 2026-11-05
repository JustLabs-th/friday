import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';

/**
 * A chart described in a fenced block tagged `chart`, as JSON:
 *
 *   {"type": "bar", "title": "Latency", "x": "harness", "series": ["p50", "p95"], "data": [{"harness": "A", "p50": 12, "p95": 30}]}
 *
 * `type` is bar, line, area or pie. A pie uses `nameKey` and `valueKey` instead of `x` and `series`.
 */
export interface ChartSpec {
  type: 'bar' | 'line' | 'area' | 'pie';
  title?: string;
  data: Record<string, string | number>[];
  x?: string;
  series?: string[];
  nameKey?: string;
  valueKey?: string;
}

// Colours come from --chart-1 .. --chart-5 in style.css, which switch with the theme.
const color = (index: number) => `var(--chart-${(index % 5) + 1})`;

export function parseChartSpec(source: string): ChartSpec | null {
  try {
    const spec = JSON.parse(source) as Partial<ChartSpec>;
    const types = ['bar', 'line', 'area', 'pie'];
    if (!spec || !types.includes(spec.type as string) || !Array.isArray(spec.data) || spec.data.length === 0) return null;
    if (spec.type === 'pie') return spec.nameKey && spec.valueKey ? (spec as ChartSpec) : null;
    return spec.x && Array.isArray(spec.series) && spec.series.length > 0 ? (spec as ChartSpec) : null;
  } catch {
    return null;
  }
}

export function MarkdownChart({ spec }: { spec: ChartSpec }) {
  const series = spec.series ?? [];
  // Series names may hold spaces or symbols, so give each a safe id for the CSS variable.
  const config: ChartConfig = Object.fromEntries(series.map((name, index) => [`s${index}`, { label: name, color: color(index) }]));

  return (
    <figure className="my-3 rounded-lg border p-3">
      {spec.title && <figcaption className="mb-2 text-sm font-medium">{spec.title}</figcaption>}
      {spec.type === 'pie' ? (
        <ChartContainer
          config={Object.fromEntries(spec.data.map((row, index) => [String(row[spec.nameKey!]), { label: String(row[spec.nameKey!]), color: color(index) }]))}
          className="mx-auto aspect-square max-h-64"
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent nameKey={spec.nameKey} hideLabel />} />
            <Pie data={spec.data} dataKey={spec.valueKey!} nameKey={spec.nameKey!} innerRadius={48} strokeWidth={2}>
              {spec.data.map((row, index) => <Cell key={String(row[spec.nameKey!])} fill={color(index)} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
      ) : (
        <ChartContainer config={config} className="h-64 w-full">
          {spec.type === 'bar' ? (
            <BarChart data={spec.data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={spec.x} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {series.map((name, index) => <Bar key={name} dataKey={name} name={name} fill={`var(--color-s${index})`} radius={4} />)}
            </BarChart>
          ) : spec.type === 'line' ? (
            <LineChart data={spec.data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={spec.x} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {series.map((name, index) => <Line key={name} dataKey={name} name={name} type="monotone" stroke={`var(--color-s${index})`} strokeWidth={2} dot={false} />)}
            </LineChart>
          ) : (
            <AreaChart data={spec.data}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey={spec.x} tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={40} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {series.map((name, index) => <Area key={name} dataKey={name} name={name} type="monotone" stroke={`var(--color-s${index})`} fill={`var(--color-s${index})`} fillOpacity={0.2} strokeWidth={2} />)}
            </AreaChart>
          )}
        </ChartContainer>
      )}
      {spec.type !== 'pie' && series.length > 1 && (
        <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((name, index) => (
            <li key={name} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: color(index) }} aria-hidden="true" />
              {name}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
