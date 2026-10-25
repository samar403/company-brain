import { aiEnabled, MODEL } from "@/lib/ai/claude";
import { stats } from "@/lib/store";

export const dynamic = "force-dynamic";

export function GET() {
  const s = stats();
  return Response.json({ ok: true, ai: aiEnabled() ? MODEL : "offline", entries: s.approved, documents: s.documents });
}
