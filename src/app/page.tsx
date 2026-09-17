"use client";

import { ThemeProvider } from "@/obs-ui/ThemeProvider";
import { AuthProvider } from "@/obs-ui/auth";
import Root from "@/obs-ui/App";

export default function HomePage() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </ThemeProvider>
  );
}
