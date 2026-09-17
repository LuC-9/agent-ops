"use client";

import { useEffect, useMemo, useState } from "react";
import { Row, Col, Tag, Space, Spin, Typography, Table, Empty, Tooltip } from "antd";
import { get, Scope } from "../api";
import { BRAND, CHART_COLORS, ERROR_RED } from "../theme";
import ChartCard from "../components/ChartCard";
import GenericTable from "../components/GenericTable";
import { axisTrunc } from "../chartUtil";

const usd = (n: any) => (n == null ? "—" : `$${Number(n).toFixed(6)}`);
const num = (n: any) => (n == null ? 0 : Number(n)).toLocaleString();
const TOP = 15;

export default function AgentCost({ scope, refreshKey, onScope, onNavigate }: {
  scope: Scope; refreshKey: number; onScope: (p: Partial<Scope>) => void; onNavigate: (tab: string) => void;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // per-agent tool breakdown, lazy-loaded on row expand
  const [toolsByAgent, setToolsByAgent] = useState<Record<string, any[]>>({});
  const [toolsLoading, setToolsLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setLoading(true);
    setToolsByAgent({});   // reset cache when scope/refresh changes
    get("/cost/agents", scope as any).then((r) => setRows(r || [])).finally(() => setLoading(false));
  }, [JSON.stringify(scope), refreshKey]);

  const loadTools = (record: any) => {
    const key = record.agent;
    if (toolsByAgent[key] || toolsLoading[key]) return;
    setToolsLoading((s) => ({ ...s, [key]: true }));
    get("/tools", { ...scope, service: record.service_name } as any)
      .then((r) => setToolsByAgent((s) => ({ ...s, [key]: r || [] })))
      .finally(() => setToolsLoading((s) => ({ ...s, [key]: false })));
  };

  const toolCols = [
    { title: "Tool", dataIndex: "tool" },
    { title: "Calls", dataIndex: "calls", render: num },
    { title: "Avg ms", dataIndex: "avg_ms", render: (v: any) => (v == null ? "—" : Number(v).toFixed(1)) },
    { title: "Errors", dataIndex: "errors", render: (v: any) => <span style={{ color: v > 0 ? ERROR_RED : undefined }}>{num(v)}</span> },
  ];

  const expandable = {
    rowExpandable: (r: any) => (r.tool_calls || 0) > 0,
    onExpand: (expanded: boolean, record: any) => { if (expanded) loadTools(record); },
    expandedRowRender: (record: any) => {
      const data = toolsByAgent[record.agent];
      return (
        <div style={{ background: "#faf8f3", borderLeft: `3px solid ${BRAND.gold}`,
                      padding: "10px 14px", borderRadius: 4, margin: "4px 0" }}>
          <Typography.Text strong style={{ display: "block", marginBottom: 8 }}>
            🛠 Tools called by {record.agent}
          </Typography.Text>
          <Table size="small" rowKey="tool" columns={toolCols as any}
            loading={!!toolsLoading[record.agent]}
            dataSource={data || []} pagination={false}
            locale={{ emptyText: <Empty description="No tools for this agent in range" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }} />
        </div>
      );
    },
  };

  // top-N by cost (fallback to tokens when cost is null/0)
  const top = useMemo(() =>
    [...rows].sort((a, b) => (b.cost_usd || 0) - (a.cost_usd || 0) || (b.total_tokens || 0) - (a.total_tokens || 0)).slice(0, TOP),
    [rows]);

  const agents = top.map((r) => r.agent || "—");
  const projects = [...new Set(top.map((r) => r.project_id || "—"))];

  // cost by agent, stacked/colored by project (each agent belongs to one project)
  const costOpt = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: any) => `$${Number(v).toFixed(6)}` },
    legend: { type: "scroll", top: 0 }, color: CHART_COLORS,
    grid: { left: 8, right: 24, top: 30, bottom: 8, containLabel: true },
    xAxis: { type: "value", name: "USD" },
    yAxis: { type: "category", inverse: true, data: agents, axisLabel: { formatter: axisTrunc(15), fontSize: 11 } },
    series: projects.map((proj) => ({
      name: proj, type: "bar", stack: "cost",
      data: top.map((r) => ((r.project_id || "—") === proj ? (r.cost_usd || 0) : 0)),
    })),
  };

  // tokens by agent (input vs output)
  const tokOpt = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { top: 0 },
    grid: { left: 8, right: 24, top: 30, bottom: 8, containLabel: true },
    xAxis: { type: "value", name: "tokens" },
    yAxis: { type: "category", inverse: true, data: agents, axisLabel: { formatter: axisTrunc(15), fontSize: 11 } },
    series: [
      { name: "Input", type: "bar", stack: "t", itemStyle: { color: BRAND.gold }, data: top.map((r) => r.input_tokens || 0) },
      { name: "Output", type: "bar", stack: "t", itemStyle: { color: BRAND.ink }, data: top.map((r) => r.output_tokens || 0) },
    ],
  };

  const pick = (idx: number) => {
    const r = top[idx];
    if (!r) return null;
    return {
      title: "Agent", items: [
        { label: "Agent", value: String(r.agent ?? "—"), copyable: true },
        { label: "Service", value: String(r.service_name ?? "—"), copyable: true },
        { label: "Project", value: String(r.project_id ?? "—"), copyable: true },
        { label: "Platform", value: String(r.platform ?? "—") },
        { label: "Cost", value: usd(r.cost_usd) },
        { label: "Total tokens", value: num(r.total_tokens) },
        { label: "Input / Output", value: `${num(r.input_tokens)} / ${num(r.output_tokens)}` },
        { label: "Traces", value: num(r.traces) },
        { label: "Models", value: String(r.models ?? "—") },
      ],
      action: { label: `Filter service: ${r.service_name} → Traces`, run: () => { onScope({ service: String(r.service_name) }); onNavigate("traces"); } },
    };
  };

  const columns = [
    { title: "Agent", dataIndex: "agent",
      render: (v: any, r: any) => <Space size={4}>{v || "—"}
        {!r.priced && r.total_tokens > 0
          ? <Tooltip title="No LLM cost was computed for this agent. Either the model has no active price, or the current gold cost view didn't bill these spans (e.g. LangGraph call_llm spans without an operation tag).">
              <Tag color="orange">no cost</Tag>
            </Tooltip>
          : null}</Space> },
    { title: "Service", dataIndex: "service_name" },
    { title: "Project", dataIndex: "project_id" },
    { title: "Platform", dataIndex: "platform" },
    { title: "Input", dataIndex: "input_tokens", render: num, sorter: (a: any, b: any) => (a.input_tokens || 0) - (b.input_tokens || 0) },
    { title: "Output", dataIndex: "output_tokens", render: num, sorter: (a: any, b: any) => (a.output_tokens || 0) - (b.output_tokens || 0) },
    { title: "Total tokens", dataIndex: "total_tokens", render: num, defaultSortOrder: "descend" as const,
      sorter: (a: any, b: any) => (a.total_tokens || 0) - (b.total_tokens || 0) },
    { title: "Cost (USD)", dataIndex: "cost_usd", key: "cost_usd", render: (v: any) => <span style={{ color: BRAND.gold }}>{usd(v)}</span>,
      sorter: (a: any, b: any) => (a.cost_usd || 0) - (b.cost_usd || 0) },
    { title: "Avg $/trace", dataIndex: "cost_usd", key: "avg_cost",
      render: (_: any, r: any) => usd(r.traces ? (r.cost_usd || 0) / r.traces : 0) },
    { title: "Traces", dataIndex: "traces", render: num, sorter: (a: any, b: any) => (a.traces || 0) - (b.traces || 0) },
    { title: "Tools", dataIndex: "tool_calls",
      render: (v: any) => (v > 0 ? <Tag color="geekblue">{num(v)} calls</Tag> : "—"),
      sorter: (a: any, b: any) => (a.tool_calls || 0) - (b.tool_calls || 0) },
    { title: "Model(s)", dataIndex: "models", render: (v: any) => <span style={{ wordBreak: "break-all" }}>{v || "—"}</span> },
  ];

  return (
    <Spin spinning={loading}>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} lg={12}>
          <ChartCard title={`Cost by agent (top ${TOP}, colored by project)`} option={costOpt} height={360} onPick={(p: any) => pick(p.dataIndex)} />
        </Col>
        <Col xs={24} lg={12}>
          <ChartCard title={`Token consumption by agent (top ${TOP})`} option={tokOpt} height={360} onPick={(p: any) => pick(p.dataIndex)} />
        </Col>
      </Row>

      <Typography.Text type="secondary" style={{ display: "block", marginBottom: 6 }}>
        Expand a row (＋) to see the agent’s tool calls · click a row to filter to its service.
      </Typography.Text>
      <GenericTable rows={rows} loading={loading} exportName="agent_cost" columns={columns as any}
        expandable={expandable}
        onRowClick={(r) => { if (r.service_name) onScope({ service: String(r.service_name) }); }} />
    </Spin>
  );
}
