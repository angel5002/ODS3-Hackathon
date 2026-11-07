// 100 appointment slots of one day: "share" of them stay empty (the real 2023 rate),
// and a few come back (the scenario with editable assumptions shown in the board).
// A static figure (docs/estilo.md): flat cells, each kind told apart by fill AND outline, with a text legend.
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
  const recoveredSet = new Set(emptySet.slice(0, recovered));
  const empties = new Set(emptySet);
  return (
    <figure className="w-full max-w-[400px]">
      <div className="grid grid-cols-10 gap-[5px] rounded-2xl border border-line bg-surface p-4" aria-hidden>
        {Array.from({ length: 100 }, (_, i) => {
          const kind = recoveredSet.has(i) ? "recovered" : empties.has(i) ? "empty" : "kept";
          return <span key={i} className="cell" data-kind={kind} />;
        })}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[15px] text-muted">
        <span className="flex items-center gap-2">
          <span className="cell size-3.5" data-kind="kept" /> Atendida
        </span>
        <span className="flex items-center gap-2">
          <span className="cell size-3.5" data-kind="empty" /> No atendida ({empty} de 100)
        </span>
        <span className="flex items-center gap-2">
          <span className="cell size-3.5" data-kind="recovered" /> Recuperable (escenario)
        </span>
      </figcaption>
    </figure>
  );
}
