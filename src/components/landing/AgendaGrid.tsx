// 100 appointment slots of one day: "share" of them stay empty (the real 2023 rate),
// and a few come back (the scenario with editable assumptions shown in the board).
// Animations use only opacity and transform (compositor-only) and run per row,
// so scrolling stays smooth while they play.
function pick(n: number, k: number, seed: number) {
  const idx = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, k);
}

export function AgendaGrid({ emptyShare, recoveredShare }: { emptyShare: number; recoveredShare: number }) {
  const empty = Math.round(emptyShare * 100);
  const recovered = Math.max(1, Math.round(empty * recoveredShare));
  const emptySet = pick(100, empty, 7);
  const recoveredOrder = new Map(emptySet.slice(0, recovered).map((v, i) => [v, i]));
  const empties = new Set(emptySet);
  return (
    <figure className="w-full max-w-[420px]">
      <div className="grid gap-[7px] rounded-3xl bg-white/[0.04] p-5 ring-1 ring-white/10" aria-hidden>
        {Array.from({ length: 10 }, (_, row) => (
          <div key={row} className="agenda-row grid grid-cols-10 gap-[7px]" style={{ "--row": row } as React.CSSProperties}>
            {Array.from({ length: 10 }, (_, col) => {
              const i = row * 10 + col;
              const kind = recoveredOrder.has(i) ? "recovered" : empties.has(i) ? "empty" : "kept";
              return (
                <span
                  key={i}
                  className="cell"
                  data-kind={kind}
                  style={{ "--i": i, "--r": recoveredOrder.get(i) ?? 0 } as React.CSSProperties}
                >
                  {kind === "recovered" && <span className="cell-mint" />}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <figcaption className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/70">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-[3px] bg-white/25" /> Atendida
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-[3px] border-[1.5px] border-white/55" /> No atendida ({empty} de 100)
        </span>
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-[3px] bg-mint" /> Recuperable (escenario)
        </span>
      </figcaption>
    </figure>
  );
}
