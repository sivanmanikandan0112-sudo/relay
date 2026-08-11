interface SparklineProps {
  values: number[];
  colorVar: string;
  width?: number;
  height?: number;
}

export function Sparkline({ values, colorVar, width = 80, height = 24 }: SparklineProps) {
  if (values.length === 0) return <svg width={width} height={height} />;

  // A single point can't draw a line, but it's still real data worth
  // showing (a dot), not an empty box -- see Sparkline in the athlete
  // detail drawer, where the first-ever check-in should show *something*.
  if (values.length === 1) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline">
        <circle cx={width / 2} cy={height / 2} r={3} fill={colorVar} />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline">
      <polyline points={points} fill="none" stroke={colorVar} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
