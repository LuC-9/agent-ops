"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bot, FlaskConical, MessageSquare, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Control room", icon: Activity },
  { href: "/improvements", label: "Improvements", icon: Sparkles },
  { href: "/copilot", label: "Copilot", icon: MessageSquare },
  { href: "/playground", label: "Run agents", icon: FlaskConical },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="border-b border-white/10 bg-[#071018] lg:w-60 lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-cyan-400/15 text-cyan-300">
            <Bot className="h-4 w-4" />
          </div>
          <div>
            <p className="font-mono text-xs tracking-[0.2em] text-cyan-300/80">NORTHSTAR</p>
            <p className="text-sm font-medium text-slate-100">Agent Observability</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible">
          {nav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap",
                  active ? "bg-cyan-400/10 text-cyan-200" : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 bg-[#0b1520]">{children}</main>
    </div>
  );
}

export function ScorePill({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const tone = value >= 80 ? "text-emerald-300" : value >= 60 ? "text-amber-300" : "text-rose-300";
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[11px] tracking-wide text-slate-400 uppercase">{label}</p>
      <p className={cn("font-mono text-xl", tone)}>{Number.isFinite(value) ? value.toFixed(1) : "—"}</p>
    </div>
  );
}
