"use client";

import { useEffect, useState } from "react";
import { Card, Col, Row, Spin, Statistic, Table, Tag, Typography } from "antd";
import { get } from "../api";
import { BRAND, ERROR_RED } from "../theme";

const fmtDur = (m: number) =>
  m == null ? "—" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
const fmtInt = (n: number) => (n == null ? "—" : Number(n).toLocaleString());

const HEALTH_COLOR: Record<string, string> = {
  OK: "green", CATCHING_UP: "gold", STALE: "orange", FAILING: "red",
};

export default function PlatformHealth({ refreshKey }: { refreshKey: number }) {
  const [health, setHealth] = useState<any>(null);
  const [runtime, setRuntime] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      get("/platform/health"),
      fetch("/api/runtime").then((r) => r.json()),
    ]).then(([h, r]) => {
      if (h.status === "fulfilled") setHealth(h.value);
      if (r.status === "fulfilled") setRuntime(r.value);
    }).finally(() => setLoading(false));
  }, [refreshKey]);

  const ingest: any[] = health?.ingest || [];
  const logs: any[] = health?.logs || [];
  const lastLog = logs[0];
  const lastRows = ingest.reduce((n, r) => n + (r.last_rows || 0), 0);
  const worstLag = Math.max(0, ...ingest.map((r) => r.minutes_since_last_run || 0));
  const issues = ingest.filter((r) => !["OK", "CATCHING_UP"].includes(r.health)).length;

  return (
    <Spin spinning={loading}>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Local runtime and JSON store — not a cloud pipeline.
      </Typography.Paragraph>

      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Agent runtime"
              value={runtime?.ok ? "online" : "offline"}
              valueStyle={{ color: runtime?.ok ? "#1E7E4F" : ERROR_RED, fontSize: 20 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic title="Stored rows" value={fmtInt(lastRows)} />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Last ingest"
              value={lastLog?.minutes_since_log != null ? `${fmtDur(lastLog.minutes_since_log)} ago` : "—"}
              valueStyle={{ color: worstLag > 120 ? ERROR_RED : BRAND.ink }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="Signal issues"
              value={issues}
              valueStyle={{ color: issues ? ERROR_RED : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Signals in the local store">
        <Table
          size="small"
          pagination={false}
          rowKey={(r) => `${r.project_id}:${r.signal}`}
          dataSource={ingest}
          columns={[
            { title: "Signal", dataIndex: "signal", render: (s: string) => <Tag>{s}</Tag> },
            {
              title: "Health",
              dataIndex: "health",
              render: (h: string) => <Tag color={HEALTH_COLOR[h] || "default"}>{h}</Tag>,
            },
            { title: "Rows", dataIndex: "last_rows", render: fmtInt },
            { title: "Age", dataIndex: "minutes_since_last_run", render: fmtDur },
          ]}
        />
      </Card>
    </Spin>
  );
}
