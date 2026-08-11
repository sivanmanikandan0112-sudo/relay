interface BarChartProps {
  values: number[];
  colorVar: string;
  width?: number;
  height?: number;
}

// Same spirit as Sparkline.tsx (no charting library, just inline SVG) --
// for distance-over-time, where a bar per session reads more naturally
// than a connected line. Shows real volume even with as few as 1-2 bars.
export function BarChart({ values, colorVar, width = 280, height = 60 }: BarChartProps) {
  if (values.length === 0) return <svg width={width} height={height} />;

  const max = Math.max(...values, 0.001); // avoid a div-by-zero if every value is 0
  const gap = 3;
  const barWidth = Math.max((width - gap * (values.length - 1)) / values.length, 2);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="bar-chart">
      {values.map((v, i) => {
        const barHeight = Math.max((v / max) * height, 1); // always at least a sliver, even for 0
        const x = i * (barWidth + gap);
        const y = height - barHeight;
        return <rect key={i} x={x} y={y} width={barWidth} height={barHeight} fill={colorVar} rx={1.5} />;
      })}
    </svg>
  );
}
