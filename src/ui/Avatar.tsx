const hue = (s: string): number => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

const initials = (n: string): string =>
  (
    String(n)
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2) || '?'
  ).toUpperCase();

export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      className={`av${small ? ' sm' : ''}`}
      style={{ background: `hsl(${hue(name)} 55% 46%)` }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
