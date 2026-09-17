"use client";

import { useEffect, useState } from "react";
import { Form, Input, Button, Typography, Divider, App, Spin } from "antd";
import { GoogleOutlined } from "@ant-design/icons";
import { GoogleOAuthProvider, useGoogleLogin } from "@react-oauth/google";
import { useAuth } from "../auth";
import { get } from "../api";

interface PublicConfig {
  google_client_id?: string;
  allowed_domain?: string;
  google_oauth_scopes?: string;
}

function GoogleSignInButton({
  scopes,
  loading,
  onSuccess,
  onError,
}: {
  scopes: string;
  loading?: boolean;
  onSuccess: (accessToken: string) => void;
  onError: () => void;
}) {
  const login = useGoogleLogin({
    scope: scopes,
    onSuccess: (res) => onSuccess(res.access_token),
    onError,
  });
  return (
    <Button block size="large" icon={<GoogleOutlined />} loading={loading} onClick={() => login()}>
      Sign in with Google
    </Button>
  );
}

function LoginForm({
  cfg,
  onFinish,
  loading,
  ssoLoading,
  onGoogle,
}: {
  cfg: PublicConfig;
  onFinish: (v: { username: string; password: string }) => void;
  loading: boolean;
  ssoLoading: boolean;
  onGoogle: (accessToken: string) => void;
}) {
  const { message } = App.useApp();
  const hasGoogle = Boolean(cfg.google_client_id);
  const scopes = cfg.google_oauth_scopes
    || "openid email profile https://www.googleapis.com/auth/cloud-platform.read-only";

  return (
    <div className="login-bg" data-testid="login-page">
      <div className="login-card">
        <div className="login-head">
          <img src="/branding/wordmark.svg" className="login-logo" alt="Northstar" />
          <Typography.Title level={4} style={{ margin: "6px 0 0" }}>GenAI Observability</Typography.Title>
          <Typography.Text className="login-sub" style={{ letterSpacing: 0.3 }}>
            Local platform · admin / admin
          </Typography.Text>
        </div>

        <div style={{ padding: "10px 28px 30px" }}>
          {hasGoogle && (
            <>
              <div data-testid="login-google-wrap">
                <GoogleSignInButton
                  scopes={scopes}
                  loading={ssoLoading}
                  onSuccess={onGoogle}
                  onError={() => message.error("Google sign-in was cancelled or failed")}
                />
              </div>
              {cfg.allowed_domain && (
                <Typography.Text
                  type="secondary"
                  data-testid="login-domain-hint"
                  style={{ display: "block", textAlign: "center", marginTop: 8, fontSize: 12 }}
                >
                  Use your <b>@{cfg.allowed_domain}</b> Google account
                </Typography.Text>
              )}
              <Divider plain style={{ color: "#aaa", fontSize: 12 }}>or sign in with credentials</Divider>
            </>
          )}

          <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
            <Form.Item name="username" label="Username" rules={[{ required: true }]}>
              <Input data-testid="login-username" size="large" autoFocus placeholder="admin1" />
            </Form.Item>
            <Form.Item name="password" label="Password" rules={[{ required: true }]} style={{ marginBottom: 16 }}>
              <Input.Password data-testid="login-password" size="large" placeholder="••••••••" />
            </Form.Item>
            <Button data-testid="login-submit" type="primary" htmlType="submit" block size="large" loading={loading}>
              Sign in
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const { login, loginGoogle } = useAuth();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [cfg, setCfg] = useState<PublicConfig | null>(null);

  useEffect(() => {
    get<PublicConfig>("/config")
      .then((c) => setCfg(c || {}))
      .catch(() => setCfg({}));
  }, []);

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true);
    try { await login(v.username, v.password); }
    catch { message.error("Invalid username or password"); }
    finally { setLoading(false); }
  };

  const onGoogle = async (accessToken: string) => {
    setSsoLoading(true);
    try { await loginGoogle(accessToken); }
    catch (e: any) {
      const msg = e?.response?.data?.detail || "Google sign-in failed";
      message.error(msg);
    }
    finally { setSsoLoading(false); }
  };

  if (cfg === null) {
    return (
      <div className="login-bg" data-testid="login-page-loading">
        <div className="login-card login-card--loading">
          <Spin size="large" />
        </div>
      </div>
    );
  }

  const form = (
    <LoginForm
      cfg={cfg}
      onFinish={onFinish}
      loading={loading}
      ssoLoading={ssoLoading}
      onGoogle={onGoogle}
    />
  );

  return cfg.google_client_id
    ? <GoogleOAuthProvider clientId={cfg.google_client_id}>{form}</GoogleOAuthProvider>
    : form;
}
