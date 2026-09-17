"use client";

import { useState } from "react";
import { Alert, Button, Space, Typography } from "antd";
import { ThunderboltOutlined } from "@ant-design/icons";
import { post } from "../api";

export default function AiPanel({
  kind,
  traceId,
  label,
  onOpenTrace,
}: {
  kind: "trace" | "fix" | "fleet";
  traceId?: string;
  label: string;
  onOpenTrace?: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ text: string; fallback?: boolean; model?: string; traceId?: string }>("/ai/insight", {
        kind,
        traceId,
      });
      setText(res.text);
      setMeta(res.fallback ? "heuristic (no LLM key)" : res.model || "llm");
      setCreated(res.traceId || null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Insight failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <Space>
        <Button icon={<ThunderboltOutlined />} loading={busy} onClick={() => void run()}>
          {label}
        </Button>
        {meta && (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {meta}
          </Typography.Text>
        )}
        {created && onOpenTrace && (
          <Button size="small" type="link" onClick={() => onOpenTrace(created)}>
            Open span tree
          </Button>
        )}
      </Space>
      {error && <Alert type="error" showIcon style={{ marginTop: 8 }} message={error} />}
      {text && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 8, whiteSpace: "pre-wrap" }}
          message={kind === "fix" ? "Suggested next step" : "Summary"}
          description={text}
        />
      )}
    </div>
  );
}
