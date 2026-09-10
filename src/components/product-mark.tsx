export function ProductMark({ seed, title }: { seed: number; title: string }) {
  const hue = 200 + (seed * 17) % 40;
  const a = 12 + (seed % 8) * 4;
  const b = 70 - (seed % 5) * 6;
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" aria-hidden>
      <rect width="160" height="120" fill="#141518" />
      <rect x="8" y="8" width="144" height="104" fill="none" stroke="#2a2c31" />
      <circle cx={40 + (seed % 20)} cy={48} r={18 + (seed % 10)} fill={`hsl(${hue} 10% ${a}%)`} />
      <rect x={88} y={28} width={40} height={64} fill={`hsl(${hue + 8} 8% ${b}%)`} />
      <text x="16" y="104" fill="#8b8d93" fontSize="9" fontFamily="ui-monospace, monospace">
        {title.slice(0, 18).toUpperCase()}
      </text>
    </svg>
  );
}
