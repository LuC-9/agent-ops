import { PlaygroundForm } from "@/components/playground-form";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function PlaygroundPage() {
  return <PlaygroundForm agents={getStore().agents} />;
}
