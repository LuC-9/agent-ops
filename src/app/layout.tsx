import type { Metadata } from "next";
import "antd/dist/reset.css";
import "@/obs-ui/index.css";

export const metadata: Metadata = {
  title: "Northstar GenAI Observability",
  description: "Local agent observability — traces, cost, health, and copilot.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#F5F3EF" }}>{children}</body>
    </html>
  );
}
