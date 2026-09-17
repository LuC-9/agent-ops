"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RedirectHome({ tab }: { tab: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/?tab=${tab}`);
  }, [router, tab]);
  return null;
}
