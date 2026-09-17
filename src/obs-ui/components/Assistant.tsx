"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Button, Typography, Tag } from "antd";
import { CloseOutlined, UserOutlined } from "@ant-design/icons";
import { get, api } from "../api";

const BOT = "/branding/agent.svg";

type Action = { type: "trace" | "service"; label: string; value: string };
type Msg = { role: "user" | "assistant"; text: string; actions?: Action[] };

const TRACE_RE = /\b(?:tr_[a-z0-9_]+|[0-9a-f]{32})\b/gi;

// markdown-lite: **bold** and `code` (keeps newlines via CSS pre-wrap)
function md(text: string) {
  const nodes: any[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m: RegExpExecArray | null, key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) nodes.push(<b key={key++}>{tok.slice(2, -2)}</b>);
    else nodes.push(<code key={key++} style={{ background: "#f0ece2", padding: "0 4px", borderRadius: 4, fontSize: 12 }}>{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function extractActions(text: string, services: string[]): Action[] {
  const acts: Action[] = [];
  const seen = new Set<string>();
  for (const t of new Set((text.match(TRACE_RE) || []).map((s) => s.toLowerCase()))) {
    acts.push({ type: "trace", label: `Open trace ${t.slice(0, 8)}…`, value: t });
  }
  [...services].filter(Boolean).sort((a, b) => b.length - a.length).forEach((s) => {
    if (s.length >= 3 && text.includes(s) && !seen.has(s)) { seen.add(s); acts.push({ type: "service", label: `Filter: ${s}`, value: s }); }
  });
  return acts.slice(0, 6);
}

export default function Assistant({ context, onScope, onNavigate, onOpenTrace }: {
  context: any;
  onScope: (p: any) => void;
  onNavigate: (tab: string) => void;
  onOpenTrace: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sid, setSid] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [services, setServices] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { get("/filters/services").then((r) => setServices((r || []).map((x: any) => x.service_name).filter(Boolean))).catch(() => {}); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy, open]);

  const send = async (text?: string, ctxOverride?: any) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setInput(""); setBusy(true);
    try {
      const { data } = await api.post("/assistant/chat", { message: q, session_id: sid, context: ctxOverride ?? context });
      setSid(data.session_id);
      const reply = data.reply || "(no response)";
      const actions = extractActions(reply, services);
      if (data.trace_id && !actions.some((a) => a.value === data.trace_id)) {
        actions.unshift({ type: "trace", label: `Open span tree ${String(data.trace_id).slice(0, 10)}…`, value: data.trace_id });
      }
      setMsgs((m) => [...m, { role: "assistant", text: reply, actions }]);
    } catch (e: any) {
      setMsgs((m) => [...m, { role: "assistant", text: "⚠️ " + (e?.response?.data?.detail || "assistant unavailable") }]);
    } finally { setBusy(false); }
  };

  useEffect(() => {
    const h = (e: any) => {
      const { title, summary } = e.detail || {};
      setOpen(true);
      send(`Explain this chart: "${title}". What does it show and what should I take away?`, { ...context, chart: summary });
    };
    window.addEventListener("assistant:explain", h);
    return () => window.removeEventListener("assistant:explain", h);
  }, [context, sid, busy, services]);

  const runAction = (a: Action) => {
    if (a.type === "trace") onOpenTrace(a.value);
    else if (a.type === "service") { onScope({ service: a.value }); onNavigate("traces"); }
  };

  const PROMPTS: Record<string, string[]> = {
    overview: ["Explain the Trends chart and what I should do next", "Which agent has the weakest trust score and why?", "What's my total LLM cost this window?"],
    cost: ["Break cost down by model", "Where can I save money?", "Top 5 cost drivers"],
    agentcost: ["Which agent costs the most, and why?", "Which agent uses the most tokens per trace?"],
    insights: ["Explain the spend-flow Sankey", "Any expensive AND slow traces?", "Top 3 cost savings"],
    aiusage: ["How many dashboard AI calls this window?", "Which model did the assistant use?", "Show heuristic vs billed LLM calls"],
    traces: ["Show the slowest traces", "Any error traces in this window?", "Summarize recent errors and the failing graph nodes."],
    logs: ["Summarize the top error messages", "Which service has the most errors?"],
    metrics: ["What is peak instances telling me?", "Is CPU/memory healthy?"],
    health: ["Which services stopped emitting?", "Who has the highest error rate?"],
    playground: ["Run Sentinel with a metrics timeout", "Which of the four agents should I try first?"],
    fleet: ["Write a fleet brief", "Which agent should we fix first?"],
  };
  const suggestions = PROMPTS[context?.tab] || ["What's my total LLM cost?", "Which agent costs the most?", "Any error spikes?"];

  return (
    <>
      {open && (
        <div className="asst-panel">
          <div className="asst-panel-head">
            <img className="asst-headicon" src={BOT} alt="assistant" />
            <div>
              <div className="title">Observability Assistant</div>
              <div className="sub">read-only · scoped to your projects</div>
            </div>
            <span className="asst-dot" style={{ marginLeft: 8 }} />
            <CloseOutlined className="asst-close" onClick={() => setOpen(false)} />
          </div>

          <div className="asst-scroll">
            {msgs.length === 0 && (
              <div className="asst-landing">
                <img src={BOT} alt="assistant" />
                <h4>Hi, I'm your Observability copilot</h4>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12.5, margin: "2px 8px 0" }}>
                  Ask about cost, traces, logs, metrics, trust scores or errors. I read the <b>local JSON store</b>
                  (prompts, traces, scores) and cite what I find. Try:
                </Typography.Paragraph>
                <div className="asst-suggest">
                  {suggestions.map((s) => (
                    <Button key={s} size="small" shape="round" style={{ whiteSpace: "normal", height: "auto", padding: "3px 12px" }} onClick={() => send(s)}>{s}</Button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m, i) => (
              <div key={i} className={"asst-row " + m.role}>
                <span className={"asst-avatar " + (m.role === "user" ? "me" : "bot")}>
                  {m.role === "user" ? <UserOutlined /> : <img src={BOT} alt="" />}
                </span>
                <div>
                  <div className={"asst-bubble " + m.role}>{md(m.text)}</div>
                  {m.actions && m.actions.length > 0 && (
                    <div className="asst-actions">
                      {m.actions.map((a, j) => (
                        <Tag key={j} color="gold" style={{ cursor: "pointer", margin: 0 }} onClick={() => runAction(a)}>{a.label}</Tag>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {busy && (
              <div className="asst-thinking"><img src={BOT} alt="" /> thinking…</div>
            )}
            <div ref={endRef} />
          </div>

          <div className="asst-input">
            <Input.Search enterButton="Ask" value={input} onChange={(e) => setInput(e.target.value)}
              onSearch={() => send()} placeholder="Ask anything about your agents…" disabled={busy} />
          </div>
        </div>
      )}

      <div className="assistant-fab" onClick={() => setOpen((o) => !o)} title="Ask the observability assistant">
        <img src={BOT} alt="assistant" />
      </div>
    </>
  );
}
