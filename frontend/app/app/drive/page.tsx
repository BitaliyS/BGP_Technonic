"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Раньше была тестовая вкладка Drive — функционал встроен в кабинет юриста. */
export default function DriveRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app");
  }, [router]);
  return (
    <div className="flex h-full items-center justify-center text-sm text-tn-muted">
      Перенаправление в кабинет юриста…
    </div>
  );
}
