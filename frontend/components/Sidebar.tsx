"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, LogOut, Moon, Sun, Users, Shield } from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

const items = [
  {
    href: "/app",
    label: "Технониколь-ИИ",
    hint: "Чат · проекты · проверка",
    icon: Bot,
  },
  {
    href: "/app/team",
    label: "Моя команда",
    hint: "ЛК руководителя · аналитика",
    icon: Users,
  },
  {
    href: "/app/admin",
    label: "Кабинет администратора",
    hint: "Пользователи · промпты · песочница",
    icon: Shield,
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-tn-border bg-tn-panel">
      <div className="border-b border-tn-border px-4 py-4">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 overflow-auto p-3">
        {items.map((item) => {
          const active =
            item.href === "/app"
              ? pathname === "/app" || pathname.startsWith("/app/p/")
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (item.href === "/app") {
                  window.dispatchEvent(new Event("tn-open-rail"));
                }
              }}
              className={`flex flex-col rounded-xl px-3 py-2.5 transition ${
                active
                  ? "bg-tn-red/10 text-tn-red"
                  : "text-tn-muted hover:bg-tn-surface hover:text-tn-ink"
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon size={16} />
                {item.label}
              </span>
              <span className="mt-0.5 pl-6 text-[11px] leading-snug opacity-75">
                {item.hint}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-tn-border p-3">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-tn-muted hover:bg-tn-surface"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {theme === "dark" ? "Светлая тема" : "Умеренная тёмная"}
        </button>
        <div className="px-3 text-xs text-tn-muted">
          {user?.full_name || "Пользователь"}
          <div className="opacity-70">Единый кабинет</div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-tn-muted hover:bg-tn-surface"
        >
          <LogOut size={16} />
          Выйти
        </button>
      </div>
    </aside>
  );
}
