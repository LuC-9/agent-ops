"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";
import { Layout, App as AntApp, Alert } from "antd";
import { useAuth } from "./auth";
import { get, Scope } from "./api";
import Login from "./pages/Login";
import AppHeader from "./components/AppHeader";
import Sidebar, { TAB_LABELS } from "./components/Sidebar";
import FilterBar from "./components/FilterBar";
import GlobalSearch, { SearchAction } from "./components/GlobalSearch";
import SettingsDrawer, { Settings } from "./components/SettingsDrawer";
import TraceDrawer from "./components/TraceDrawer";
import Assistant from "./components/Assistant";
import Overview from "./views/Overview";
import Traces from "./views/Traces";
import Logs from "./views/Logs";
import Metrics from "./views/Metrics";
import Cost from "./views/Cost";
import AgentCost from "./views/AgentCost";
import Sessions from "./views/Sessions";
import Tools from "./views/Tools";
import Insights from "./views/Insights";
import AiUsage from "./views/AiUsage";
import Health from "./views/Health";
import PlatformHealth from "./views/PlatformHealth";
import Compare from "./views/Compare";
import AgentPlayground from "./views/AgentPlayground";
import Admin from "./views/Admin";

function loadSettings(): Settings {
  if (typeof window === "undefined") {
    return { budgetCost: 0, budgetErr: 0, autoSeconds: 60, defaultRange: "7d", pageSize: 50 };
  }
  return {
    budgetCost: Number(localStorage.getItem("budgetCost") || 0),
    budgetErr: Number(localStorage.getItem("budgetErr") || 0),
    autoSeconds: Number(localStorage.getItem("autoSeconds") || 60),
    defaultRange: localStorage.getItem("defaultRange") || "7d",
    pageSize: Number(localStorage.getItem("pageSize") || 50),
  };
}

function readUrl(defaultRange: string): { scope: Scope; tab: string } {
  if (typeof window === "undefined") return { scope: { time_range: defaultRange }, tab: "overview" };
  const p = new URLSearchParams(location.search);
  return {
    scope: {
      project: p.get("project") || undefined, platform: p.get("platform") || undefined,
      service: p.get("service") || undefined, time_range: p.get("time_range") || defaultRange,
      start: p.get("start") || undefined, end: p.get("end") || undefined,
    },
    tab: p.get("tab") || "overview",
  };
}
function writeUrl(scope: Scope, tab: string) {
  const p = new URLSearchParams();
  Object.entries({ ...scope, tab }).forEach(([k, v]) => { if (v) p.set(k, String(v)); });
  history.replaceState(null, "", `?${p.toString()}`);
}

export default function Root() {
  const { token, role, allowedProjects } = useAuth();
  const { message } = AntApp.useApp();

  const [settings, setSettings] = useState<Settings>(loadSettings);
  const init = readUrl(settings.defaultRange);

  const [scope, setScope] = useState<Scope>(init.scope);
  const [tab, setTab] = useState(init.tab);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchTrace, setSearchTrace] = useState<string | null>(null);
  const [bannerKpi, setBannerKpi] = useState<any>({});
  const [me, setMe] = useState<any>(null);

  useEffect(() => writeUrl(scope, tab), [scope, tab]);
  useEffect(() => {
    if (tab === "agentengines") setTab("playground");
    if (["admin", "platformhealth"].includes(tab) && role && role !== "admin") {
      setTab("overview");
    }
  }, [tab, role]);
  useEffect(() => { if (token) get("/me").then(setMe).catch(() => setMe(null)); }, [token]);

  const loadFreshness = useCallback(() => {
    if (token) get("/meta/last-refresh").then(setLastRefresh).catch(() => {});
  }, [token]);
  const refetch = useCallback(() => {
    setBusy(true); setRefreshKey((k) => k + 1); loadFreshness();
    setTimeout(() => setBusy(false), 500);
  }, [loadFreshness]);

  const saveSettings = (s: Settings) => {
    Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, String(v)));
    setSettings(s);
    setRefreshKey((k) => k + 1);   // re-render so timezone/format changes apply
    message.success("Settings saved");
  };

  useEffect(loadFreshness, [loadFreshness]);
  useEffect(() => {
    if (token) get("/overview", scope as any).then((o) => setBannerKpi(o.kpis || {})).catch(() => {});
  }, [JSON.stringify(scope), refreshKey, token]);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(refetch, Math.max(15, settings.autoSeconds) * 1000);
    return () => clearInterval(id);
  }, [auto, refetch, settings.autoSeconds]);

  const onSearch = (a: SearchAction) => {
    if (a.type === "trace") setSearchTrace(a.value);
    else if (a.type === "service") { setScope((s) => ({ ...s, service: a.value })); message.success(`Filtered service: ${a.value}`); }
    else if (a.type === "project") setScope((s) => ({ ...s, project: a.value, platform: undefined, service: undefined }));
    else if (a.type === "session") { setTab("sessions"); message.info("Open the session in the Sessions tab"); }
    else message.info(`${a.type}: ${a.value}`);
  };

  if (!token) return <Login />;

  const costBreach = settings.budgetCost > 0 && (bannerKpi.cost_usd || 0) > settings.budgetCost;
  const errBreach = settings.budgetErr > 0 && (bannerKpi.error_rate || 0) * 100 > settings.budgetErr;

  const onScope = (patch: Partial<Scope>) => setScope((s) => ({ ...s, ...patch }));
  const views: Record<string, ReactElement> = {
    overview: <Overview scope={scope} refreshKey={refreshKey} onScope={onScope} onOpenTrace={setSearchTrace} />,
    traces: <Traces scope={scope} refreshKey={refreshKey} />,
    logs: <Logs scope={scope} refreshKey={refreshKey} />,
    metrics: <Metrics scope={scope} refreshKey={refreshKey} onScope={onScope} onNavigate={setTab} />,
    cost: <Cost scope={scope} refreshKey={refreshKey} onScope={onScope} />,
    agentcost: <AgentCost scope={scope} refreshKey={refreshKey} onScope={onScope} onNavigate={setTab} />,
    sessions: <Sessions scope={scope} refreshKey={refreshKey} />,
    tools: <Tools scope={scope} refreshKey={refreshKey} />,
    insights: <Insights scope={scope} refreshKey={refreshKey} onScope={onScope} />,
    aiusage: <AiUsage scope={scope} refreshKey={refreshKey} onOpenTrace={setSearchTrace} />,
    health: <Health refreshKey={refreshKey} />,
    platformhealth: <PlatformHealth refreshKey={refreshKey} />,
    compare: <Compare scope={scope} />,
    playground: <AgentPlayground refreshKey={refreshKey} onRan={refetch} onOpenTrace={setSearchTrace} />,
    admin: <Admin />,
  };
  return (
    <Layout style={{ minHeight: "100vh" }} hasSider>
      <Sidebar collapsed={collapsed} tab={tab} onSelect={setTab}
        onSettings={() => setSettingsOpen(true)}
        lastData={Object.values(lastRefresh).filter(Boolean).sort().slice(-1)[0] as string | undefined} />
      <Layout>
        <AppHeader title={TAB_LABELS[tab] || "Overview"} collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onRefetch={refetch}
          busy={busy} autoRefresh={auto} setAutoRefresh={setAuto}
          onOpenSearch={() => setSearchOpen(true)} me={me} />
        <Layout.Content style={{ padding: 14 }}>
          {(costBreach || errBreach) && (
            <Alert type="error" showIcon banner style={{ marginBottom: 8 }}
              message={[
                costBreach ? `Cost $${(bannerKpi.cost_usd || 0).toFixed(4)} > budget $${settings.budgetCost}` : null,
                errBreach ? `Error rate ${((bannerKpi.error_rate || 0) * 100).toFixed(1)}% > ${settings.budgetErr}%` : null,
              ].filter(Boolean).join("   ·   ")} />
          )}
          {role === "user" && allowedProjects.length === 0 && (
            <Alert
              data-testid="no-project-banner"
              type="warning"
              showIcon
              banner
              style={{ marginBottom: 8 }}
              message="No projects assigned to your account. Ask an admin to grant project access."
            />
          )}
          {tab !== "playground" && (
            <FilterBar scope={scope} onChange={setScope} />
          )}
          <div style={{ marginTop: 8 }}>{views[tab]}</div>
        </Layout.Content>
      </Layout>

      <GlobalSearch open={searchOpen} setOpen={setSearchOpen} onAction={onSearch} />
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={settings} onSave={saveSettings} />
      <TraceDrawer traceId={searchTrace} open={!!searchTrace} onClose={() => setSearchTrace(null)} onOpenTrace={setSearchTrace} />
      <Assistant context={{ tab, project: scope.project, service: scope.service, platform: scope.platform, time_range: scope.time_range }}
        onScope={onScope} onNavigate={setTab} onOpenTrace={setSearchTrace} />
    </Layout>
  );
}
