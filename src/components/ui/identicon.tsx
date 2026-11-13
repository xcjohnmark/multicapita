/**
 * Deterministic avatar for a wallet address: a 5×5 mirrored grid in one hue derived from the
 * address bytes. It identifies, it does not decorate; the same address always draws the same.
 */
export function Identicon({ seed, size = 48, className }: { seed: string; size?: number; className?: string }) {
  const bytes = hashBytes(seed.toLowerCase());
  const hue = (bytes[0] * 360) / 256;
  const fg = `hsl(${hue.toFixed(0)} 55% 45%)`;
  const bg = `hsl(${hue.toFixed(0)} 60% 94%)`;
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if (bytes[1 + y * 3 + x] % 2 === 0) {
        cells.push({ x, y });
        if (x < 2) cells.push({ x: 4 - x, y });
      }
    }
  }
  return (
    <svg
      viewBox="0 0 7 7"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: "999px", background: bg }}
      aria-hidden
    >
      {cells.map((cell) => (
        <rect key={`${cell.x}-${cell.y}`} x={cell.x + 1} y={cell.y + 1} width={1} height={1} fill={fg} />
      ))}
    </svg>
  );
}

function hashBytes(input: string): number[] {
  // FNV-1a, expanded to 16 bytes. Not cryptographic; only needs to be stable.
  const out: number[] = [];
  let h = 0x811c9dc5;
  for (let round = 0; round < 4; round++) {
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i) + round;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out.push(h & 0xff, (h >>> 8) & 0xff, (h >>> 16) & 0xff, (h >>> 24) & 0xff);
  }
  return out;
}
