"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/lib/auth";
import "@/components/workspace.css";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/");
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-tn-muted">
        Загрузка…
      </div>
    );
  }

  return (
    <div className="flex h-screen max-h-screen overflow-hidden">
      <Sidebar />
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-tn-surface">
        {children}
      </main>
    </div>
  );
}
