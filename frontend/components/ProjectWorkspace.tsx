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
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { PanelLeftClose, PanelRightOpen, Plus, X } from "lucide-react";
import {
  api,
  Chat,
  Document,
  Message,
  Project,
  streamChat,
} from "@/lib/api";
import { chatTitleFromDraft } from "@/lib/chatTitle";
import { ChatInput, ChatSendPayload } from "./ChatInput";
import { CopyMessageButton } from "./CopyMessageButton";
import { DocumentEditor } from "./DocumentEditor";
import { useNav } from "@/lib/nav";
import "./workspace.css";

type FindingComment = {
  id: number;
  title: string;
  description: string;
  clause_anchor: string;
  clause_quote?: string;
};

type Props = { projectId: number };

function parseFindingsFromMeta(metaJson: string): FindingComment[] {
  try {
    const meta = JSON.parse(metaJson || "{}");
    const findings = meta?.check?.findings;
    if (Array.isArray(findings)) return findings;
  } catch {
    /* ignore */
  }
  return [];
}

export function ProjectWorkspace({ projectId }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [chatId, setChatId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>(["gemini-2.5-flash"]);
  const [modelId, setModelId] = useState("gemini-2.5-flash");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);
  const [comments, setComments] = useState<FindingComment[]>([]);
  const [showDoc, setShowDoc] = useState(false);
  const [docWidthPct, setDocWidthPct] = useState(44);
  const [activeFindingId, setActiveFindingId] = useState<number | null>(null);
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const { panelsOpen, setPanelsOpen, toggle: togglePanels } = useNav();
  const railOpen = panelsOpen;

  const loadBase = useCallback(async () => {
    const [p, c, docs, mods] = await Promise.all([
      api.projects.get(projectId),
      api.projects.chats(projectId),
      api.documents.list(projectId),
      api.models(),
    ]);
    setProject(p);
    setChats(c);
    setDocuments(docs);
    setModels(mods.models.length ? mods.models : ["gemini-2.5-flash"]);
    setChatId((prev) => prev ?? c[0]?.id ?? null);
    if (docs[0]) {
      setActiveDoc((prev) => prev ?? docs[0]);
      setShowDoc(true);
    }
  }, [projectId]);

  useEffect(() => {
    setChatId(null);
    setActiveDoc(null);
    setMessages([]);
    setComments([]);
    setShowDoc(false);
    loadBase().catch((e) => setError(String(e.message || e)));
  }, [projectId, loadBase]);

  useEffect(() => {
    if (!chatId) return;
    stickToBottomRef.current = true;
    api.projects
      .messages(projectId, chatId)
      .then((msgs) => {
        setMessages(msgs);
        for (let i = msgs.length - 1; i >= 0; i--) {
          const found = parseFindingsFromMeta(msgs[i].meta_json);
          if (found.length) {
            setComments(found);
            break;
          }
        }
      })
      .catch((e) => setError(String(e.message || e)));
  }, [projectId, chatId]);

  useLayoutEffect(() => {
    const el = threadRef.current;
    if (!el || !chatId) return;
    if (!stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [chatId, messages, streaming]);

  const openDocument = async (doc: Document) => {
    try {
      const fresh = await api.documents.get(doc.id);
      setActiveDoc(fresh);
      setShowDoc(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть документ");
    }
  };

  const createChat = async () => {
    try {
      const chat = await api.projects.createChat(projectId, "Новый чат", modelId);
      setChats((prev) => [chat, ...prev]);
      setChatId(chat.id);
      setMessages([]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать чат");
    }
  };

  const onSend = async (payload: ChatSendPayload) => {
    setBusy(true);
    setStreaming("");
    setError(null);

    try {
      let cid = chatId;
      if (!cid) {
        const chat = await api.projects.createChat(
          projectId,
          chatTitleFromDraft(payload.message),
          modelId
        );
        setChats((prev) => [chat, ...prev]);
        setChatId(chat.id);
        setMessages([]);
        cid = chat.id;
      }

      let docId = activeDoc?.id;
      if (payload.file) {
        const doc = await api.documents.upload(projectId, payload.file);
        setDocuments((d) => [doc, ...d]);
        setActiveDoc(doc);
        setComments([]);
        docId = doc.id;
      }

      if ((payload.intent === "check" || payload.intent === "anonymize") && !docId) {
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

      if (payload.intent === "check" || payload.intent === "anonymize") {
        setShowDoc(true);
      }

      let acc = "";
      await streamChat(
        projectId,
        cid,
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
                findings: FindingComment[];
                html_content: string;
                document_id: number;
                revision: number;
              };
              setComments(check.findings || []);
              setShowDoc(true);
              const doc = await api.documents.get(check.document_id);
              setActiveDoc({
                ...doc,
                html_content: check.html_content || doc.html_content,
                revision: check.revision || doc.revision,
              });
            }
            if (data.action === "anonymize" && data.document) {
              const d = data.document as Partial<Document> & { document_id?: number; id?: number };
              const id = d.document_id || d.id || docId;
              if (id) {
                const doc = await api.documents.get(id);
                setActiveDoc(doc);
                setShowDoc(true);
              }
            }
            if (data.action === "create_document" && data.document) {
              const d = data.document as Partial<Document> & { document_id?: number; id?: number };
              const id = d.document_id || d.id;
              if (id) {
                const doc = await api.documents.get(id);
                setActiveDoc(doc);
                setShowDoc(true);
                setComments([]);
              }
            }
            api.projects.chats(projectId).then(setChats).catch(() => undefined);
          },
          onError: (msg) => {
            setStreaming("");
            setError(msg);
          },
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Сбой запроса");
    } finally {
      setBusy(false);
    }
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
    const next = Math.min(62, Math.max(28, dragRef.current.startPct + (delta / width) * 100));
    setDocWidthPct(next);
  };

  const onSplitterPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    e.currentTarget.classList.remove("is-dragging");
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
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
        <div className="border-b border-tn-border px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-display text-base">{project?.title || "…"}</div>
              <div className="mt-0.5 text-[11px] text-tn-muted">
                Контекст проекта общий для всех чатов
              </div>
            </div>
            <button
              type="button"
              className="tn-panels-btn"
              title="Скрыть сайдбар и панель проекта"
              onClick={() => setPanelsOpen(false)}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
          <Link
            href="/app"
            className="mt-2 block text-xs text-tn-red hover:underline"
          >
            ← К списку / создать проект
          </Link>
          <button
            type="button"
            onClick={createChat}
            className="mt-2 flex w-full items-center justify-center gap-1 rounded-xl border border-tn-border px-2 py-1.5 text-xs hover:bg-tn-surface"
          >
            <Plus size={14} /> Новый чат
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-2">
          <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-tn-muted">
            Чаты
          </div>
          {chats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChatId(c.id)}
              className={`mb-1 w-full rounded-xl px-2 py-2 text-left text-xs ${
                c.id === chatId ? "bg-tn-red/10 text-tn-red" : "hover:bg-tn-surface"
              }`}
            >
              <div className="truncate font-medium">{c.title || "Чат"}</div>
            </button>
          ))}
          <div className="mb-1 mt-4 px-2 text-[10px] font-semibold uppercase tracking-wide text-tn-muted">
            Документы
          </div>
          {documents.length === 0 && (
            <div className="px-2 text-xs text-tn-muted">Пока пусто — загрузите договор</div>
          )}
          {documents.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => openDocument(d)}
              className={`mb-1 w-full truncate rounded-xl px-2 py-1.5 text-left text-xs ${
                activeDoc?.id === d.id && showDoc
                  ? "bg-tn-red/10 text-tn-red"
                  : "hover:bg-tn-surface"
              }`}
            >
              {d.filename}
            </button>
          ))}
        </div>
      </aside>

      <section className="tn-stage">
        {!railOpen && (
          <button
            type="button"
            className="tn-panels-btn tn-panels-btn--float"
            title="Раскрыть меню и чаты"
            onClick={togglePanels}
          >
            <PanelRightOpen size={16} />
          </button>
        )}
        <div className="flex items-center justify-between gap-2 border-b border-tn-border px-4 py-2">
          <div className={`text-sm text-tn-muted ${!railOpen ? "pl-10" : ""}`}>
            {busy ? "ИИ работает…" : "Кабинет юриста · проверка договоров"}
          </div>
          {activeDoc && !showDoc && (
            <button
              type="button"
              onClick={() => setShowDoc(true)}
              className="rounded-lg border border-tn-border px-2 py-1 text-xs hover:bg-tn-panel"
            >
              Показать договор
            </button>
          )}
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
          {messages.length === 0 && !streaming && (
            <div className="mx-auto max-w-lg pt-10 text-center text-sm text-tn-muted">
              Загрузите договор → «Проверить» → правки и подсветка справа. Чаты живут внутри
              проекта; контекст общий.
            </div>
          )}
          {messages.map((m) => {
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
          disabled={busy}
          hasDocument={Boolean(activeDoc)}
          onSend={onSend}
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
            aria-label="Изменить ширину панели договора"
          />
          <aside className="tn-doc-panel">
            <div className="flex items-center justify-between border-b border-tn-border px-3 py-2">
              <div className="text-sm font-medium">Договор</div>
              <button
                type="button"
                onClick={() => setShowDoc(false)}
                className="rounded-lg p-1 text-tn-muted hover:bg-tn-surface"
                aria-label="Закрыть панель"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <DocumentEditor
                document={activeDoc}
                comments={comments}
                activeFindingId={activeFindingId}
                onSelectFinding={setActiveFindingId}
                onSaved={(d) => {
                  setActiveDoc(d);
                  setDocuments((list) => list.map((x) => (x.id === d.id ? d : x)));
                }}
              />
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
