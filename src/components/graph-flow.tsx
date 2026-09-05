import type { AgentGraph } from "@/lib/types";

export function GraphFlow({ graph }: { graph: AgentGraph }) {
  const nodes = graph.nodes;
  if (!nodes.length) return null;
  const width = Math.max(320, nodes.length * 92);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} 72`} className="h-16 min-w-full text-cyan-300" role="img" aria-label={`Graph ${nodes.join(" to ")}`}>
        {nodes.map((name, i) => {
          const x = 16 + i * 92;
          const next = nodes[i + 1];
          return (
            <g key={name}>
              {next && (
                <line x1={x + 64} y1={28} x2={x + 92} y2={28} stroke="currentColor" strokeOpacity="0.35" />
              )}
              <rect x={x} y={12} width={64} height={32} rx="6" fill="#10202c" stroke="currentColor" strokeOpacity="0.5" />
              <text x={x + 32} y={32} textAnchor="middle" fontSize="9" fill="#e2e8f0">
                {name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
