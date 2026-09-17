"use client";

import { useEffect, useState } from "react";
import { Card, Col, Row, Statistic, Tag, Typography, Empty } from "antd";
import dayjs from "dayjs";
import { get, Scope } from "../api";
import { BRAND, CHART_COLORS, ERROR_RED } from "../theme";
import ChartCard from "../components/ChartCard";
import GenericTable from "../components/GenericTable";
import { axisTrunc } from "../chartUtil";

export default function AiUsage({
  scope, refreshKey, onOpenTrace,
}: {
  scope: Scope; refreshKey: number; onOpenTrace: (id: string) => void;
}) {
  const [data, setData] = useState<any>({ usages: [], totals: {}, byPurpose: [], byModel: [], timeseries: [], transcript: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    get("/ai/usage", scope as any).then(setData).finally(() => setLoading(false));
  }, [JSON.stringify(scope), refreshKey]);

  const tot = data.totals || {};
  const ts = data.timeseries || [];
  const x = ts.map((r: any) => dayjs(r.bucket).format("MM-DD HH:mm"));
  const trendOpt = {
    tooltip: { trigger: "axis" }, legend: {},
    grid: { left: 48, right: 40, top: 36, bottom: 8, containLabel: true },
    xAxis: { type: "category", data: x },
    yAxis: [{ type: "value", name: "calls" }, { type: "value", name: "tokens" }],
    series: [
      { name: "Calls", type: "bar", itemStyle: { color: BRAND.ink }, data: ts.map((r: any) => r.calls) },
      { name: "Heuristic", type: "bar", itemStyle: { color: ERROR_RED }, data: ts.map((r: any) => r.fallbacks) },
      { name: "Tokens", type: "line", yAxisIndex: 1, itemStyle: { color: BRAND.gold }, lineStyle: { color: BRAND.gold }, data: ts.map((r: any) => r.tokens) },
    ],
  };
  const purpose = data.byPurpose || [];
  const purposeOpt = {
    color: CHART_COLORS,
    tooltip: { trigger: "axis" },
    grid: { left: 8, right: 24, top: 10, bottom: 8, containLabel: true },
    xAxis: { type: "value" },
    yAxis: { type: "category", inverse: true, data: purpose.map((r: any) => r.key), axisLabel: { formatter: axisTrunc(18), fontSize: 11 } },
    series: [{ type: "bar", data: purpose.map((r: any) => r.calls), itemStyle: { color: BRAND.gold } }],
  };

  const tile = (t: string, v: any, sub?: string, color?: string) => (
    <Card size="small" style={{ borderTop: `2px solid ${color || BRAND.gold}`, height: "100%" }}>
      <Statistic title={t} value={v as any} valueStyle={{ color: color || BRAND.ink, fontSize: 19, fontWeight: 600 }} />
      {sub && <Typography.Text type="secondary" style={{ fontSize: 11 }}>{sub}</Typography.Text>}
    </Card>
  );

  const cols = [
    { title: "When", dataIndex: "ts", width: 150, render: (v: string) => dayjs(v).format("MM-DD HH:mm:ss") },
    { title: "Kind", dataIndex: "node", width: 140, render: (_: any, r: any) => r.node || r.purpose },
    { title: "What", dataIndex: "summary", ellipsis: true, render: (v: string) => v || "—" },
    {
      title: "Model", dataIndex: "model", width: 150,
      render: (v: string, r: any) => (
        <span>{v}{r.fallback ? <Tag style={{ marginLeft: 6 }} color="red">heuristic</Tag> : <Tag style={{ marginLeft: 6 }} color="gold">{r.provider}</Tag>}</span>
      ),
    },
    { title: "In", dataIndex: "promptTokens", width: 80, align: "right" as const },
    { title: "Out", dataIndex: "completionTokens", width: 80, align: "right" as const },
    { title: "ms", dataIndex: "latencyMs", width: 70, align: "right" as const },
    {
      title: "Trace", dataIndex: "traceId", width: 90,
      render: (v: string) => v ? <a onClick={() => onOpenTrace(v)}>{v.slice(0, 10)}…</a> : "—",
    },
  ];

  const transcript = data.transcript || [];

  return (
    <>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Dashboard AI only — assistant chat, chart explain, fleet brief, and trace summarize/fix.
        Agent playground runs still live under Traces.
      </Typography.Paragraph>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 12, marginBottom: 12 }}>
        {tile("Calls", tot.calls ?? 0, "this window")}
        {tile("Billed LLM", tot.llm_calls ?? 0, "Gemini / OpenAI")}
        {tile("Heuristic", tot.fallbacks ?? 0, "no API key or fallback", tot.fallbacks ? ERROR_RED : undefined)}
        {tile("Tokens", tot.tokens ?? 0, "prompt + completion")}
        {tile("Latency P50", tot.p50_ms ?? 0, "ms")}
      </div>
      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={24} lg={15}><ChartCard title="Dashboard AI over time" option={trendOpt} height={280} /></Col>
        <Col xs={24} lg={9}><ChartCard title="Calls by kind" option={purposeOpt} height={280} /></Col>
      </Row>
      <Card size="small" title="Call log" style={{ marginBottom: 12 }}>
        <GenericTable
          rows={data.usages || []}
          loading={loading}
          exportName="dashboard_ai"
          columns={cols}
          scrollY={360}
          onRowClick={(r) => { if (r.traceId) onOpenTrace(r.traceId); }}
        />
      </Card>
      <Card size="small" title="Recent assistant transcript">
        {transcript.length === 0 ? (
          <Empty description="Ask the floating assistant or click a chart lightbulb — those turns land here." />
        ) : (
          <div style={{ maxHeight: 280, overflow: "auto" }}>
            {transcript.map((t: any) => (
              <div key={t.id} style={{ marginBottom: 10 }}>
                <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                  {t.role} · {dayjs(t.createdAt).format("MM-DD HH:mm")}
                </Typography.Text>
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{t.content}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
