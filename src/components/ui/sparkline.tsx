/**
 * Area sparkline in the near.com card style, drawn from real observations only. Fewer than three
 * points renders nothing: a two-point line implies a trend we have not observed.
 */
export function Sparkline({
  points,
  height = 96,
  className,
}: {
  points: number[];
  height?: number;
  className?: string;
}) {
  const clean = points.filter((value) => Number.isFinite(value));
  if (clean.length < 3) return null;

  const width = 300;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || Math.abs(max) || 1;
  const pad = 6;
  const coords = clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * width;
    const y = pad + (1 - (value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const up = clean[clean.length - 1] >= clean[0];
  const stroke = up ? "#16a34a" : "#e11d48";
  const fill = up ? "rgba(22,163,74,0.10)" : "rgba(225,29,72,0.08)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      style={{ height }}
      role="img"
      aria-label={`Trend over ${clean.length} observations, ${up ? "up" : "down"}`}
    >
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
