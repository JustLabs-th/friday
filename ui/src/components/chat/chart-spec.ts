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

export function parseChartSpec(source: string): ChartSpec | null {
  try {
    const spec = JSON.parse(source) as Partial<ChartSpec>;
    const types = ['bar', 'line', 'area', 'pie'];
    if (!spec || !types.includes(spec.type as string) || !Array.isArray(spec.data) || spec.data.length === 0)
      return null;
    if (spec.type === 'pie') return spec.nameKey && spec.valueKey ? (spec as ChartSpec) : null;
    return spec.x && Array.isArray(spec.series) && spec.series.length > 0 ? (spec as ChartSpec) : null;
  } catch {
    return null;
  }
}
