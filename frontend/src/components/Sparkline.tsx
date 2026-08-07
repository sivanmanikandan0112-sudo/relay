interface SparklineProps {
  values: number[];
  colorVar: string;
  width?: number;
  height?: number;
}

export function Sparkline({ values, colorVar, width = 80, height = 24 }: SparklineProps) {
  if (values.length < 2) return <svg width={width} height={height} />;

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
