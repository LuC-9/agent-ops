"use client";

import { useEffect, useState } from "react";
import { Row, Col, Card, Statistic, Spin, Segmented, Typography, Table, Tag } from "antd";
import dayjs from "dayjs";
import { get, Scope } from "../api";
import { BRAND, CHART_COLORS, ERROR_RED } from "../theme";
import ChartCard from "../components/ChartCard";
import AiPanel from "../components/AiPanel";
import { axisTrunc } from "../chartUtil";

const usd = (n: any) => (n == null ? "$0" : `$${Number(n).toFixed(Number(n) >= 1 ? 2 : 6)}`);
const num = (n: any) => (n ?? 0).toLocaleString();

// horizontal cost bar (top N by cost)
function costBar(items: any[], keyField: string) {
  const top = [...(items || [])].sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0)).slice(0, 8);
  return {
    _rows: top,
    color: [BRAND.gold],
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: any) => `$${Number(v).toFixed(6)}` },
    grid: { left: 6, right: 26, top: 10, bottom: 28, containLabel: true },
    xAxis: { type: "value", name: "USD", nameLocation: "middle", nameGap: 24 },
    yAxis: {
      type: "category", inverse: true, data: top.map((r) => r[keyField] || "—"),
      axisLabel: { formatter: axisTrunc(15), fontSize: 11 },
    },
    series: [{ type: "bar", data: top.map((r) => r.cost_usd || 0), barMaxWidth: 20 }],
  };
}

export default function Overview({ scope, refreshKey, onScope, onOpenTrace }: {
  scope: Scope; refreshKey: number; onScope: (p: Partial<Scope>) => void; onOpenTrace?: (id: string) => void;
}) {
  const [kpi, setKpi] = useState<any>({});
  const [fin, setFin] = useState<any>({});
  const [ops, setOps] = useState<any>({});
  const [series, setSeries] = useState<any[]>([]);
  const [lat, setLat] = useState<any[]>([]);
  const [byService, setByService] = useState<any[]>([]);
  const [byProject, setByProject] = useState<any[]>([]);
  const [byModel, setByModel] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("cost");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      get("/overview", scope as any),
      get("/overview/finops", scope as any).catch(() => ({})),
      get("/overview/timeseries", scope as any),
      get("/latency/timeseries", scope as any),
      get("/cost", { ...scope, group_by: "service_name" } as any),
      get("/cost", { ...scope, group_by: "project_id" } as any).catch(() => []),
      get("/models", scope as any).catch(() => []),
      get("/cost/agents", scope as any).catch(() => []),
      get("/metrics/summary", scope as any).catch(() => ({})),
    ]).then(([o, f, ts, lt, cs, cp, md, ag, ms]) => {
      setKpi(o.kpis || {}); setFin(f || {}); setSeries(ts || []); setLat(lt || []);
      setByService(cs || []); setByProject(cp || []);
      setByModel((md || []).map((r: any) => ({ ...r, key: r.model || "—" })));
      setAgents(ag || []); setOps(ms || {});
    }).finally(() => setLoading(false));
  }, [JSON.stringify(scope), refreshKey]);

  const x = series.map((r) => dayjs(r.bucket).format("MM-DD HH:mm"));
  const lx = lat.map((r) => dayjs(r.bucket).format("MM-DD HH:mm"));
  const totalTokens = (kpi.input_tokens ?? 0) + (kpi.output_tokens ?? 0);
  const cost = fin.cost ?? kpi.cost_usd ?? 0;
  const costPer1k = totalTokens ? (cost / totalTokens) * 1000 : 0;
  const topModel = [...byModel].sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0))[0] || {};
  const topService = [...byService].sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0))[0] || {};

  // ---- cost highlight tiles ----
  const finTiles: { t: string; v: any; color?: string; sub?: string }[] = [
    { t: "Total cost", v: usd(cost), sub: "selected window" },
    { t: "Month-to-date", v: usd(fin.mtd_cost), sub: "this month" },
    { t: "Avg cost / trace", v: usd(kpi.traces ? cost / kpi.traces : 0), sub: `${num(kpi.traces)} traces` },
    { t: "Cost / 1K tokens", v: usd(costPer1k), sub: `${num(totalTokens)} tokens` },
    { t: "Top model", v: usd(topModel.cost_usd), sub: topModel.key || "—" },
    { t: "Top service", v: usd(topService.cost_usd), sub: topService.key || "—" },
  ];

  // ---- volume / performance tiles ----
  const volTiles = [
    { t: "Traces", v: num(kpi.traces) }, { t: "Spans", v: num(kpi.spans) },
    { t: "Avg cost / trace", v: usd(kpi.traces ? cost / kpi.traces : 0) },
    { t: "Error rate", v: `${((kpi.error_rate ?? 0) * 100).toFixed(2)}%`, color: ERROR_RED },
    { t: "Latency P95", v: `${kpi.p95_ms ?? 0} ms` },
    { t: "Services · Projects", v: `${num(kpi.services)} · ${num(kpi.projects)}` },
  ];

  const opsTiles = [
    { t: "Requests", v: num(ops.total_requests) },
    { t: "Req error rate", v: `${((ops.error_rate ?? 0) * 100).toFixed(2)}%`, color: ERROR_RED },
    { t: "Mean latency", v: `${ops.mean_latency_ms ?? 0} ms` },
    { t: "Peak instances", v: num(ops.peak_instances) },
    { t: "Peak CPU", v: `${ops.peak_cpu_pct ?? 0}%` },
    { t: "Peak memory", v: `${ops.peak_mem_pct ?? 0}%` },
  ];

  const grid6 = { display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12 } as const;
  const tile = (c: { t: string; v: any; color?: string; sub?: string }) => (
    <Card key={c.t} size="small" style={{ borderTop: `2px solid ${c.color || BRAND.gold}`, height: "100%" }}>
      <Statistic title={c.t} value={c.v as any} valueStyle={{ color: c.color || BRAND.ink, fontSize: 19, fontWeight: 600 }} />
      {c.sub && <Typography.Text type="secondary" title={c.sub}
        style={{ fontSize: 10.5, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sub}</Typography.Text>}
    </Card>
  );

  const MAIN: Record<string, any> = {
    cost: {
      tooltip: { trigger: "axis" }, legend: {},
      grid: { left: 55, right: 50, top: 40, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: x },
      yAxis: [{ type: "value", name: "USD" }, { type: "value", name: "count" }],
      series: [
        { name: "Cost (USD)", type: "line", smooth: true, itemStyle: { color: BRAND.gold }, lineStyle: { color: BRAND.gold }, data: series.map((r) => r.cost_usd || 0) },
        { name: "Traces", type: "bar", yAxisIndex: 1, itemStyle: { color: BRAND.ink }, data: series.map((r) => r.traces || 0) },
        { name: "Errors", type: "line", yAxisIndex: 1, itemStyle: { color: ERROR_RED }, lineStyle: { color: ERROR_RED, width: 2 }, data: series.map((r) => r.errors || 0) },
      ],
    },
    latency: {
      tooltip: { trigger: "axis" }, legend: {},
      grid: { left: 55, right: 20, top: 40, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: lx }, yAxis: { type: "value", name: "ms" },
      series: [
        { name: "P50", type: "line", smooth: true, itemStyle: { color: BRAND.gold }, lineStyle: { color: BRAND.gold }, data: lat.map((r) => r.p50_ms || 0) },
        { name: "P95", type: "line", smooth: true, itemStyle: { color: BRAND.ink }, lineStyle: { color: BRAND.ink }, data: lat.map((r) => r.p95_ms || 0) },
      ],
    },
    tokens: {
      tooltip: { trigger: "axis" }, legend: {}, color: CHART_COLORS,
      grid: { left: 60, right: 20, top: 40, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: x }, yAxis: { type: "value" },
      series: [
        { name: "Input", type: "line", areaStyle: {}, stack: "t", data: series.map((r) => r.input_tokens || 0) },
        { name: "Output", type: "line", areaStyle: {}, stack: "t", data: series.map((r) => r.output_tokens || 0) },
      ],
    },
    requests: {
      tooltip: { trigger: "axis" },
      grid: { left: 45, right: 20, top: 30, bottom: 8, containLabel: true },
      xAxis: { type: "category", data: x }, yAxis: { type: "value", name: "traces" },
      series: [{ name: "Traces", type: "bar", itemStyle: { color: BRAND.gold }, data: series.map((r) => r.traces || 0) }],
    },
  };

  const projOpt = costBar(byProject, "key");
  const svcOpt = costBar(byService, "key");
  const modelPie = {
    tooltip: { trigger: "item", valueFormatter: (v: any) => `$${Number(v).toFixed(6)}` },
    legend: { type: "scroll", bottom: 0, textStyle: { fontSize: 11 } },
    color: CHART_COLORS,
    series: [{
      type: "pie", radius: ["45%", "72%"], center: ["50%", "44%"], avoidLabelOverlap: true,
      itemStyle: { borderColor: "#fff", borderWidth: 2 }, label: { show: false },
      data: [...byModel].sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0))
        .map((r) => ({ name: r.key || "—", value: r.cost_usd || 0 })),
    }],
  };

  const drivers = [...agents].sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0)).slice(0, 6);
  const driverCols = [
    { title: "Agent", dataIndex: "agent", ellipsis: true },
    { title: "Service", dataIndex: "service_name", ellipsis: true },
    { title: "Cost", dataIndex: "cost_usd", align: "right" as const, render: (v: any) => <span style={{ color: BRAND.gold }}>{usd(v)}</span> },
    { title: "Tokens", dataIndex: "total_tokens", align: "right" as const, render: num },
  ];

  const sec = (t: string) => <Typography.Text type="secondary" style={{ display: "block", margin: "16px 0 6px", fontWeight: 600, letterSpacing: .3 }}>{t}</Typography.Text>;

  return (
    <Spin spinning={loading}>
      <Card size="small" title="AI fleet brief" style={{ marginBottom: 12 }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          A short operator read of this window: weakest agent, error load, and one next action. Uses Gemini/OpenAI when a key is set.
        </Typography.Paragraph>
        <AiPanel kind="fleet" label="Write fleet brief" onOpenTrace={onOpenTrace} />
      </Card>
      {/* cost highlights */}
      {sec("Cost overview")}
      <div style={grid6}>{finTiles.map(tile)}</div>

      {/* trend + top cost drivers */}
      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={14}>
          <ChartCard title="Trends" option={MAIN[view]} height={320}
            extra={<Segmented size="small" value={view} onChange={(v) => setView(v as string)}
              options={[{ label: "Cost & Errors", value: "cost" }, { label: "Latency P50/P95", value: "latency" },
                        { label: "Tokens", value: "tokens" }, { label: "Requests", value: "requests" }]} />} />
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title="Top cost drivers (agents)" style={{ height: "100%" }}>
            <Table size="small" rowKey={(r) => `${r.agent}|${r.project_id}`} dataSource={drivers} columns={driverCols as any}
              pagination={false}
              onRow={(r) => ({ style: { cursor: "pointer" }, onClick: () => r.service_name && onScope({ service: String(r.service_name) }) })} />
          </Card>
        </Col>
      </Row>

      {/* cost attribution */}
      {sec("Cost attribution")}
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          <ChartCard title="Cost by project" option={projOpt} height={260}
            onPick={(pk: any) => { const r = projOpt._rows[pk.dataIndex]; return r ? { title: "Project",
              items: [{ label: "Project", value: String(r.key), copyable: true }, { label: "Cost", value: usd(r.cost_usd) }, { label: "Traces", value: num(r.traces) }],
              action: { label: `Filter project: ${r.key}`, run: () => onScope({ project: String(r.key), platform: undefined, service: undefined }) } } : null; }} />
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title="Cost by model" option={modelPie} height={260}
            onPick={(pk: any) => ({ title: "Model", items: [
              { label: "Model", value: String(pk.name), copyable: true },
              { label: "Cost", value: usd(pk.value) },
              { label: "Share", value: pk.percent != null ? `${pk.percent}%` : "—" }] })} />
        </Col>
        <Col xs={24} lg={8}>
          <ChartCard title="Cost by service" option={svcOpt} height={260}
            onPick={(pk: any) => { const r = svcOpt._rows[pk.dataIndex]; return r ? { title: "Service",
              items: [{ label: "Service", value: String(r.key), copyable: true }, { label: "Cost", value: usd(r.cost_usd) }, { label: "Traces", value: num(r.traces) }],
              action: { label: `Filter service: ${r.key}`, run: () => onScope({ service: String(r.key) }) } } : null; }} />
        </Col>
      </Row>

      {/* volume + ops */}
      {sec("Volume & performance")}
      <div style={grid6}>{volTiles.map(tile)}</div>
      {sec("Infrastructure / operational metrics")}
      <div style={grid6}>{opsTiles.map(tile)}</div>
    </Spin>
  );
}
