"use client";

import {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import {
  Folder,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Plus,
  X,
} from "lucide-react";
import {
  api,
  Chat,
  Document,
  Message,
  Project,
  streamChat,
} from "@/lib/api";
import { ChatInput, ChatSendPayload } from "./ChatInput";
import { CopyMessageButton } from "./CopyMessageButton";
import { DocPlate } from "./DocPlate";
import { DocumentEditor } from "./DocumentEditor";
import "./workspace.css";

type Finding = {
  id: number;
  title: string;
  description: string;
  clause_anchor: string;
  clause_quote?: string;
  severity?: string;
  status?: string;
};

type ProjectNode = Project & { chats: Chat[]; documents: Document[] };

function parseMeta(metaJson: string): Record<string, unknown> {
  try {
    return JSON.parse(metaJson || "{}");
  } catch {
    return {};
  }
}

export function ChatWorkspace() {
  const [tree, setTree] = useState<ProjectNode[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [chatId, setChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>(["deepseek-chat"]);
  const [modelId, setModelId] = useState("deepseek-chat");
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [showDoc, setShowDoc] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeFindingId, setActiveFindingId] = useState<number | null>(null);
  const [railOpen, setRailOpen] = useState(true);
  const [docWidthPct, setDocWidthPct] = useState(46);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [menuChatId, setMenuChatId] = useState<number | null>(null);
  const [renameChatId, setRenameChatId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    projectId: number;
    chatId: number;
    title: string;
  } | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const project = tree.find((p) => p.id === projectId) || null;
  const isProjectFolder = Boolean(project && project.kind !== "solo");
  const soloNodes = tree.filter((p) => p.kind === "solo");
  const folderNodes = tree.filter((p) => p.kind !== "solo");
  const documents = project?.documents || [];
  const activeChat =
    tree.flatMap((p) => p.chats.map((c) => ({ ...c, projectId: p.id }))).find((c) => c.id === chatId) ||
    null;

  const reloadTree = useCallback(async () => {
    const [projects, mods] = await Promise.all([api.projects.list(), api.models()]);
    setModels(mods.models.length ? mods.models : ["deepseek-chat"]);
    if (!modelId || !mods.models.includes(modelId)) {
      setModelId(mods.models[0] || "deepseek-chat");
    }
    const nodes: ProjectNode[] = [];
    for (const p of projects) {
      const [chats, docs] = await Promise.all([
        api.projects.chats(p.id),
        api.documents.list(p.id),
      ]);
      nodes.push({ ...p, chats, documents: docs });
    }
    setTree(nodes);
    return nodes;
  }, [modelId]);

  useEffect(() => {
    reloadTree().catch((e) => setError(String(e.message || e)));
  }, []);

  const clearSelection = () => {
    setProjectId(null);
    setChatId(null);
    setMessages([]);
    setFindings([]);
    setShowDoc(false);
    setActiveDoc(null);
    setMenuChatId(null);
    setError(null);
  };

  useEffect(() => {
    const openRail = () => setRailOpen(true);
    window.addEventListener("tn-open-rail", openRail);
    return () => window.removeEventListener("tn-open-rail", openRail);
  }, []);

  useEffect(() => {
    if (!projectId || !chatId) {
      setMessages([]);
      return;
    }
    stickToBottomRef.current = true;
    api.projects
      .messages(projectId, chatId)
      .then((msgs) => {
        setMessages(msgs);
        for (let i = msgs.length - 1; i >= 0; i--) {
          const meta = parseMeta(msgs[i].meta_json);
          const check = meta.check as { findings?: Finding[]; document_id?: number } | undefined;
          if (check?.findings?.length) {
            setFindings(check.findings);
            break;
          }
        }
      })
      .catch((e) => setError(String(e.message || e)));
  }, [projectId, chatId]);

  // Открытие чата / новые сообщения — сразу внизу, без smooth (иначе «открывается в середине»)
  useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el || !chatId) return;
    if (!stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [chatId, messages, streaming]);

  useEffect(() => {
    if (renameChatId != null) {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [renameChatId]);

  useEffect(() => {
    if (menuChatId == null) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuChatId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuChatId(null);
    };
    // После открытия — иначе тот же клик по «⋯» сразу закрывает меню.
    const timer = window.setTimeout(() => {
      document.addEventListener("pointerdown", onPointerDown, true);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuChatId]);

  const selectChat = (pid: number, cid: number) => {
    setProjectId(pid);
    setChatId(cid);
    setMenuChatId(null);
    setFindings([]);
    setShowDoc(false);
    setActiveDoc(null);
  };

  const createProject = async () => {
    const title = newProjectTitle.trim() || `Проект ${tree.length + 1}`;
    const p = await api.projects.create(title);
    setShowNewProject(false);
    setNewProjectTitle("");
    const nodes = await reloadTree();
    const node = nodes.find((n) => n.id === p.id);
    setProjectId(p.id);
    setChatId(node?.chats[0]?.id ?? null);
    setFindings([]);
    setShowDoc(false);
  };

  const createChatInProject = async (pid: number) => {
    setError(null);
    try {
      const chat = await api.projects.createChat(pid, "Новый чат", modelId);
      await reloadTree();
      setProjectId(pid);
      setChatId(chat.id);
      setMessages([]);
      setFindings([]);
      setShowDoc(false);
      setActiveDoc(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать чат");
    }
  };

  const createSoloChat = async () => {
    setError(null);
    try {
      const { project: p, chat } = await api.projects.createSoloChat("Новый чат", modelId);
      await reloadTree();
      setProjectId(p.id);
      setChatId(chat.id);
      setMessages([]);
      setFindings([]);
      setShowDoc(false);
      setActiveDoc(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать чат");
    }
  };

  const createChat = async () => {
    // Выбран обычный проект → чат в папке; иначе → отдельный чат «как заголовок»
    if (isProjectFolder && projectId) {
      await createChatInProject(projectId);
      return;
    }
    await createSoloChat();
  };

  const commitRename = async () => {
    if (renameChatId == null) {
      setRenameChatId(null);
      return;
    }
    const owner = tree.find((p) => p.chats.some((c) => c.id === renameChatId))?.id;
    if (!owner) {
      setRenameChatId(null);
      return;
    }
    const title = renameValue.trim() || "Новый чат";
    try {
      await api.projects.renameChat(owner, renameChatId, title);
      await reloadTree();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось переименовать");
    } finally {
      setRenameChatId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { projectId: pid, chatId: cid } = deleteTarget;
    const solo = tree.find((p) => p.id === pid)?.kind === "solo";
    setDeleteTarget(null);
    try {
      if (solo) await api.projects.remove(pid);
      else await api.projects.deleteChat(pid, cid);
      const nodes = await reloadTree();
      if (chatId === cid || (solo && projectId === pid)) {
        const node = nodes.find((n) => n.id === pid);
        const next = node?.chats[0]?.id ?? null;
        setChatId(next);
        setMessages([]);
        setFindings([]);
        if (!next) setProjectId(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить чат");
    }
  };

  const openDocFromChat = async (documentId: number) => {
    try {
      const doc = await api.documents.get(documentId);
      setActiveDoc(doc);
      setShowDoc(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не открыть документ");
    }
  };

  const runSend = async (payload: ChatSendPayload) => {
    if (!projectId || !chatId) {
      setError("Выберите проект и чат");
      return;
    }

    setBusy(true);
    setStreaming("");
    setError(null);

    let docId = activeDoc?.id || documents[0]?.id;
    try {
      if (payload.file) {
        const doc = await api.documents.upload(projectId, payload.file);
        setActiveDoc(doc);
        setFindings([]);
        docId = doc.id;
        await reloadTree();
      }

      if (
        (payload.intent === "check" || payload.intent === "anonymize") &&
        !docId
      ) {
        setError("Прикрепите договор к запросу");
        setBusy(false);
        return;
      }

      const userLine =
        payload.file && payload.message
          ? `${payload.message}\n📎 ${payload.file.name}`
          : payload.message || (payload.file ? `📎 ${payload.file.name}` : "");

      setMessages((m) => [
        ...m,
        {
          id: Date.now(),
          role: "user",
          content: userLine,
          meta_json: JSON.stringify({
            intent: payload.intent,
            document_id: docId,
            filename: payload.file?.name,
          }),
          created_at: new Date().toISOString(),
        },
      ]);

      let acc = "";
      await streamChat(
        projectId,
        chatId,
        {
          message: payload.message,
          intent: payload.intent,
          contract_type: payload.contract_type,
          document_id: docId,
          model_id: modelId,
        },
        {
          onToken: (t) => {
            acc += t;
            setStreaming(acc);
          },
          onDone: async (data) => {
            setStreaming("");
            setMessages((m) => [
              ...m,
              {
                id: Date.now() + 1,
                role: "assistant",
                content: String(data.content || acc),
                meta_json: JSON.stringify(data),
                created_at: new Date().toISOString(),
              },
            ]);
            if (data.action === "check" && data.check) {
              const check = data.check as {
                findings: Finding[];
                html_content: string;
                document_id: number;
                revision: number;
                document_filename?: string;
              };
              setFindings(
                (check.findings || []).map((f) => ({ ...f, status: f.status || "open" }))
              );
              const doc = await api.documents.get(check.document_id);
              setActiveDoc({
                ...doc,
                html_content: check.html_content || doc.html_content,
                revision: check.revision || doc.revision,
              });
              setShowDoc(true);
              await reloadTree();
            }
            if (
              (data.action === "anonymize" || data.action === "create_document") &&
              data.document
            ) {
              const d = data.document as Partial<Document> & { document_id?: number; id?: number };
              const id = d.document_id || d.id || activeDoc?.id;
              if (id) {
                const doc = await api.documents.get(id);
                setActiveDoc(doc);
                setShowDoc(true);
                if (data.action === "create_document") setFindings([]);
              }
            }
            await reloadTree();
          },
          onError: (msg) => {
            setStreaming("");
            setError(msg);
          },
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Сбой");
    } finally {
      setBusy(false);
    }
  };

  const toggleFinding = async (f: Finding) => {
    const next = f.status === "fixed" ? "open" : "fixed";
    await api.findings.setStatus(f.id, next);
    setFindings((list) =>
      list.map((x) => (x.id === f.id ? { ...x, status: next } : x))
    );
  };

  const onSplitterPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startPct: docWidthPct };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add("is-dragging");
  };
  const onSplitterPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const width = shellRef.current?.clientWidth || window.innerWidth;
    const delta = dragRef.current.startX - e.clientX;
    setDocWidthPct(
      Math.min(62, Math.max(28, dragRef.current.startPct + (delta / width) * 100))
    );
  };
  const onSplitterPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.classList.remove("is-dragging");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
  };

  const shellClass = [
    "tn-shell",
    railOpen ? "" : "is-rail-collapsed",
    showDoc ? "has-doc" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={shellRef}
      className={shellClass}
      style={
        showDoc
          ? ({ ["--tn-doc-pct" as string]: `${docWidthPct}%` } as CSSProperties)
          : undefined
      }
    >
      <aside className="tn-rail">
        <div className="tn-rail-head">
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-left text-[11px] font-semibold tracking-wide text-tn-muted hover:text-tn-ink"
              title="Сбросить выбор чата и проекта"
              onClick={clearSelection}
            >
              Проекты и чаты
            </button>
            <button
              type="button"
              className="tn-panels-btn"
              title="Скрыть список чатов"
              onClick={() => setRailOpen(false)}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowNewProject((v) => !v)}
            className="mb-1.5 w-full rounded-[10px] bg-tn-red px-3 py-2.5 text-[13.5px] font-medium text-white"
          >
            Создать проект
          </button>
          <button
            type="button"
            onClick={() => void createChat()}
            title={
              isProjectFolder ? `Новый чат в «${project?.title}»` : "Создать новый чат"
            }
            className="flex h-10 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-[13.5px] font-medium hover:bg-tn-surface"
          >
            <Plus size={16} className="shrink-0 opacity-80" />
            Создать новый чат
          </button>
          {showNewProject && (
            <div className="mt-2 space-y-1">
              <input
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="Название проекта"
                className="w-full rounded-[10px] border border-tn-border bg-tn-surface px-3 py-2 text-[13px]"
                onKeyDown={(e) => e.key === "Enter" && createProject()}
              />
              <button
                type="button"
                onClick={createProject}
                className="w-full rounded-[10px] bg-tn-red/90 py-2 text-[13px] text-white"
              >
                Создать
              </button>
            </div>
          )}
        </div>

        <div className="tn-rail-body">
          {soloNodes.map((p) => {
            const c = p.chats[0];
            if (!c) return null;
            const open = menuChatId === c.id;
            const active = chatId === c.id && projectId === p.id;
            const renaming = renameChatId === c.id;
            return (
              <div key={p.id} className="tn-project-block">
                <div
                  className={`tn-project-row${active ? " is-active" : ""}${open ? " is-menu-open" : ""}`}
                  ref={open ? menuRef : undefined}
                >
                  {renaming ? (
                    <input
                      ref={renameRef}
                      className="tn-chat-rename"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void commitRename()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void commitRename();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setRenameChatId(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="tn-project-btn"
                      onClick={() => {
                        setError(null);
                        selectChat(p.id, c.id);
                      }}
                    >
                      <MessageSquare size={15} className="shrink-0 text-tn-muted" />
                      <span>{c.title || p.title || "Новый чат"}</span>
                    </button>
                  )}
                  {!renaming && (
                    <button
                      type="button"
                      className="tn-chat-more"
                      aria-label="Действия с чатом"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setError(null);
                        setProjectId(p.id);
                        setChatId(c.id);
                        setMenuChatId((cur) => (cur === c.id ? null : c.id));
                      }}
                    >
                      ···
                    </button>
                  )}
                  {open && (
                    <div className="tn-chat-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuChatId(null);
                          setProjectId(p.id);
                          setChatId(c.id);
                          setRenameChatId(c.id);
                          setRenameValue(c.title || "Новый чат");
                        }}
                      >
                        Переименовать
                      </button>
                      <div className="tn-chat-menu-sep" />
                      <button
                        type="button"
                        role="menuitem"
                        className="is-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuChatId(null);
                          setDeleteTarget({
                            projectId: p.id,
                            chatId: c.id,
                            title: c.title || "Новый чат",
                          });
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {folderNodes.map((p) => (
            <div key={p.id} className="tn-project-block">
              <div
                className={`tn-project-row ${projectId === p.id ? "is-active" : ""}`}
              >
                <button
                  type="button"
                  className="tn-project-btn"
                  onClick={() => {
                    setProjectId(p.id);
                    if (p.chats[0]) setChatId(p.chats[0].id);
                  }}
                >
                  <Folder size={15} className="shrink-0 text-tn-muted" />
                  <span>{p.title}</span>
                </button>
                <button
                  type="button"
                  className="tn-project-add"
                  title={`Новый чат в «${p.title}»`}
                  onClick={() => void createChatInProject(p.id)}
                >
                  <Plus size={14} />
                </button>
              </div>

              <ul className="tn-chat-list">
                {p.chats.length === 0 && (
                  <li className="px-2.5 py-2 text-[12px] text-tn-muted">Нет чатов</li>
                )}
                {p.chats.map((c) => {
                  const open = menuChatId === c.id;
                  const active = chatId === c.id;
                  const renaming = renameChatId === c.id;
                  return (
                    <li key={c.id}>
                      <div
                        className={`tn-chat-row${active ? " is-active" : ""}${open ? " is-menu-open" : ""}`}
                        ref={open ? menuRef : undefined}
                      >
                        {renaming ? (
                          <input
                            ref={renameRef}
                            className="tn-chat-rename"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => void commitRename()}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void commitRename();
                              }
                              if (e.key === "Escape") {
                                e.preventDefault();
                                setRenameChatId(null);
                              }
                            }}
                          />
                        ) : (
                          <button
                            type="button"
                            className="tn-chat-btn"
                            onClick={() => selectChat(p.id, c.id)}
                          >
                            <span className="tn-chat-title">{c.title || "Новый чат"}</span>
                          </button>
                        )}
                        {!renaming && (
                          <button
                            type="button"
                            className="tn-chat-more"
                            aria-label="Действия с чатом"
                            aria-expanded={open}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setError(null);
                              setProjectId(p.id);
                              setChatId(c.id);
                              setMenuChatId((cur) => (cur === c.id ? null : c.id));
                            }}
                          >
                            ···
                          </button>
                        )}
                        {open && (
                          <div className="tn-chat-menu" role="menu">
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuChatId(null);
                                setProjectId(p.id);
                                setChatId(c.id);
                                setRenameChatId(c.id);
                                setRenameValue(c.title || "Новый чат");
                              }}
                            >
                              Переименовать
                            </button>
                            <div className="tn-chat-menu-sep" />
                            <button
                              type="button"
                              role="menuitem"
                              className="is-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuChatId(null);
                                setDeleteTarget({
                                  projectId: p.id,
                                  chatId: c.id,
                                  title: c.title || "Новый чат",
                                });
                              }}
                            >
                              Удалить
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!tree.length && (
            <div className="px-2 py-8 text-center text-[13px] text-tn-muted">
              Создайте чат или проект
            </div>
          )}
        </div>
      </aside>

      <section className="tn-stage">
        {!railOpen && (
          <button
            type="button"
            className="tn-panels-btn tn-panels-btn--float"
            title="Показать проекты и чаты"
            onClick={() => setRailOpen(true)}
          >
            <PanelLeft size={16} />
          </button>
        )}
        <div className={`border-b border-tn-border px-4 py-2.5 text-sm ${!railOpen ? "pl-14" : ""}`}>
          <div className="font-medium">
            {project?.title || "Технониколь-ИИ"}
            {activeChat ? (
              <span className="font-normal text-tn-muted"> · {activeChat.title || "Чат"}</span>
            ) : null}
          </div>
          <div className="text-[12px] text-tn-muted">
            {busy
              ? "ИИ работает…"
              : isProjectFolder
                ? "Чат внутри проекта · общий контекст для чатов проекта"
                : project?.kind === "solo"
                  ? "Отдельный чат · вне проектов"
                  : "Выберите чат или создайте новый"}
          </div>
        </div>

        {error && (
          <div className="mx-4 mt-3 rounded-xl border border-tn-red/30 bg-tn-red/5 px-3 py-2 text-xs text-tn-red">
            {error}
          </div>
        )}

        <div
          ref={threadRef}
          className="tn-thread"
          onScroll={() => {
            const el = threadRef.current;
            if (!el) return;
            const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
            stickToBottomRef.current = dist < 80;
          }}
        >
          {!chatId && (
            <div className="mx-auto max-w-lg pt-12 text-center text-sm text-tn-muted">
              Слева нажмите на чат (например «Новый чат»), чтобы открыть его. Затем загрузите
              договор (.docx) и нажмите «Проверить».
            </div>
          )}
          {messages.map((m) => {
            const meta = parseMeta(m.meta_json);
            const check = meta.check as
              | { document_id?: number; document_filename?: string }
              | undefined;
            const docMeta = meta.document as
              | { document_id?: number; id?: number; filename?: string }
              | undefined;
            const docId = check?.document_id || docMeta?.document_id || docMeta?.id;
            const docName =
              check?.document_filename ||
              docMeta?.filename ||
              activeDoc?.filename ||
              documents.find((d) => d.id === docId)?.filename ||
              "Документ.docx";
            const isUser = m.role === "user";

            return (
              <div
                key={`${m.id}-${m.created_at}`}
                className={`tn-msg ${isUser ? "is-user" : "is-assistant"}`}
              >
                <div className="tn-msg-stack">
                  {isUser ? (
                    <div className="tn-msg-user">{m.content}</div>
                  ) : (
                    <div className="tn-msg-assistant">
                      <div className="tn-md">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                      {docId ? (
                        <DocPlate
                          documentId={docId}
                          filename={docName}
                          onOpen={() => void openDocFromChat(docId)}
                        />
                      ) : null}
                    </div>
                  )}
                  <CopyMessageButton text={m.content} />
                </div>
              </div>
            );
          })}
          {streaming && (
            <div className="tn-msg is-assistant">
              <div className="tn-msg-stack">
                <div className="tn-msg-assistant tn-streaming">
                  <div className="tn-md">
                    <ReactMarkdown>{streaming}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <ChatInput
          models={models}
          modelId={modelId}
          onModelChange={setModelId}
          disabled={busy || !chatId}
          hasDocument={Boolean(activeDoc || documents[0])}
          onSend={runSend}
          onError={setError}
        />
      </section>

      {showDoc && (
        <>
          <div
            className="tn-splitter"
            onPointerDown={onSplitterPointerDown}
            onPointerMove={onSplitterPointerMove}
            onPointerUp={onSplitterPointerUp}
            onPointerCancel={onSplitterPointerUp}
            role="separator"
            aria-orientation="vertical"
          />
          <aside className="tn-doc-panel">
            <div className="flex items-center justify-between border-b border-tn-border px-3 py-2">
              <div className="text-sm font-medium">Договор</div>
              <button
                type="button"
                onClick={() => setShowDoc(false)}
                className="rounded-lg p-1 text-tn-muted hover:bg-tn-surface"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <DocumentEditor
                document={activeDoc}
                comments={findings}
                activeFindingId={activeFindingId}
                onSelectFinding={setActiveFindingId}
                recheckBusy={busy}
                onRecheck={() =>
                  runSend({
                    message: `Проверить договор: ${activeDoc?.contract_type || "real_estate"}`,
                    intent: "check",
                    contract_type: activeDoc?.contract_type || "real_estate",
                  })
                }
                onToggleFinding={toggleFinding}
                onSaved={(d) => setActiveDoc(d)}
              />
            </div>
          </aside>
        </>
      )}

      {deleteTarget && (
        <div className="tn-confirm-overlay" role="presentation" onClick={() => setDeleteTarget(null)}>
          <div
            className="tn-confirm-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Удалить чат?</h3>
            <p>
              Чат «{deleteTarget.title}» будет удалён без восстановления. Сообщения внутри чата
              тоже пропадут.
            </p>
            <div className="tn-confirm-actions">
              <button type="button" onClick={() => setDeleteTarget(null)}>
                Отмена
              </button>
              <button type="button" className="is-danger" onClick={() => void confirmDelete()}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
