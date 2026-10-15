"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { api, CheckType } from "@/lib/api";
import { TeamKpiGrid } from "@/components/TeamKpi";

type Stats = {
  lawyers_count: number;
  checks_day: number;
  checks_week: number;
  checks_month: number;
  errors_total: number;
  by_contract_type: Record<string, { checks: number; errors: number }>;
  frequent_errors: {
    error_code: string;
    count: number;
    title: string;
    description: string;
    contract_type: string;
  }[];
  rare_errors: {
    error_code: string;
    count: number;
    title: string;
    description: string;
    contract_type?: string;
  }[];
  lawyers: {
    id: number;
    full_name: string;
    email: string;
    checks: number;
    errors: number;
  }[];
};

type Finding = {
  id: number;
  title: string;
  description: string;
  severity: string;
  error_code: string;
  contract_type: string;
  lawyer_id: number;
  document_id: number;
  created_at: string;
};

type Period = "day" | "week" | "month";

export default function TeamPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState("");
  const [period, setPeriod] = useState<Period>("week");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkTypes, setCheckTypes] = useState<CheckType[]>([]);

  const typeLabel = (key: string) =>
    checkTypes.find((t) => t.key === key)?.title ||
    ({ real_estate: "Аренда недвижимости", vehicle_lease: "Договор аренды ТС", unknown: "Не определён" }[
      key
    ] ||
      key);

  const load = async (contract_type?: string) => {
    setLoading(true);
    setError("");
    try {
      const s = (await api.team.stats(contract_type || undefined)) as Stats;
      setStats(s);
      setFindings((await api.team.findings()) as Finding[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить аналитику");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.checkTypes.list(false).then(setCheckTypes).catch(() => {});
  }, []);

  useEffect(() => {
    load(filter);
  }, [filter]);

  const periodChecks = useMemo(() => {
    if (!stats) return 0;
    if (period === "day") return stats.checks_day;
    if (period === "week") return stats.checks_week;
    return stats.checks_month;
  }, [stats, period]);

  const periodLabel =
    period === "day" ? "за сутки" : period === "week" ? "за 7 дней" : "за 30 дней";

  const maxTypeErrors = useMemo(() => {
    if (!stats) return 1;
    return Math.max(1, ...Object.values(stats.by_contract_type).map((v) => v.errors));
  }, [stats]);

  if (loading && !stats) {
    return <div className="p-8 text-tn-muted">Загрузка аналитики…</div>;
  }

  if (error && !stats) {
    return (
      <div className="p-8">
        <div className="max-w-lg rounded-2xl border border-tn-red/30 bg-tn-panel p-5 text-sm text-tn-red">
          {error}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const avgErrors =
    periodChecks > 0
      ? (stats.errors_total / Math.max(periodChecks, 1)).toFixed(1)
      : "—";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-tn-border bg-tn-panel px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl">Моя команда</h1>
            <p className="mt-1 text-sm text-tn-muted">
              Личный кабинет руководителя · проверки договоров и качество потока
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-h-11 items-center rounded-xl border border-tn-border bg-tn-surface p-1">
              {(
                [
                  ["day", "День"],
                  ["week", "Неделя"],
                  ["month", "Месяц"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPeriod(k)}
                  className={`min-h-9 rounded-lg px-3 text-xs ${
                    period === k ? "bg-tn-red text-white" : "text-tn-muted hover:text-tn-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="min-h-11 rounded-xl border border-tn-border bg-tn-surface px-3 text-sm"
            >
              <option value="">Все типы</option>
              {checkTypes.map((ct) => (
                <option key={ct.key} value={ct.key}>
                  {ct.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => load(filter)}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-tn-border px-3 text-xs hover:bg-tn-surface"
            >
              <RefreshCw size={14} /> Обновить
            </button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-tn-ink">Сводка</h2>
            <p className="mt-1 text-sm text-tn-muted">
              Показатели по выбранному периоду и типу договора
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-tn-ink">Проверки</h3>
            <TeamKpiGrid
              items={[
                {
                  label: "Проверок за период",
                  value: periodChecks,
                  hint: periodLabel,
                },
                {
                  label: "За сутки",
                  value: stats.checks_day,
                  hint: "скользящие 24 часа",
                },
                {
                  label: "За месяц",
                  value: stats.checks_month,
                  hint: "скользящие 30 дней",
                },
              ]}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-tn-ink">Качество</h3>
            <TeamKpiGrid
              items={[
                {
                  label: "Ошибок всего",
                  value: stats.errors_total,
                  hint: "по выбранному фильтру типа",
                },
                {
                  label: "Средн. ошибок / проверку",
                  value: avgErrors,
                  hint: "ниже — лучше качество потока",
                },
                {
                  label: "Частых паттернов",
                  value: stats.frequent_errors.length,
                  hint: "повторяющиеся error_code",
                },
              ]}
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-tn-ink">Команда</h3>
            <TeamKpiGrid
              items={[
                {
                  label: "Юристов в команде",
                  value: stats.lawyers_count,
                  hint: "активные учётные записи",
                },
                {
                  label: "Типов договоров в потоке",
                  value: Object.keys(stats.by_contract_type).length,
                  hint: "по результатам ИИ-классификации",
                },
                {
                  label: "Аномалий",
                  value: stats.rare_errors.length,
                  hint: "редкие ошибки (1×)",
                },
              ]}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-5">
            <section className="rounded-xl border border-tn-border bg-tn-panel p-4 shadow-sm lg:col-span-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Нагрузка по юристам</h3>
                <span className="text-[11px] text-tn-muted">проверки · ошибки</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-tn-muted">
                    <tr className="border-b border-tn-border">
                      <th className="py-2 pr-3 font-medium">Юрист</th>
                      <th className="py-2 pr-3 font-medium">Проверок</th>
                      <th className="py-2 pr-3 font-medium">Ошибок</th>
                      <th className="py-2 font-medium">Доля</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.lawyers.map((l) => {
                      const rate =
                        l.checks > 0 ? Math.round((l.errors / l.checks) * 10) / 10 : 0;
                      return (
                        <tr key={l.id} className="border-b border-tn-border/70">
                          <td className="py-2.5 pr-3">
                            <div className="font-medium">{l.full_name}</div>
                            <div className="text-[11px] text-tn-muted">{l.email}</div>
                          </td>
                          <td className="py-2.5 pr-3 tabular-nums">{l.checks}</td>
                          <td className="py-2.5 pr-3 tabular-nums text-tn-red">{l.errors}</td>
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-tn-surface">
                                <div
                                  className="h-full rounded-full bg-tn-red"
                                  style={{ width: `${Math.min(100, rate * 20)}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-tn-muted">{rate}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!stats.lawyers.length && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-tn-muted">
                          Нет данных по юристам
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-tn-border bg-tn-panel p-4 shadow-sm lg:col-span-2">
              <h3 className="mb-3 text-sm font-semibold">По типам договоров</h3>
              <ul className="space-y-3">
                {Object.entries(stats.by_contract_type).map(([k, v]) => (
                  <li key={k}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{typeLabel(k)}</span>
                      <span className="text-tn-muted">
                        {v.checks} пр. · {v.errors} ош.
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-tn-surface">
                      <div
                        className="h-full rounded-full bg-tn-red/80"
                        style={{ width: `${(v.errors / maxTypeErrors) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
                {!Object.keys(stats.by_contract_type).length && (
                  <li className="text-sm text-tn-muted">Запустите проверки — появятся типы</li>
                )}
              </ul>
            </section>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-tn-border bg-tn-panel p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold">Частые ошибки</h3>
              <ul className="space-y-2">
                {stats.frequent_errors.map((e) => (
                  <li
                    key={e.error_code}
                    className="rounded-xl border border-tn-border bg-tn-surface/60 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium">{e.title}</div>
                      <span className="rounded-full bg-tn-red/10 px-2 py-0.5 text-xs text-tn-red">
                        {e.count}×
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-tn-muted">{e.description}</div>
                  </li>
                ))}
                {!stats.frequent_errors.length && (
                  <li className="text-sm text-tn-muted">Повторяющихся пока нет</li>
                )}
              </ul>
            </section>

            <section className="rounded-xl border border-tn-border bg-tn-panel p-4 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle size={14} className="text-tn-red" />
                Аномалии (редкие)
              </h3>
              <ul className="space-y-2">
                {stats.rare_errors.map((e) => (
                  <li
                    key={e.error_code}
                    className="rounded-xl border border-dashed border-tn-border px-3 py-2"
                  >
                    <div className="text-sm font-medium">{e.title}</div>
                    <div className="mt-1 text-xs text-tn-muted">{e.description}</div>
                  </li>
                ))}
                {!stats.rare_errors.length && (
                  <li className="text-sm text-tn-muted">Редких пока нет</li>
                )}
              </ul>
            </section>
          </div>

          <section className="rounded-xl border border-tn-border bg-tn-panel p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Журнал найденных ошибок</h3>
            <ul className="divide-y divide-tn-border">
              {findings.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left text-sm"
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                  >
                    <span>
                      <span className="font-medium">{f.title}</span>
                      <span className="ml-2 text-xs text-tn-muted">
                        {typeLabel(f.contract_type)} · doc #{f.document_id}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full border border-tn-border px-2 py-0.5 text-[10px] uppercase">
                      {f.severity}
                    </span>
                  </button>
                  {expanded === f.id && (
                    <div className="pb-3 text-xs text-tn-muted">
                      {f.description}
                      <div className="mt-1 opacity-70">
                        {new Date(f.created_at).toLocaleString("ru")} · {f.error_code}
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {!findings.length && (
                <li className="py-6 text-center text-sm text-tn-muted">Журнал пуст</li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
