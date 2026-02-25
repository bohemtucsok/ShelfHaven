"use client";

import dynamic from "next/dynamic";

const StatsView = dynamic(() => import("./StatsView"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-700" />
      </div>
    </div>
  ),
});

export default function StatsLoader() {
  return <StatsView />;
}
