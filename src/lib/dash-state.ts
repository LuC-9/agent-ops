import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const FILE = path.join(process.cwd(), "data", "dash-config.json");

export interface DashUser {
  username: string;
  password: string;
  role: "admin" | "user";
  allowed_projects: string[];
  access_mode: "auto" | "manual";
  created_at: string;
}

export interface PriceRow {
  id: string;
  model_prefix: string;
  input_cost: number;
  output_cost: number;
  active: boolean;
  updated_at: string;
}

export interface EngineFlag {
  telemetry: boolean;
  status: "configured" | "not_configured" | "skipped";
}

export interface DashConfig {
  users: DashUser[];
  pricing: PriceRow[];
  engines: Record<string, EngineFlag>;
  pipeline: {
    execution: string | null;
    state: string;
    startedAt: string | null;
    endedAt: string | null;
    history: { state: string; start: string | null; end: string | null }[];
  };
}

function defaults(): DashConfig {
  const now = new Date().toISOString();
  return {
    users: [
      {
        username: "admin",
        password: "admin",
        role: "admin",
        allowed_projects: [],
        access_mode: "auto",
        created_at: now,
      },
    ],
    pricing: [
      { id: "p_gemini", model_prefix: "gemini", input_cost: 0.15, output_cost: 0.6, active: true, updated_at: now },
      { id: "p_gpt", model_prefix: "gpt", input_cost: 0.15, output_cost: 0.6, active: true, updated_at: now },
      { id: "p_mock", model_prefix: "mock", input_cost: 0.5, output_cost: 1.5, active: true, updated_at: now },
      { id: "p_default", model_prefix: "default", input_cost: 0.5, output_cost: 1.5, active: true, updated_at: now },
    ],
    engines: {},
    pipeline: {
      execution: null,
      state: "SUCCEEDED",
      startedAt: now,
      endedAt: now,
      history: [{ state: "SUCCEEDED", start: now, end: now }],
    },
  };
}

function read(): DashConfig {
  try {
    if (!fs.existsSync(FILE)) {
      const d = defaults();
      write(d);
      return d;
    }
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as DashConfig;
    const d = defaults();
    parsed.users ??= d.users;
    parsed.pricing ??= d.pricing;
    for (const p of parsed.pricing) {
      if (p.model_prefix === "") p.model_prefix = "default";
    }
    parsed.engines ??= {};
    parsed.pipeline ??= d.pipeline;
    return parsed;
  } catch {
    return defaults();
  }
}

function write(cfg: DashConfig) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, FILE);
}

function mutate<T>(fn: (cfg: DashConfig) => T): T {
  const cfg = read();
  const result = fn(cfg);
  write(cfg);
  return result;
}

export function getDashConfig() {
  return read();
}

export function listUsers() {
  return read().users.map(({ password: _p, ...u }) => u);
}

export function findUser(username: string, password?: string) {
  const u = read().users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
  if (!u) return null;
  if (password !== undefined && u.password !== password) return null;
  return u;
}

export function createUser(input: Omit<DashUser, "created_at">) {
  return mutate((cfg) => {
    if (cfg.users.some((u) => u.username.toLowerCase() === input.username.toLowerCase())) {
      throw Object.assign(new Error("user already exists"), { status: 409 });
    }
    cfg.users.push({ ...input, created_at: new Date().toISOString() });
    return { ok: true };
  });
}

export function patchUser(username: string, patch: Partial<DashUser>, actor: string) {
  return mutate((cfg) => {
    const u = cfg.users.find((x) => x.username.toLowerCase() === username.toLowerCase());
    if (!u) throw Object.assign(new Error("user not found"), { status: 404 });
    if (patch.role && username.toLowerCase() === actor.toLowerCase() && patch.role !== "admin") {
      throw Object.assign(new Error("cannot demote your own admin role"), { status: 400 });
    }
    if (patch.password !== undefined) u.password = patch.password;
    if (patch.role) u.role = patch.role;
    if (patch.allowed_projects) u.allowed_projects = patch.allowed_projects;
    if (patch.access_mode) u.access_mode = patch.access_mode;
    return { ok: true };
  });
}

export function deleteUser(username: string, actor: string) {
  return mutate((cfg) => {
    if (username.toLowerCase() === actor.toLowerCase()) {
      throw Object.assign(new Error("cannot delete yourself"), { status: 400 });
    }
    const n = cfg.users.length;
    cfg.users = cfg.users.filter((u) => u.username.toLowerCase() !== username.toLowerCase());
    if (cfg.users.length === n) throw Object.assign(new Error("user not found"), { status: 404 });
    return { ok: true };
  });
}

export function listPricing() {
  return read().pricing;
}

export function addPricing(row: Omit<PriceRow, "id" | "updated_at"> & { force?: boolean }) {
  return mutate((cfg) => {
    const prefix = row.model_prefix.trim();
    if (!prefix && prefix !== "") {
      /* allow empty default */
    }
    if (row.active) {
      const dup = cfg.pricing.find((p) => p.model_prefix === prefix && p.active);
      if (dup && !row.force) {
        throw Object.assign(new Error(`An active price for '${prefix}' already exists.`), { status: 409 });
      }
      if (row.force) {
        for (const p of cfg.pricing) {
          if (p.model_prefix === prefix) p.active = false;
        }
      }
    }
    cfg.pricing.push({
      id: randomUUID(),
      model_prefix: prefix,
      input_cost: row.input_cost,
      output_cost: row.output_cost,
      active: row.active,
      updated_at: new Date().toISOString(),
    });
    return { ok: true };
  });
}

export function patchPricing(id: string, patch: Partial<PriceRow>) {
  return mutate((cfg) => {
    const row = cfg.pricing.find((p) => p.id === id);
    if (!row) throw Object.assign(new Error("not found"), { status: 404 });
    if (patch.input_cost !== undefined) row.input_cost = patch.input_cost;
    if (patch.output_cost !== undefined) row.output_cost = patch.output_cost;
    if (patch.active !== undefined) row.active = patch.active;
    row.updated_at = new Date().toISOString();
    return { ok: true };
  });
}

export function priceForModel(model: string) {
  const rows = read().pricing.filter((p) => p.active);
  const hit = rows
    .filter((p) => p.model_prefix && model.toLowerCase().startsWith(p.model_prefix.toLowerCase()))
    .sort((a, b) => b.model_prefix.length - a.model_prefix.length)[0];
  const fallback =
    rows.find((p) => p.model_prefix === "default") ??
    rows.find((p) => p.model_prefix === "") ??
    { input_cost: 0.5, output_cost: 1.5 };
  return hit ?? fallback;
}

export function getEngineFlag(id: string): EngineFlag {
  return read().engines[id] ?? { telemetry: true, status: "configured" };
}

export function setEngineTelemetry(id: string, telemetry: boolean) {
  return mutate((cfg) => {
    cfg.engines[id] = { telemetry, status: telemetry ? "configured" : "not_configured" };
    return cfg.engines[id];
  });
}

export function startPipeline() {
  const exec = `local_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  return mutate((cfg) => {
    cfg.pipeline = {
      execution: exec,
      state: "ACTIVE",
      startedAt: now,
      endedAt: null,
      history: [{ state: "ACTIVE", start: now, end: null }, ...cfg.pipeline.history].slice(0, 8),
    };
    return { execution: exec };
  });
}

export function pipelineStatus(execution?: string) {
  return mutate((cfg) => {
    if (cfg.pipeline.state === "ACTIVE" && cfg.pipeline.startedAt) {
      const age = Date.now() - new Date(cfg.pipeline.startedAt).getTime();
      if (age > 1200) {
        const end = new Date().toISOString();
        cfg.pipeline.state = "SUCCEEDED";
        cfg.pipeline.endedAt = end;
        if (cfg.pipeline.history[0]) {
          cfg.pipeline.history[0].state = "SUCCEEDED";
          cfg.pipeline.history[0].end = end;
        }
      }
    }
    if (execution && cfg.pipeline.execution !== execution) {
      return { state: cfg.pipeline.state };
    }
    return { state: cfg.pipeline.state, execution: cfg.pipeline.execution };
  });
}

export function getPipeline() {
  pipelineStatus();
  return read().pipeline;
}
