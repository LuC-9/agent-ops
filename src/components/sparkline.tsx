"use client";

import { cn } from "@/lib/utils";

export function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) {
    return <div className={cn("h-10 text-[11px] text-slate-500", className)}>Need more traces for a trend</div>;
  }
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const span = Math.max(max - min, 1);
  const w = 160;
  const h = 40;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const last = values[values.length - 1];
  const tone = last >= 80 ? "stroke-emerald-400" : last >= 60 ? "stroke-amber-300" : "stroke-rose-400";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-10 w-40", className)} aria-hidden>
      <polyline fill="none" strokeWidth="2" className={tone} points={pts} />
    </svg>
  );
}
