"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Старые ссылки /app/p/:id ведут в единый чат-кабинет. */
export default function ProjectRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/app");
  }, [router]);
  return (
    <div className="flex h-full items-center justify-center text-sm text-tn-muted">
      Открываем чат…
    </div>
  );
}
