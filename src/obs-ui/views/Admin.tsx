"use client";

import { useEffect, useState } from "react";
import {
  Card, Table, Button, Tag, Space, Modal, Form, Input, Select, App as AntApp, Popconfirm,
} from "antd";
import { PlusOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { api, get } from "../api";
import { useAuth } from "../auth";

interface UserRow {
  username: string;
  role: "admin" | "user";
  allowed_projects: string[];
  access_mode?: "auto" | "manual";
  created_at?: string;
}

export default function Admin() {
  const { user: currentUser } = useAuth();
  const { message } = AntApp.useApp();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const [uRes, pRes] = await Promise.allSettled([
        get<UserRow[]>("/admin/users"),
        get<{ project_id: string }[]>("/admin/projects"),
      ]);
      if (uRes.status === "fulfilled") {
        setUsers(uRes.value);
      } else {
        message.error("Failed to load users list");
      }
      if (pRes.status === "fulfilled") {
        setProjects(pRes.value.map((r) => r.project_id));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (modalOpen) {
      if (editing) {
        form.setFieldsValue({
          username: editing.username,
          role: editing.role,
          allowed_projects: editing.allowed_projects || [],
          access_mode: editing.access_mode || "auto",
          password: "",
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ role: "user", allowed_projects: [], access_mode: "manual" });
      }
    }
  }, [modalOpen, editing, form]);

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (u: UserRow) => {
    setEditing(u);
    setModalOpen(true);
  };

  const submit = async () => {
    try {
      const v = await form.validateFields();
      if (editing) {
        const body: any = {
          role: v.role,
          allowed_projects: v.allowed_projects || [],
          access_mode: v.access_mode || "auto",
        };
        if (v.password) body.password = v.password;
        await api.patch(`/admin/users/${editing.username}`, body);
        message.success(`Updated ${editing.username}`);
      } else {
        const body: Record<string, unknown> = {
          username: v.username,
          role: v.role,
          allowed_projects: v.allowed_projects || [],
          access_mode: v.access_mode || "manual",
        };
        if (v.password) body.password = v.password;
        await api.post("/admin/users", body);
        message.success(`Created ${v.username}`);
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      if (e?.errorFields) return;
      const detail = e?.response?.data?.detail;
      let msg = "Save failed";
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
      } else if (e?.message) {
        msg = e.message;
      }
      message.error(msg);
    }
  };

  const remove = async (username: string) => {
    try {
      await api.delete(`/admin/users/${username}`);
      message.success(`Deleted ${username}`);
      load();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      let msg = "Delete failed";
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
      } else if (e?.message) {
        msg = e.message;
      }
      message.error(msg);
    }
  };

  const columns = [
    { title: "User", dataIndex: "username", key: "username" },
    {
      title: "Role", dataIndex: "role", key: "role",
      render: (r: string) => <Tag color={r === "admin" ? "gold" : "blue"}>{r}</Tag>,
    },
    {
      title: "Access", dataIndex: "access_mode", key: "access_mode",
      render: (m: string, row: UserRow) =>
        row.role === "admin"
          ? <Tag color="green">all projects</Tag>
          : <Tag color={m === "manual" ? "purple" : "cyan"}>{m === "manual" ? "manual" : "auto (IAM)"}</Tag>,
    },
    {
      title: "Allowed projects",
      dataIndex: "allowed_projects",
      key: "allowed_projects",
      render: (a: string[], row: UserRow) =>
        row.role === "admin"
          ? <Tag color="green">all projects</Tag>
          : row.access_mode === "auto"
            ? <Tag color="cyan">from IAM at login</Tag>
            : (a && a.length ? a.map((p) => <Tag key={p}>{p}</Tag>) : <Tag color="red">none</Tag>),
    },
    { title: "Created", dataIndex: "created_at", key: "created_at",
      render: (v: string) => v ? new Date(v).toLocaleString() : "—" },
    {
      title: "Actions", key: "actions",
      render: (_: any, row: UserRow) => (
        <Space>
          <Button data-testid={`edit-user-${row.username}`} icon={<EditOutlined />} onClick={() => openEdit(row)}>Edit</Button>
          <Popconfirm
            title={`Delete ${row.username}?`}
            onConfirm={() => remove(row.username)}
            okText="Delete"
            okButtonProps={{ danger: true }}
            disabled={row.username === currentUser}
          >
            <Button data-testid={`delete-user-${row.username}`} danger icon={<DeleteOutlined />} disabled={row.username === currentUser}>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div data-testid="admin-view">
      <Card
        title="Users & access (RBAC)"
        extra={
          <Button data-testid="create-user-btn" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            New user
          </Button>
        }
      >
        <Table
          rowKey="username"
          loading={loading}
          dataSource={users}
          columns={columns as any}
          pagination={false}
          data-testid="users-table"
        />
      </Card>

      <Modal
        open={modalOpen}
        title={editing ? `Edit ${editing.username}` : "Create user"}
        onCancel={() => setModalOpen(false)}
        onOk={submit}
        okText="Save"
        destroyOnHidden
        data-testid="user-form-modal"
      >
        <Form form={form} preserve={false} layout="vertical">
          {!editing && (
            <Form.Item name="username" label="Email / username" rules={[{ required: true, message: "Required" }]}>
              <Input data-testid="user-form-username" autoFocus placeholder="name@loreal.com" />
            </Form.Item>
          )}
          <Form.Item
            name="password"
            label={editing ? "New password (leave blank to keep)" : "Password (optional — SSO only)"}
            extra={!editing ? "Leave blank for Google SSO users; set only for username/password login." : undefined}
          >
            <Input.Password data-testid="user-form-password" />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <Select
              data-testid="user-form-role"
              options={[
                { value: "user", label: "User (project-scoped)" },
                { value: "admin", label: "Admin (full access)" },
              ]}
            />
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.role !== cur.role}
          >
            {({ getFieldValue }) =>
              getFieldValue("role") === "user" ? (
                <>
                  <Form.Item name="access_mode" label="Access mode" rules={[{ required: true }]}>
                    <Select
                      data-testid="user-form-access-mode"
                      options={[
                        { value: "auto", label: "Auto — IAM / SSO at login" },
                        { value: "manual", label: "Manual — admin-assigned projects" },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, cur) => prev.access_mode !== cur.access_mode}
                  >
                    {({ getFieldValue: gf }) =>
                      gf("access_mode") === "manual" ? (
                        <Form.Item
                          name="allowed_projects"
                          label="Allowed projects"
                          tooltip="Used only when access mode is Manual."
                        >
                          <Select
                            data-testid="user-form-projects"
                            mode="multiple"
                            placeholder="Select projects"
                            options={projects.map((p) => ({ value: p, label: p }))}
                          />
                        </Form.Item>
                      ) : null
                    }
                  </Form.Item>
                </>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
