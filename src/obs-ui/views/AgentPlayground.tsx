"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Card, Col, Input, Row, Space, Statistic, Tag, Typography } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import type { Agent, Trace } from "@/lib/types";
import { BRAND, ERROR_RED } from "../theme";

const SAMPLES: Record<string, string> = {
  "atlas-research": "Compare checkpointers vs stores in LangGraph and when to use each.",
  "helix-support": "I was charged twice for workspace seats this month. Can I get a refund?",
  "forge-code-review": 'Review: def get_user(id): return db.execute(f"SELECT * FROM users WHERE id={id}")',
  "sentinel-incident": "Checkout p99 timeout after the 18:10 deploy. Error rate 2.4% on payments-api.",
};

function apiError(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const rec = data as { error?: unknown; detail?: unknown };
  if (typeof rec.error === "string" && rec.error) return rec.error;
  if (typeof rec.detail === "string" && rec.detail) return rec.detail;
  return fallback;
}

export default function AgentPlayground({
  refreshKey,
  onRan,
  onOpenTrace,
}: {
  refreshKey: number;
  onRan?: () => void;
  onOpenTrace?: (id: string) => void;
}) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [slug, setSlug] = useState("atlas-research");
  const [input, setInput] = useState(SAMPLES["atlas-research"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [alive, setAlive] = useState(false);
  const [runtimeModel, setRuntimeModel] = useState("");

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => {
        const list = (d.agents || []) as Agent[];
        setAgents(list);
        if (list.length && !list.some((a) => a.slug === slug)) {
          setSlug(list[0].slug);
          setInput(SAMPLES[list[0].slug] ?? "");
        }
      })
      .catch(() => undefined);
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    const ping = () =>
      fetch("/api/runtime", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          setAlive(Boolean(d?.ok));
          setRuntimeModel(d?.model ? String(d.model) : "");
        })
        .catch(() => {
          if (!cancelled) setAlive(false);
        });
    ping();
    const id = setInterval(ping, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const selected = agents.find((a) => a.slug === slug);

  const pick = (next: string) => {
    setSlug(next);
    setInput(SAMPLES[next] ?? "");
    setError(null);
  };

  async function run() {
    const text = input.trim();
    if (!text) {
      setError("Enter a prompt, then press Run.");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    setTrace(null);
    setOutput(null);
    try {
      const res = await fetch("/api/invoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, input: text }),
        signal: AbortSignal.timeout(70_000),
      });
      const data = (await res.json()) as {
        trace?: Trace;
        output?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        setError(apiError(data, "Invoke failed"));
        return;
      }
      setTrace(data.trace ?? null);
      setOutput(data.output ?? data.trace?.response ?? null);
      if (!data.trace && !data.output) setError("Agent returned an empty result");
      onRan?.();
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      setError(timedOut ? "Agent run timed out." : "Could not reach the agent runtime. Start it with .\\run-agents.cmd");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Space direction="vertical" size={12} style={{ width: "100%" }}>
      <Card size="small">
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Run one of the four local LangGraph agents
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Atlas, Helix, Forge, and Sentinel execute on the Python runtime. Each run is ingested as a scored trace.
          Runtime is {alive ? "online" : "offline"}
          {runtimeModel ? ` · ${runtimeModel}` : ""}.
        </Typography.Paragraph>
        {!alive && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="Agent runtime is not reachable"
            description="In another terminal run .\run-agents.cmd (or ./run-agents.sh)."
          />
        )}
        <Row gutter={[12, 12]}>
          {agents.map((a) => {
            const on = a.slug === slug;
            return (
              <Col xs={24} sm={12} lg={6} key={a.id}>
                <Card
                  size="small"
                  hoverable
                  onClick={() => pick(a.slug)}
                  style={{
                    borderColor: on ? BRAND.gold : BRAND.border,
                    boxShadow: on ? "0 0 0 1px #B6862C" : undefined,
                    cursor: "pointer",
                    height: "100%",
                  }}
                >
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Typography.Text strong>{a.name}</Typography.Text>
                    <Tag color={a.status === "online" ? "green" : a.status === "degraded" ? "gold" : "default"}>
                      {a.status}
                    </Tag>
                  </Space>
                  <Typography.Paragraph type="secondary" style={{ margin: "8px 0 0", fontSize: 12 }}>
                    {a.description}
                  </Typography.Paragraph>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {a.graph.nodes.join(" → ")}
                  </Typography.Text>
                </Card>
              </Col>
            );
          })}
        </Row>
      </Card>

      <Card size="small" title={selected ? `Prompt · ${selected.name}` : "Prompt"}>
        <Input.TextArea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={6}
          disabled={busy}
        />
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          loading={busy}
          onClick={() => void run()}
          style={{ marginTop: 12 }}
        >
          {busy ? "Running graph…" : "Run agent"}
        </Button>
        {error && (
          <Alert type="error" showIcon style={{ marginTop: 12 }} message={error} />
        )}
      </Card>

      {(trace || output) && (
        <Card size="small" title="Result">
          {trace && (
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={8}><Statistic title="Accuracy" value={trace.accuracy} precision={1} /></Col>
              <Col span={8}><Statistic title="Confidence" value={trace.confidence} precision={1} /></Col>
              <Col span={8}><Statistic title="Trust" value={trace.trustScore} precision={1} /></Col>
            </Row>
          )}
          <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
            {trace?.status ?? "ok"}
            {trace?.degraded ? " · degraded" : ""}
            {trace?.model ? ` · ${trace.model}` : ""}
            {trace?.latencyMs != null ? ` · ${trace.latencyMs} ms` : ""}
          </Typography.Paragraph>
          <pre style={{
            whiteSpace: "pre-wrap",
            fontSize: 12,
            background: "#fbf7ef",
            border: `1px solid ${BRAND.border}`,
            borderRadius: 8,
            padding: 12,
            color: trace?.status === "error" ? ERROR_RED : BRAND.ink,
          }}>
            {output || trace?.response || trace?.error}
          </pre>
          {trace?.id && onOpenTrace && (
            <Button type="link" style={{ paddingLeft: 0 }} onClick={() => onOpenTrace(trace.id)}>
              Open trace {trace.id}
            </Button>
          )}
        </Card>
      )}
    </Space>
  );
}
