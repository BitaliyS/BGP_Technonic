"use client";

export function TeamKpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border-2 border-tn-red/35 bg-tn-panel p-5 shadow-sm">
      <div className="text-sm font-semibold text-tn-red">{label}</div>
      <div className="mt-1 font-display text-2xl font-extrabold tabular-nums text-tn-ink">
        {value}
      </div>
      {hint ? <div className="mt-2 text-xs leading-snug text-tn-muted">{hint}</div> : null}
    </div>
  );
}

export function TeamKpiGrid({
  items,
}: {
  items: Array<{ label: string; value: string | number; hint?: string }>;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <TeamKpi key={item.label} {...item} />
      ))}
    </div>
  );
}
