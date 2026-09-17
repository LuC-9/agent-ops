"use client";

import { useEffect, useMemo, useState } from "react";
import { Row, Col, Card, Segmented, Typography } from "antd";
import { get, Scope } from "../api";
import { BRAND, ERROR_RED } from "../theme";
import GenericTable from "../components/GenericTable";
import TraceDrawer from "../components/TraceDrawer";
import ChartCard from "../components/ChartCard";
import { axisTrunc } from "../chartUtil";

const strip = (s: string) => String(s || "").replace(/^[▸◆]\s/, "");
const SEP = "|~|";
const usd = (n: any) => (n == null ? "—" : `$${Number(n).toFixed(6)}`);
const num = (n: any) => (n ?? 0).toLocaleString();

// project ▸ service ▸ ◆ model spend flow — capped to top-N per level, rest bucketed into "Other …"
function buildSankey(flow: any[], topProjects = 8, topServices = 10, topModels = 8) {
  const proj = new Map<string, number>(), svc = new Map<string, number>(), mod = new Map<string, number>();
  const bump = (m: Map<string, number>, k: any, v: number) => { const key = k || "—"; m.set(key, (m.get(key) || 0) + v); };
  for (const r of flow) { bump(proj, r.project_id, r.cost || 0); bump(svc, r.service_name, r.cost || 0); bump(mod, r.model, r.cost || 0); }
  const topSet = (m: Map<string, number>, n: number) =>
    new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((e) => e[0]));
  const kp = topSet(proj, topProjects), ks = topSet(svc, topServices), km = topSet(mod, topModels);

  const nodes = new Map<string, number>(); const links = new Map<string, number>();
  for (const r of flow) {
    const p = r.project_id || "—", s = r.service_name || "—", m = r.model || "—";
    const P = "▸ " + (kp.has(p) ? p : "Other projects");
    const S = ks.has(s) ? s : "Other services";
    const M = "◆ " + (km.has(m) ? m : "Other models");
    nodes.set(P, 0); nodes.set(S, 1); nodes.set(M, 2);
    const k1 = P + SEP + S, k2 = S + SEP + M;
    links.set(k1, (links.get(k1) || 0) + (r.cost || 0));
    links.set(k2, (links.get(k2) || 0) + (r.cost || 0));
  }
  return {
    data: [...nodes.keys()].map((name) => ({ name })),
    links: [...links].map(([k, v]) => { const [source, target] = k.split(SEP); return { source, target, value: v }; }),
  };
}

export default function Insights({ scope, refreshKey, onScope }: { scope: Scope; refreshKey: number; onScope: (p: Partial<Scope>) => void }) {
  const [by, setBy] = useState("cost");
  const [flow, setFlow] = useState<any[]>([]);
  const [top, setTop] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [errSvc, setErrSvc] = useState<any[]>([]);
  const [errTop, setErrTop] = useState<any[]>([]);
  const [traceId, setTraceId] = useState<string | null>(null);

  useEffect(() => { get("/top/traces", { ...scope, by, limit: 50 } as any).then(setTop); }, [JSON.stringify(scope), by, refreshKey]);
  useEffect(() => {
    get("/insights/flow", scope as any).then(setFlow).catch(() => setFlow([]));
    get("/models", scope as any).then(setModels);
    get("/cost/agents", scope as any).then(setAgents).catch(() => setAgents([]));
    get("/errors/by-service", scope as any).then(setErrSvc);
    get("/errors/top", scope as any).then(setErrTop);
  }, [JSON.stringify(scope), refreshKey]);

  // ---- Sankey ----
  const sk = useMemo(() => buildSankey(flow), [flow]);
  const sankeyOpt = {
    tooltip: {
      trigger: "item",
      formatter: (p: any) => p.dataType === "edge"
        ? `${strip(p.data.source)} → ${strip(p.data.target)}<br/><b>${usd(p.data.value)}</b>`
        : `<b>${strip(p.name)}</b>`,
    },
    series: [{
      type: "sankey", left: 8, right: 130, top: 12, bottom: 12,
      data: sk.data, links: sk.links, nodeGap: 9, nodeWidth: 13,
      emphasis: { focus: "adjacency" },
      lineStyle: { color: "gradient", opacity: 0.35, curveness: 0.5 },
      label: { fontSize: 11, color: BRAND.ink, formatter: (p: any) => axisTrunc(22)(strip(p.name)) },
      itemStyle: { borderWidth: 0 },
      levels: [
        { depth: 0, itemStyle: { color: BRAND.ink } },
        { depth: 1, itemStyle: { color: BRAND.gold } },
        { depth: 2, itemStyle: { color: BRAND.goldSoft } },
      ],
    }],
  };

  // ---- Cost vs latency bubble map ----
  const scatterOpt = {
    tooltip: { trigger: "item", formatter: (p: any) => `<b>${p.data.svc}</b><br/>latency ${Math.round(p.data.value[0])} ms · ${usd(p.data.value[1])}<br/>${num(p.data.tok)} tokens` },
    grid: { left: 10, right: 22, top: 16, bottom: 38, containLabel: true },
    xAxis: { type: "value", name: "latency (ms)", nameLocation: "middle", nameGap: 26 },
    yAxis: { type: "value", name: "cost (USD)" },
    series: [{
      type: "scatter", symbolSize: (d: any) => 8 + Math.sqrt(d[2] || 0) / 6,
      itemStyle: { color: BRAND.gold, opacity: 0.65, borderColor: "#9c7726", borderWidth: 0.5 },
      emphasis: { itemStyle: { color: ERROR_RED, opacity: 1 } },
      data: top.map((t) => ({ value: [t.duration_ms || 0, t.cost_usd || 0, t.tokens || 0], svc: t.service_name || "—", tok: t.tokens || 0, trace: t.trace_id })),
    }],
  };

  // ---- Model efficiency ----
  const effOpt = {
    tooltip: { trigger: "item", formatter: (p: any) => `<b>${p.data.model}</b><br/>${num(p.data.calls)} calls · $${p.data.value[1].toFixed(4)} / 1K tokens<br/>total ${usd(p.data.cost)}` },
    grid: { left: 10, right: 22, top: 16, bottom: 38, containLabel: true },
    xAxis: { type: "value", name: "calls", nameLocation: "middle", nameGap: 26 },
    yAxis: { type: "value", name: "$ / 1K tokens" },
    series: [{
      type: "scatter", symbolSize: (d: any) => 12 + Math.sqrt(d[2] || 0) * 80,
      itemStyle: { color: BRAND.ink, opacity: 0.7 },
      label: { show: true, position: "top", fontSize: 10, formatter: (p: any) => axisTrunc(14)(p.data.model) },
      labelLayout: { hideOverlap: true },
      data: models.map((r) => {
        const tok = (r.input_tokens || 0) + (r.output_tokens || 0);
        return { value: [r.calls || 0, tok ? (r.cost_usd || 0) / tok * 1000 : 0, r.cost_usd || 0], model: r.model || "—", calls: r.calls || 0, cost: r.cost_usd || 0 };
      }),
    }],
  };

  // ---- Agents: spend treemap (tile size = cost) ----
  const agentTree = {
    tooltip: { formatter: (p: any) => `<b>${p.name}</b><br/>cost ${usd(p.value)}<br/>${num(p.data?.tok)} tokens · ${num(p.data?.traces)} traces` },
    series: [{
      type: "treemap", width: "100%", height: "100%", roam: false, nodeClick: false,
      breadcrumb: { show: false }, upperLabel: { show: false },
      label: { show: true, fontSize: 11, color: "#111", overflow: "truncate", formatter: (p: any) => p.name },
      itemStyle: { borderColor: "#ffffff", borderWidth: 1, gapWidth: 1 },
      levels: [{ colorMappingBy: "value", color: ["#efe6cf", "#d8bf82", "#C9A85C", "#B6862C", "#9c6f1f"] }],
      data: [...agents].filter((a) => (a.cost_usd || 0) > 0).sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0))
        .map((a) => ({ name: a.agent || "—", value: a.cost_usd || 0, svc: a.service_name, tok: a.total_tokens || 0, traces: a.traces || 0 })),
    }],
  };

  // ---- Errors by service ----
  const es = errSvc.slice(0, 12);
  const errOpt = {
    color: [ERROR_RED], tooltip: { trigger: "axis" },
    grid: { left: 8, right: 20, top: 10, bottom: 8, containLabel: true },
    xAxis: { type: "value", name: "errors" },
    yAxis: { type: "category", inverse: true, data: es.map((r) => r.service_name || "—"), axisLabel: { formatter: axisTrunc(15), fontSize: 11 } },
    series: [{ type: "bar", data: es.map((r) => r.errors || 0), barMaxWidth: 18 }],
  };

  // slim columns for the tables
  const agentCols = [
    { title: "Agent", dataIndex: "agent", ellipsis: true },
    { title: "Service", dataIndex: "service_name", ellipsis: true },
    { title: "Cost", dataIndex: "cost_usd", align: "right" as const, render: (v: any) => <span style={{ color: BRAND.gold }}>{usd(v)}</span> },
    { title: "Tokens", dataIndex: "total_tokens", align: "right" as const, render: num },
    { title: "Traces", dataIndex: "traces", align: "right" as const, render: num },
  ];
  const modelCols = [
    { title: "Model", dataIndex: "model", ellipsis: true },
    { title: "Cost", dataIndex: "cost_usd", align: "right" as const, render: (v: any) => <span style={{ color: BRAND.gold }}>{usd(v)}</span> },
    { title: "Calls", dataIndex: "calls", align: "right" as const, render: num },
    { title: "Tokens", dataIndex: "input_tokens", align: "right" as const, render: (_: any, r: any) => num((r.input_tokens || 0) + (r.output_tokens || 0)) },
  ];

  return (
    <>
      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
        Spend flow — project ▸ service ▸ model (width = cost · top 8/10/8, rest folded into “Other …”)
      </Typography.Text>
      <ChartCard title="Where the money flows" option={sankeyOpt} height={380} />

      {/* charts row 1 */}
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={13}>
          <ChartCard title="Cost vs latency (bubble = tokens · click to open trace)" option={scatterOpt} height={330}
            onPick={(p: any) => p?.data?.trace ? {
              title: "Trace", items: [
                { label: "Service", value: String(p.data.svc), copyable: true },
                { label: "Latency", value: `${Math.round(p.data.value[0])} ms` },
                { label: "Cost", value: usd(p.data.value[1]) },
                { label: "Tokens", value: String(p.data.tok) },
                { label: "Trace id", value: String(p.data.trace), copyable: true }],
              action: { label: "Open trace waterfall", run: () => setTraceId(p.data.trace) },
            } : null} />
        </Col>
        <Col xs={24} lg={11}>
          <ChartCard title="Model efficiency ($/1K tokens vs calls · bubble = cost)" option={effOpt} height={330}
            onPick={(p: any) => p?.data ? { title: "Model", items: [
              { label: "Model", value: String(p.data.model), copyable: true },
              { label: "Calls", value: String(p.data.calls) },
              { label: "$ / 1K tokens", value: `$${Number(p.data.value[1]).toFixed(4)}` },
              { label: "Total cost", value: usd(p.data.cost) }] } : null} />
        </Col>
      </Row>

      {/* charts row 2 */}
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={13}>
          <ChartCard title="Agent spend (treemap · tile size = cost · click to filter)" option={agentTree} height={330}
            onPick={(p: any) => p?.data ? { title: "Agent", items: [
              { label: "Agent", value: String(p.name), copyable: true },
              { label: "Service", value: String(p.data.svc ?? "—"), copyable: true },
              { label: "Cost", value: usd(p.value) },
              { label: "Traces", value: num(p.data.traces) },
              { label: "Tokens", value: num(p.data.tok) }],
              action: p.data.svc ? { label: `Filter service: ${p.data.svc}`, run: () => onScope({ service: String(p.data.svc) }) } : undefined } : null} />
        </Col>
        <Col xs={24} lg={11}>
          <ChartCard title="Errors by service" option={errOpt} height={330}
            onPick={(p: any) => { const r = es[p.dataIndex]; return r ? { title: "Service errors", items: [
              { label: "Service", value: String(r.service_name ?? "—"), copyable: true },
              { label: "Errors", value: String(r.errors ?? "—") },
              { label: "Error rate", value: `${((r.error_rate || 0) * 100).toFixed(2)}%` }],
              action: { label: `Filter service: ${r.service_name}`, run: () => onScope({ service: r.service_name }) } } : null; }} />
        </Col>
      </Row>

      {/* 2×2 scrollable tables (top 50 each) */}
      <Typography.Text type="secondary" style={{ display: "block", margin: "16px 0 6px", fontWeight: 600 }}>Leaderboards (top 50)</Typography.Text>
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="Top traces"
            extra={<Segmented size="small" value={by} onChange={(v) => setBy(v as string)}
              options={[{ label: "Most expensive", value: "cost" }, { label: "Most tokens", value: "tokens" }, { label: "Slowest", value: "latency" }]} />}>
            <GenericTable rows={top.slice(0, 50)} scrollY={300} exportName={`top_${by}`}
              onRowClick={(r) => setTraceId(r.trace_id)} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Top agents by cost">
            <GenericTable rows={agents.slice(0, 50)} scrollY={300} exportName="top_agents" columns={agentCols as any}
              onRowClick={(r) => r.service_name && onScope({ service: String(r.service_name) })} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Top models by cost">
            <GenericTable rows={models.slice(0, 50)} scrollY={300} exportName="top_models" columns={modelCols as any} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="Top error messages">
            <GenericTable rows={errTop.slice(0, 50)} scrollY={300} exportName="top_errors" />
          </Card>
        </Col>
      </Row>

      <TraceDrawer traceId={traceId} open={!!traceId} onClose={() => setTraceId(null)} />
    </>
  );
}
