import { Suspense } from "react";
import PlannerWorkspace from "@/components/planner-workspace";
export default function PlannerPage() {
  return <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading route planner…</p>}><PlannerWorkspace /></Suspense>;
}
