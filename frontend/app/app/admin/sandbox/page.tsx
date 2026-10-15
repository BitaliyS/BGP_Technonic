"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Песочница перенесена внутрь кабинета администратора. */
export default function SandboxRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app/admin");
  }, [router]);
  return (
    <div className="flex h-full items-center justify-center text-sm text-tn-muted">
      Песочница внутри кабинета администратора…
    </div>
  );
}
