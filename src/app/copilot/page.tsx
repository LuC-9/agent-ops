import { CopilotChat } from "@/components/copilot-chat";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function CopilotPage() {
  return <CopilotChat initial={getStore().copilot} />;
}
