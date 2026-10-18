"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, UserCheck, UserX, X } from "lucide-react";
import { api, CheckType, User } from "@/lib/api";

type Prompt = {
  id: number;
  key: string;
  title: string;
  contract_type: string;
  content: string;
  version_number: number;
  updated_at: string;
};

type Version = {
  id: number;
  version_number: number;
  content: string;
  change_note: string;
  source: string;
  created_at: string;
};

type Tab = "users" | "skills" | "prompts" | "sandbox";
type UserFilter = "active" | "inactive";

const ROLE_LABEL: Record<string, string> = {
  lawyer: "Юрист",
  manager: "Руководитель",
  admin: "Администратор",
};

const emptyUserForm = {
  email: "",
  full_name: "",
  password: "",
  role: "lawyer",
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [userFilter, setUserFilter] = useState<UserFilter>("active");
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState(emptyUserForm);

  const [checkTypes, setCheckTypes] = useState<CheckType[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selected, setSelected] = useState<Prompt | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptSaved, setPromptSaved] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sample, setSample] = useState(
    "Договор аренды. Кадастровый номер отсутствует. Неустойка 10% в день."
  );
  const [sandboxOut, setSandboxOut] = useState("");
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<CheckType | null>(null);
  const [skillForm, setSkillForm] = useState({
    title: "",
    description: "",
    rulesText: "",
  });
  const [skillSaving, setSkillSaving] = useState(false);

  const loadUsers = () =>
    api.users.list().then(setUsers).catch((e) => setError(String(e.message || e)));

  const loadCheckTypes = () =>
    api.checkTypes
      .list(false)
      .then(setCheckTypes)
      .catch((e) => setError(String(e.message || e)));

  const loadVersions = async (promptId: number) => {
    try {
      const v = (await api.prompts.versions(promptId)) as Version[];
      setVersions(v);
    } catch {
      setVersions([]);
    }
  };

  const loadPrompts = async () => {
    const p = (await api.prompts.list()) as Prompt[];
    setPrompts(p);
    setSelected((cur) => {
      const next = cur ? p.find((x) => x.id === cur.id) || p[0] || null : p[0] || null;
      if (next) setDraft(next.content);
      return next;
    });
  };

  useEffect(() => {
    loadUsers();
    loadCheckTypes();
    loadPrompts().catch((e) => setError(String(e.message || e)));
  }, []);

  useEffect(() => {
    if (!selected) {
      setVersions([]);
      return;
    }
    setDraft(selected.content);
    void loadVersions(selected.id);
  }, [selected?.id]);

  const filteredUsers = useMemo(
    () => users.filter((u) => (userFilter === "active" ? u.is_active : !u.is_active)),
    [users, userFilter]
  );

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm(emptyUserForm);
    setShowUserModal(true);
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    setUserForm({
      email: u.email,
      full_name: u.full_name,
      password: "",
      role: u.role,
    });
    setShowUserModal(true);
  };

  const submitUser = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (editingUser) {
        await api.users.update(editingUser.id, {
          full_name: userForm.full_name,
          role: userForm.role as User["role"],
          ...(userForm.password ? { password: userForm.password } : {}),
        });
      } else {
        if (!userForm.password || userForm.password.length < 6) {
          setError("Пароль не короче 6 символов");
          return;
        }
        await api.users.create(userForm);
      }
      setShowUserModal(false);
      setUserForm(emptyUserForm);
      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения пользователя");
    }
  };

  const toggleUserActive = async (u: User) => {
    setError("");
    try {
      if (u.is_active) await api.users.remove(u.id);
      else await api.users.update(u.id, { is_active: true });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  };

  const openNewSkill = () => {
    setSelectedSkill(null);
    setSkillForm({ title: "", description: "", rulesText: "" });
  };

  const openSkill = (ct: CheckType) => {
    setSelectedSkill(ct);
    setSkillForm({
      title: ct.title,
      description: ct.description || "",
      rulesText: (ct.rules || []).join("\n"),
    });
  };

  const saveSkill = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSkillSaving(true);
    const rules = skillForm.rulesText
      .split("\n")
      .map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim())
      .filter(Boolean);
    try {
      if (selectedSkill) {
        await api.checkTypes.update(selectedSkill.id, {
          title: skillForm.title,
          description: skillForm.description,
          rules,
        });
      } else {
        await api.checkTypes.create({
          title: skillForm.title,
          description: skillForm.description || undefined,
          rules,
        });
        openNewSkill();
      }
      await loadCheckTypes();
      await loadPrompts();
      if (selectedSkill) {
        const refreshed = await api.checkTypes.list(false);
        const next = refreshed.find((x) => x.id === selectedSkill.id) || null;
        if (next) openSkill(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить скилл");
    } finally {
      setSkillSaving(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-3xl">Кабинет администратора</h1>
        <p className="mt-1 text-sm text-tn-muted">
          Пользователи, скиллы проверки, промпты и песочница
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-tn-red/30 bg-tn-red/5 px-3 py-2 text-sm text-tn-red">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {(
            [
              ["users", "Пользователи"],
              ["skills", "Скиллы проверки"],
              ["prompts", "Промпты"],
              ["sandbox", "Песочница"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-xl px-4 py-2 text-sm ${
                tab === k ? "bg-tn-red text-white" : "border border-tn-border bg-tn-panel"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "users" && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1 rounded-xl border border-tn-border bg-tn-panel p-1">
                {(
                  [
                    ["active", "Активные"],
                    ["inactive", "Деактивированные"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setUserFilter(k)}
                    className={`rounded-lg px-3 py-1.5 text-xs ${
                      userFilter === k ? "bg-tn-red text-white" : "text-tn-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={openCreateUser}
                className="inline-flex items-center gap-1.5 rounded-xl bg-tn-red px-4 py-2.5 text-sm text-white"
              >
                <Plus size={16} /> Добавить пользователя
              </button>
            </div>

            <ul className="space-y-2">
              {filteredUsers.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-tn-border bg-tn-panel px-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {u.full_name}{" "}
                      <span className="font-normal text-tn-muted">· {u.email}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tn-muted">
                      <span className="rounded-full bg-tn-red/10 px-2 py-0.5 text-tn-red">
                        {ROLE_LABEL[u.role] || u.role}
                      </span>
                      <span>{u.is_active ? "активен" : "отключён"}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-lg border border-tn-border px-3 py-1.5 text-xs hover:bg-tn-surface"
                      onClick={() => openEditUser(u)}
                    >
                      <Pencil size={13} /> Роль / данные
                    </button>
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs ${
                        u.is_active ? "text-tn-red" : "text-emerald-700"
                      }`}
                      onClick={() => void toggleUserActive(u)}
                    >
                      {u.is_active ? (
                        <>
                          <UserX size={13} /> Отключить
                        </>
                      ) : (
                        <>
                          <UserCheck size={13} /> Включить
                        </>
                      )}
                    </button>
                  </div>
                </li>
              ))}
              {!filteredUsers.length && (
                <li className="rounded-xl border border-dashed border-tn-border px-4 py-8 text-center text-sm text-tn-muted">
                  {userFilter === "active"
                    ? "Нет активных пользователей — добавьте первого"
                    : "Деактивированных нет"}
                </li>
              )}
            </ul>
          </div>
        )}

        {tab === "skills" && (
          <div className="mt-6 grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="space-y-2">
              <button
                type="button"
                onClick={openNewSkill}
                className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  !selectedSkill
                    ? "border-tn-red bg-tn-red/10 text-tn-red"
                    : "border-tn-border bg-tn-panel text-tn-ink hover:border-tn-red/40"
                }`}
              >
                + Новый скилл
              </button>
              <ul className="space-y-1.5">
                {checkTypes.map((ct) => (
                  <li key={ct.id}>
                    <button
                      type="button"
                      onClick={() => openSkill(ct)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        selectedSkill?.id === ct.id
                          ? "border-tn-red bg-tn-red/10 text-tn-red"
                          : "border-tn-border bg-tn-panel text-tn-ink hover:border-tn-red/40"
                      }`}
                    >
                      <div className="font-medium">
                        {ct.title}
                        {!ct.is_active && (
                          <span className="ml-1 text-[10px] font-normal opacity-70">(скрыт)</span>
                        )}
                      </div>
                      <div
                        className={`mt-0.5 text-[10px] ${
                          selectedSkill?.id === ct.id ? "text-tn-red/70" : "text-tn-muted"
                        }`}
                      >
                        {ct.key} · правил: {(ct.rules || []).length}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <form
              onSubmit={saveSkill}
              className="space-y-3 rounded-2xl border border-tn-border bg-tn-panel p-4"
            >
              <div className="text-sm font-medium">
                {selectedSkill ? `Скилл: ${selectedSkill.title}` : "Новый скилл проверки"}
              </div>
              <p className="text-xs leading-relaxed text-tn-muted">
                Название и чеклист правил. Система собирает из них промпт и показывает тип в меню
                «Проверить» у юриста. Клик по скиллу слева — открыть и править.
              </p>
              <input
                required
                placeholder="Название (напр. Договор поставки)"
                className="w-full rounded-lg border border-tn-border bg-tn-surface px-3 py-2 text-sm outline-none focus:border-tn-red"
                value={skillForm.title}
                onChange={(e) => setSkillForm({ ...skillForm, title: e.target.value })}
              />
              <input
                placeholder="Краткое описание для меню «Проверить»"
                className="w-full rounded-lg border border-tn-border bg-tn-surface px-3 py-2 text-sm outline-none focus:border-tn-red"
                value={skillForm.description}
                onChange={(e) => setSkillForm({ ...skillForm, description: e.target.value })}
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-tn-muted">
                  Правила скилла — по одному на строку
                </label>
                <textarea
                  required
                  placeholder={
                    "Проверить идентификацию предмета договора\n" +
                    "Проверить сроки и порядок оплаты\n" +
                    "Найти асимметрию одностороннего расторжения\n" +
                    "Оценить неустойки на соразмерность"
                  }
                  rows={10}
                  className="w-full rounded-xl border border-tn-border bg-tn-surface px-3 py-2 text-sm outline-none focus:border-tn-red"
                  value={skillForm.rulesText}
                  onChange={(e) => setSkillForm({ ...skillForm, rulesText: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={skillSaving}
                  className="rounded-xl bg-tn-red px-4 py-2.5 text-sm text-white disabled:opacity-50"
                >
                  {skillSaving
                    ? "Сохранение…"
                    : selectedSkill
                      ? "Сохранить изменения"
                      : "Создать скилл"}
                </button>
                {selectedSkill && (
                  <>
                    <button
                      type="button"
                      className="rounded-xl border border-tn-border px-4 py-2.5 text-sm"
                      onClick={async () => {
                        try {
                          await api.checkTypes.update(selectedSkill.id, {
                            is_active: !selectedSkill.is_active,
                          });
                          await loadCheckTypes();
                          const refreshed = await api.checkTypes.list(false);
                          const next = refreshed.find((x) => x.id === selectedSkill.id);
                          if (next) openSkill(next);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Ошибка");
                        }
                      }}
                    >
                      {selectedSkill.is_active ? "Скрыть из меню" : "Показать в меню"}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl px-4 py-2.5 text-sm text-tn-red"
                      onClick={async () => {
                        if (!window.confirm(`Отключить скилл «${selectedSkill.title}»?`)) return;
                        try {
                          await api.checkTypes.remove(selectedSkill.id);
                          openNewSkill();
                          await loadCheckTypes();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Ошибка");
                        }
                      }}
                    >
                      Отключить
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        )}

        {tab === "prompts" && (
          <div className="mt-6 grid gap-4 md:grid-cols-[240px_1fr]">
            <ul className="space-y-1.5">
              {prompts.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                      selected?.id === p.id
                        ? "border-tn-red bg-tn-red/10 text-tn-red shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--tn-red)_35%,transparent)]"
                        : "border-tn-border bg-tn-panel text-tn-ink hover:border-tn-red/40"
                    }`}
                  >
                    {p.title}
                    <div
                      className={`text-[10px] ${
                        selected?.id === p.id ? "text-tn-red/70" : "text-tn-muted"
                      }`}
                    >
                      v{p.version_number} · {p.contract_type}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {selected && (
              <div className="space-y-3">
                <p className="text-xs text-tn-muted">
                  Это готовый текст промпта для проверки. Править вручную можно, но обычно
                  достаточно обновить правила во вкладке «Скиллы проверки».
                </p>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={10}
                  className="w-full rounded-2xl border border-tn-border bg-tn-panel p-3 font-mono text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Комментарий к версии"
                    className="min-w-[12rem] flex-1 rounded-xl border border-tn-border px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    className="rounded-xl bg-tn-red px-4 py-2 text-sm text-white disabled:opacity-50"
                    disabled={promptSaving}
                    onClick={async () => {
                      setPromptSaving(true);
                      setError("");
                      setPromptSaved(null);
                      try {
                        await api.prompts.update(selected.id, draft, note || "update");
                        setNote("");
                        await loadPrompts();
                        await loadVersions(selected.id);
                        setPromptSaved("Версия сохранена");
                        window.setTimeout(() => setPromptSaved(null), 2500);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Ошибка сохранения");
                      } finally {
                        setPromptSaving(false);
                      }
                    }}
                  >
                    {promptSaving ? "Сохранение…" : "Сохранить версию"}
                  </button>
                </div>
                {promptSaved && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                    {promptSaved}
                  </div>
                )}
                <div className="rounded-2xl border border-tn-border bg-tn-panel p-3">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-tn-muted">
                    История версий ({versions.length})
                  </div>
                  <ul className="max-h-[min(28rem,50vh)] space-y-2 overflow-y-auto pr-1">
                    {versions.length === 0 && (
                      <li className="text-xs text-tn-muted">Пока нет сохранённых версий</li>
                    )}
                    {versions.map((v) => (
                      <li
                        key={v.id}
                        className="rounded-xl border border-tn-border bg-tn-surface p-3 text-xs"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-tn-ink">
                              v{v.version_number}
                              <span className="font-normal text-tn-muted">
                                {" "}
                                · {v.source} · {v.change_note || "без комментария"}
                              </span>
                            </div>
                            <div className="mt-1 text-tn-muted">
                              {new Date(v.created_at).toLocaleString("ru")}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              className="rounded-lg px-2.5 py-1.5 text-tn-red hover:bg-tn-red/10"
                              onClick={async () => {
                                try {
                                  await api.prompts.restore(selected.id, v.id);
                                  await loadPrompts();
                                  await loadVersions(selected.id);
                                  setPromptSaved(`Восстановлена v${v.version_number}`);
                                  window.setTimeout(() => setPromptSaved(null), 2500);
                                } catch (err) {
                                  setError(
                                    err instanceof Error ? err.message : "Ошибка восстановления"
                                  );
                                }
                              }}
                            >
                              Восстановить
                            </button>
                            <button
                              type="button"
                              className="rounded-lg px-2.5 py-1.5 text-tn-muted hover:bg-tn-red/10 hover:text-tn-red disabled:opacity-40"
                              disabled={versions.length <= 1}
                              title={
                                versions.length <= 1
                                  ? "Нельзя удалить единственную версию"
                                  : "Удалить версию"
                              }
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    `Удалить версию v${v.version_number}? Это действие нельзя отменить.`
                                  )
                                ) {
                                  return;
                                }
                                try {
                                  await api.prompts.removeVersion(selected.id, v.id);
                                  await loadPrompts();
                                  await loadVersions(selected.id);
                                  setPromptSaved(`Удалена v${v.version_number}`);
                                  window.setTimeout(() => setPromptSaved(null), 2500);
                                } catch (err) {
                                  setError(
                                    err instanceof Error ? err.message : "Ошибка удаления"
                                  );
                                }
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "sandbox" && (
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-2xl border border-tn-border bg-tn-panel p-4">
              <div className="text-sm font-medium">Песочница скилла</div>
              <p className="text-xs text-tn-muted">
                Прогон промпта на образце текста без боевого дела.
              </p>
              <select
                className="w-full rounded-xl border border-tn-border bg-tn-surface px-3 py-2 text-sm"
                value={selected?.key || ""}
                onChange={(e) => {
                  const p = prompts.find((x) => x.key === e.target.value);
                  if (p) setSelected(p);
                }}
              >
                {prompts.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.title} (v{p.version_number})
                  </option>
                ))}
              </select>
              <textarea
                value={sample}
                onChange={(e) => setSample(e.target.value)}
                rows={12}
                className="w-full rounded-2xl border border-tn-border bg-tn-surface p-3 text-sm"
              />
              <button
                type="button"
                disabled={sandboxBusy || !selected}
                className="rounded-xl bg-tn-red px-4 py-2.5 text-sm text-white disabled:opacity-40"
                onClick={async () => {
                  setSandboxBusy(true);
                  setError("");
                  try {
                    const out = (await api.prompts.sandbox({
                      prompt_key: selected?.key,
                      sample_text: sample,
                    })) as { rendered_prompt: string; note: string; char_count: number };
                    setSandboxOut(
                      `${out.note}\n\nСимволов: ${out.char_count}\n\n${out.rendered_prompt}`
                    );
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Ошибка песочницы");
                  } finally {
                    setSandboxBusy(false);
                  }
                }}
              >
                {sandboxBusy ? "Прогон…" : "Прогнать песочницу"}
              </button>
            </div>
            <pre className="min-h-[420px] overflow-auto whitespace-pre-wrap rounded-2xl border border-tn-border bg-tn-panel p-4 text-xs">
              {sandboxOut || "Результат песочницы появится здесь"}
            </pre>
          </div>
        )}
      </div>

      {showUserModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowUserModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-tn-border bg-tn-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-tn-border px-5 py-4">
              <h3 className="font-semibold">
                {editingUser ? "Изменить пользователя" : "Новый пользователь"}
              </h3>
              <button
                type="button"
                className="rounded-lg p-2 hover:bg-tn-surface"
                onClick={() => setShowUserModal(false)}
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitUser} className="space-y-3 p-5">
              <label className="block text-xs font-medium text-tn-muted">
                ФИО
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-tn-border bg-tn-surface px-3 py-2 text-sm outline-none focus:border-tn-red"
                  value={userForm.full_name}
                  onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-tn-muted">
                Логин
                <input
                  required
                  type="text"
                  disabled={Boolean(editingUser)}
                  className="mt-1 w-full rounded-lg border border-tn-border bg-tn-surface px-3 py-2 text-sm outline-none focus:border-tn-red disabled:opacity-60"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-tn-muted">
                {editingUser ? "Новый пароль (необязательно)" : "Пароль"}
                <input
                  required={!editingUser}
                  type="password"
                  minLength={6}
                  className="mt-1 w-full rounded-lg border border-tn-border bg-tn-surface px-3 py-2 text-sm outline-none focus:border-tn-red"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder={editingUser ? "Оставьте пустым, чтобы не менять" : ""}
                />
              </label>
              <label className="block text-xs font-medium text-tn-muted">
                Роль
                <select
                  className="mt-1 w-full rounded-lg border border-tn-border bg-tn-surface px-3 py-2 text-sm outline-none focus:border-tn-red"
                  value={userForm.role}
                  onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                >
                  <option value="lawyer">Юрист</option>
                  <option value="manager">Руководитель</option>
                  <option value="admin">Администратор</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-xl border border-tn-border px-4 py-2 text-sm"
                  onClick={() => setShowUserModal(false)}
                >
                  Отмена
                </button>
                <button type="submit" className="rounded-xl bg-tn-red px-4 py-2 text-sm text-white">
                  {editingUser ? "Сохранить" : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
