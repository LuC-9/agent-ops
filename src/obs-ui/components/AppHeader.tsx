"use client";

import { Layout, Button, Typography, Space, Tooltip, Tag, Avatar } from "antd";
import {
  ReloadOutlined, SearchOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
} from "@ant-design/icons";
import { BRAND } from "../theme";

export default function AppHeader({
  title, collapsed, onToggle,
  onRefetch, busy, autoRefresh, setAutoRefresh,
  onOpenSearch, me,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  onRefetch: () => void;
  busy: boolean;
  autoRefresh: boolean;
  setAutoRefresh: (b: boolean) => void;
  onOpenSearch: () => void;
  me: any;
}) {
  const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const kbd = isMac ? "⌘K" : "Ctrl+K";

  return (
    <Layout.Header className="app-header" style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Button type="text" onClick={onToggle} style={{ fontSize: 18 }}
        icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} />
      <Typography.Text strong style={{ color: "#fff", fontSize: 16, letterSpacing: .3 }}>
        {title}
      </Typography.Text>

      <div style={{ flex: 1 }} />

      <Space size={8} align="center">
        <Button className="hdr-search" onClick={onOpenSearch}>
          <SearchOutlined style={{ flex: "0 0 auto", fontSize: 15 }} />
          <span className="hdr-search-txt">Search traces, services, sessions…</span>
          <Tag className="kbd-tag">{kbd}</Tag>
        </Button>

        <Tooltip title="Refresh — reload traces from the local store">
          <Button className="hdr-icon" icon={<ReloadOutlined />} onClick={onRefetch} loading={busy} />
        </Tooltip>

        {me && <>
          <span className="hdr-divider" />
          <Tooltip title={me.is_admin ? "Admin — all projects" : `${(me.projects || []).length} project(s)`}>
            <Space size={7} align="center">
              <Avatar size={26} style={{ background: BRAND.gold, color: "#0A0A0A", fontWeight: 700, fontSize: 12 }}>
                {String(me.email || "?")[0].toUpperCase()}
              </Avatar>
              <Typography.Text className="hdr-user">{me.email}</Typography.Text>
            </Space>
          </Tooltip>
        </>}
      </Space>
    </Layout.Header>
  );
}
