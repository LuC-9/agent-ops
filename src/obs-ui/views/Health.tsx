"use client";

import { useEffect, useState } from "react";
import { Table, Tag, Typography, Alert } from "antd";
import dayjs from "dayjs";
import { get } from "../api";

const fmtDur = (mins: number) => {
  if (mins == null) return "—";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
};
// wall-clock age (the pipeline banner) -> "ago"
const fmtAgo = (mins: number) => (mins == null ? "—" : `${fmtDur(mins)} ago`);
// distance behind the freshest ingested data (per-service) -> "behind", never "ago",
// because minutes_since is no longer measured from the clock.
const fmtBehind = (mins: number) => (mins == null ? "—" : mins <= 0 ? "current" : `${fmtDur(mins)} behind`);

export default function Health({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    get("/health").then(setRows).finally(() => setLoading(false));
  }, [refreshKey]);

  // minutes_since is now measured against DATA FRESHNESS (the newest span we hold), not the
  // wall clock - so it no longer moves just because the hourly pipeline has not run yet.
  // Thresholds are expressed in pipeline intervals so they stay meaningful if the schedule
  // changes: "live" must be at least one interval + margin, or a healthy service that emits
  // once per run would read as quiet.
  const PIPELINE_INTERVAL_MIN = 60;              // scheduler cadence: 0 * * * * (hourly)
  const LIVE_MAX = PIPELINE_INTERVAL_MIN;        // within the last interval of data
  const QUIET_MAX = PIPELINE_INTERVAL_MIN * 6;   // several intervals behind
  const PIPELINE_LAG_WARN = PIPELINE_INTERVAL_MIN * 1.5;  // data itself is late

  const status = (m: number) =>
    m == null ? <Tag>unknown</Tag>
      : m <= LIVE_MAX ? <Tag color="green">live</Tag>
      : m <= QUIET_MAX ? <Tag color="gold">quiet</Tag>
      : <Tag color="red">stale</Tag>;

  // pipeline freshness is identical on every row (CROSS JOIN), so read it off the first
  const meta: any = rows[0] || {};
  const dataAsOf: string | undefined = meta.data_as_of;
  const dataAge: number | undefined = meta.data_age_minutes;
  const pipelineLate = dataAge != null && dataAge > PIPELINE_LAG_WARN;

  const columns = [
    { title: "Service", dataIndex: "service_name", sorter: (a: any, b: any) => String(a.service_name).localeCompare(b.service_name) },
    { title: "Platform", dataIndex: "platform" },
    { title: "Project", dataIndex: "project_id" },
    { title: "Status", dataIndex: "minutes_since", render: (m: number) => status(m),
      sorter: (a: any, b: any) => (a.minutes_since || 0) - (b.minutes_since || 0) },
    { title: "Behind data", dataIndex: "minutes_since", render: (m: number) => fmtBehind(m) },
    { title: "Last ts", dataIndex: "last_seen", render: (t: string) => (t ? dayjs(t).format("MMM D HH:mm:ss") : "—") },
    { title: "Traces (48h)", dataIndex: "traces_48h", sorter: (a: any, b: any) => (a.traces_48h || 0) - (b.traces_48h || 0) },
    { title: "Cost (48h)", dataIndex: "cost_48h", render: (v: number) => (v != null ? `$${Number(v).toFixed(4)}` : "—") },
    { title: "Error rate", dataIndex: "error_rate", render: (v: number) => `${((v || 0) * 100).toFixed(1)}%`,
      sorter: (a: any, b: any) => (a.error_rate || 0) - (b.error_rate || 0) },
  ];

  return (
    <>
      {pipelineLate && (
        <Alert type="warning" showIcon style={{ marginBottom: 12 }}
          message={`Pipeline is behind — data is ${fmtAgo(dataAge!)}`}
          description="Service statuses below are measured against the data we hold, so they stay accurate; but nothing newer than the timestamp above has been ingested yet. Check the pipeline before treating a service as quiet." />
      )}
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message="Service health (last 48h, all services)"
        description={`Independent of the page time filter. Status is measured against the freshest ingested data, not the clock: live ≤${LIVE_MAX}m · quiet ≤${QUIET_MAX / 60}h · stale >${QUIET_MAX / 60}h behind — spot services that stopped emitting.`} />
      <Typography.Text type="secondary">
        {rows.length} services{dataAsOf ? ` · data as of ${dayjs(dataAsOf).format("MMM D HH:mm:ss")}${dataAge != null ? ` (${fmtAgo(dataAge)})` : ""}` : ""}
      </Typography.Text>
      <Table size="small" loading={loading} rowKey="service_name" style={{ marginTop: 8 }}
        dataSource={rows} columns={columns as any} pagination={{ pageSize: 25 }} />
    </>
  );
}
