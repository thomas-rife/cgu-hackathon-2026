import { Suspense } from "react";
import TodaysPlan from "@/components/todays-plan";

export default function Home() {
  return <Suspense fallback={<p className="p-6 text-sm text-slate-500">Loading Today’s Plan…</p>}><TodaysPlan /></Suspense>;
}
