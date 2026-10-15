"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/app");
  }, [user, loading, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 20% 20%, color-mix(in srgb, var(--tn-red) 18%, transparent), transparent 50%), radial-gradient(ellipse at 80% 80%, color-mix(in srgb, var(--tn-red) 10%, transparent), transparent 45%), var(--tn-surface)",
        }}
      />
      <form
        onSubmit={onSubmit}
        className="tn-fade-up relative w-full max-w-md rounded-3xl border border-tn-border bg-tn-panel p-8 shadow-tn"
      >
        <label className="mb-3 block text-sm">
          Логин
          <input
            className="mt-1 w-full rounded-xl border border-tn-border bg-tn-surface px-3 py-2"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="mb-4 block text-sm">
          Пароль
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-tn-border bg-tn-surface px-3 py-2"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="mb-3 text-sm text-tn-red">{error}</div>}
        <button
          disabled={busy}
          className="w-full rounded-xl bg-tn-red py-2.5 text-sm font-medium text-white"
        >
          {busy ? "Вход…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
