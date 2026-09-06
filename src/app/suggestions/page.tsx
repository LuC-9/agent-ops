import { ImprovementsBoard } from "@/components/improvements-board";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function SuggestionsPage() {
  const store = getStore();
  return <ImprovementsBoard initialItems={store.improvements} agents={store.agents} />;
}
