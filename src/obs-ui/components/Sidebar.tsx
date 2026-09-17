"use client";

import { Layout, Menu } from "antd";
import {
  DashboardOutlined, PartitionOutlined, FileTextOutlined, LineChartOutlined,
  DollarOutlined, RobotOutlined, MessageOutlined, ToolOutlined, BulbOutlined,
  HeartOutlined, SwapOutlined, SettingOutlined, LogoutOutlined, ExperimentOutlined,
  DeploymentUnitOutlined, SafetyOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import { useAuth } from "../auth";
import { fmtTime } from "../timeUtil";

export const NAV = [
  { key: "overview", label: "Overview", icon: <DashboardOutlined /> },
  { key: "traces", label: "Traces", icon: <PartitionOutlined /> },
  { key: "logs", label: "Logs", icon: <FileTextOutlined /> },
  { key: "metrics", label: "Metrics", icon: <LineChartOutlined /> },
  { key: "cost", label: "LLM Cost", icon: <DollarOutlined /> },
  { key: "agentcost", label: "Agent Cost", icon: <RobotOutlined /> },
  { key: "sessions", label: "Sessions", icon: <MessageOutlined /> },
  { key: "tools", label: "Tool Calls", icon: <ToolOutlined /> },
  { key: "insights", label: "Insights", icon: <BulbOutlined /> },
  { key: "aiusage", label: "AI Calls", icon: <ThunderboltOutlined /> },
  { key: "health", label: "Health", icon: <HeartOutlined /> },
  { key: "compare", label: "Compare", icon: <SwapOutlined /> },
];
// pinned to the bottom of the sidebar (above Settings/Logout), not part of the scrolling NAV
export const BOTTOM_NAV = [
  { key: "platformhealth", label: "Platform Health", icon: <DeploymentUnitOutlined /> },
];
export const TAB_LABELS: Record<string, string> = {
  ...Object.fromEntries([...NAV, ...BOTTOM_NAV, { key: "playground", label: "Agent Playground" }].map((n) => [n.key, n.label])),
  admin: "Admin",
};

export default function Sidebar({ collapsed, tab, onSelect, onSettings, lastData }: {
  collapsed: boolean; tab: string; onSelect: (k: string) => void; onSettings: () => void; lastData?: string;
}) {
  const { logout, role } = useAuth();
  const isAdmin = role === "admin";
  const navItems = [
    ...NAV,
    { key: "playground", label: "Agent Playground", icon: <ExperimentOutlined /> },
    ...(isAdmin ? [{ key: "admin", label: "Admin", icon: <SafetyOutlined /> }] : []),
  ];
  const bottomNavItems = isAdmin ? BOTTOM_NAV : [];

  return (
    <Layout.Sider className="app-sider" theme="dark" width={228} collapsedWidth={64}
      collapsible collapsed={collapsed} trigger={null}>
      <div className="app-logo">
        {collapsed
          ? <img className="app-logo-icon" src="/branding/mark.svg" alt="Northstar" />
          : <div className="app-brand">
              <img src="/branding/wordmark.svg" alt="Northstar" />
              <span className="app-brand-sub">GenAI Observability</span>
            </div>}
      </div>

      <Menu className="app-menu" theme="dark" mode="inline" selectedKeys={[tab]}
        onClick={(e) => onSelect(e.key)}
        items={navItems.map((n) => ({ key: n.key, icon: n.icon, label: n.label }))} />

      <div className="app-sider-bottom">
        {lastData && (
          <div className={"app-lastdata" + (collapsed ? " collapsed" : "")}
            title={`Last data: ${fmtTime(lastData)}`}>
            <span className="live-dot" />
            {!collapsed && <span className="app-lastdata-txt">Last data<br /><b>{fmtTime(lastData)}</b></span>}
          </div>
        )}
        {bottomNavItems.length > 0 && (
          <Menu className="app-menu" theme="dark" mode="inline" selectedKeys={[tab]}
            onClick={(e) => onSelect(e.key)}
            items={bottomNavItems.map((n) => ({ key: n.key, icon: n.icon, label: n.label }))} />
        )}
        <Menu theme="dark" mode="inline" selectable={false}
          items={[
            { key: "settings", icon: <SettingOutlined />, label: "Settings", onClick: onSettings },
            { key: "logout", icon: <LogoutOutlined />, label: "Logout", onClick: logout },
          ]} />
      </div>
    </Layout.Sider>
  );
}
