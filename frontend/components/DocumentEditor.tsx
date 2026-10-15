"use client";

import {
  CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Download, History, RefreshCw, Save, X } from "lucide-react";
import { api, Document } from "@/lib/api";
import { ClauseTargetMark } from "./clauseTargetMark";

type Finding = {
  id: number;
  title: string;
  description: string;
  clause_anchor: string;
  clause_quote?: string;
  status?: string;
};

type Props = {
  document: Document | null;
  onSaved?: (doc: Document) => void;
  comments?: Finding[];
  activeFindingId?: number | null;
  onSelectFinding?: (id: number | null) => void;
  onRecheck?: () => void;
  recheckBusy?: boolean;
  onToggleFinding?: (f: Finding) => void;
};

function normalizeText(s: string) {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function asBlock(el: HTMLElement): HTMLElement {
  return (el.closest("p, h1, h2, h3, h4, li") as HTMLElement | null) || el;
}

function clauseNumber(finding: Finding): string {
  const fromAnchor = (finding.clause_anchor || "").match(/\d+(?:[.,]\d+)+/)?.[0];
  const fromTitle = finding.title.match(/\d+(?:[.,]\d+)+/)?.[0];
  return (fromAnchor || fromTitle || "").replace(",", ".").toLowerCase();
}

function findBlockByQuoteOrNumber(
  root: HTMLElement,
  finding: Finding
): HTMLElement | null {
  const blocks = Array.from(
    root.querySelectorAll("p, h1, h2, h3, h4, li")
  ) as HTMLElement[];
  const quote = normalizeText(finding.clause_quote || "");
  const num = clauseNumber(finding);

  if (quote.length >= 4) {
    const probes = [
      quote.slice(0, Math.min(48, quote.length)),
      quote.slice(0, Math.min(20, quote.length)),
    ].filter((p) => p.length >= 4);
    for (const probe of probes) {
      for (const el of blocks) {
        if (normalizeText(el.textContent || "").includes(probe)) return el;
      }
    }
  }

  if (num) {
    const re = new RegExp(
      `(?:^|\\s)${num.replace(/\./g, "[.,]")}(?=[.\\s)]|$)`,
      "i"
    );
    for (const el of blocks) {
      if (re.test((el.textContent || "").trim().slice(0, 80))) return el;
    }
  }

  return null;
}

/** Надёжный поиск абзаца: метка → pN → цитата/номер. */
export function resolveFindingTarget(
  root: HTMLElement,
  findingId: number,
  finding?: Finding | null
): HTMLElement | null {
  const marked = root.querySelector(
    `[data-finding-id="${findingId}"]`
  ) as HTMLElement | null;
  if (marked) {
    const empty =
      !(marked.textContent || "").trim() ||
      marked.classList.contains("tn-clause-pin");
    return asBlock(empty ? marked.parentElement || marked : marked);
  }

  const byHtmlId = window.document.getElementById(
    `finding-${findingId}`
  ) as HTMLElement | null;
  if (byHtmlId && root.contains(byHtmlId)) return asBlock(byHtmlId);

  if (!finding) return null;

  const pMatch = /^p(\d+)$/i.exec((finding.clause_anchor || "").trim());
  if (pMatch) {
    const paras = root.querySelectorAll("p, h1, h2, h3, h4");
    const el = paras[Number(pMatch[1])] as HTMLElement | undefined;
    if (el) return el;
  }

  return findBlockByQuoteOrNumber(root, finding);
}

function scrollSettleMs(el: HTMLElement, scrollParent: HTMLElement): number {
  const er = el.getBoundingClientRect();
  const pr = scrollParent.getBoundingClientRect();
  if (er.top >= pr.top + 40 && er.bottom <= pr.bottom - 40) return 50;
  const dist = Math.abs(er.top + er.height / 2 - (pr.top + pr.height / 2));
  return Math.min(1100, Math.max(380, Math.round(dist * 0.6)));
}

export function DocumentEditor({
  document,
  onSaved,
  comments = [],
  activeFindingId = null,
  onSelectFinding,
  onRecheck,
  recheckBusy,
  onToggleFinding,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadMenu, setDownloadMenu] = useState(false);
  const [versions, setVersions] = useState<
    { id: number; revision: number; note: string; created_at: string; html_content?: string }[]
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingRevision, setViewingRevision] = useState<number | null>(null);
  const [flashStyle, setFlashStyle] = useState<CSSProperties | null>(null);
  const [flashFading, setFlashFading] = useState(false);

  const historyBtnRef = useRef<HTMLButtonElement>(null);
  const downloadBtnRef = useRef<HTMLButtonElement>(null);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const docScrollRef = useRef<HTMLDivElement>(null);
  const flashGenRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const endTimerRef = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, ClauseTargetMark],
    content: "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none px-6 py-4 text-tn-ink focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor || !document || viewingRevision !== null) return;
    editor.commands.setContent(document.html_content || "<p></p>", false);
    editor.setEditable(true);
  }, [editor, document?.id, document?.revision, document?.html_content, viewingRevision]);

  useEffect(() => {
    if (!document) return;
    api.documents
      .versions(document.id)
      .then((v) => setVersions(v as typeof versions))
      .catch(() => setVersions([]));
  }, [document?.id, document?.revision]);

  const clearFlashTimers = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (endTimerRef.current != null) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
  }, []);

  const placeFlash = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) return;
    setFlashFading(false);
    setFlashStyle({
      top: r.top,
      left: r.left,
      width: Math.max(r.width, 40),
      height: Math.max(r.height, 22),
    });
  }, []);

  const scrollToFinding = useCallback(
    (findingId: number) => {
      if (!editor) return;
      const finding = comments.find((c) => c.id === findingId) || null;
      const root = editor.view.dom as HTMLElement;
      const scrollParent = docScrollRef.current;
      clearFlashTimers();
      flashGenRef.current += 1;
      const gen = flashGenRef.current;
      setFlashStyle(null);
      setFlashFading(false);

      const target = resolveFindingTarget(root, findingId, finding);
      if (!target || !scrollParent) return;

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      placeFlash(target);

      const settle = scrollSettleMs(target, scrollParent);
      const started = performance.now();

      const tick = (now: number) => {
        if (flashGenRef.current !== gen) return;
        placeFlash(target);
        if (now - started < settle) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        // Держим яркую подсветку, затем гасим — overlay вне TipTap, PM его не снесёт
        setFlashFading(false);
        placeFlash(target);
        endTimerRef.current = window.setTimeout(() => {
          if (flashGenRef.current !== gen) return;
          setFlashFading(true);
          endTimerRef.current = window.setTimeout(() => {
            if (flashGenRef.current !== gen) return;
            setFlashStyle(null);
            setFlashFading(false);
            endTimerRef.current = null;
          }, 700);
        }, 1800);
      };
      rafRef.current = requestAnimationFrame(tick);
    },
    [editor, comments, clearFlashTimers, placeFlash]
  );

  useEffect(() => () => clearFlashTimers(), [clearFlashTimers]);

  const focusFinding = (id: number) => {
    onSelectFinding?.(id);
    // Сразу, без ожидания эффекта — повторный клик по той же плашке тоже работает
    scrollToFinding(id);
  };

  useEffect(() => {
    if (!historyOpen && !downloadMenu) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (historyOpen && !historyPanelRef.current?.contains(t) && !historyBtnRef.current?.contains(t)) {
        setHistoryOpen(false);
      }
      if (downloadMenu && !downloadBtnRef.current?.parentElement?.contains(t)) {
        setDownloadMenu(false);
      }
    };
    window.document.addEventListener("pointerdown", onDown, true);
    return () => window.document.removeEventListener("pointerdown", onDown, true);
  }, [historyOpen, downloadMenu]);

  const save = async () => {
    if (!editor || !document || viewingRevision !== null) return;
    setSaving(true);
    try {
      const saved = await api.documents.save(document.id, editor.getHTML());
      onSaved?.(saved);
      setViewingRevision(null);
    } finally {
      setSaving(false);
    }
  };

  const download = async (format: "docx" | "pdf") => {
    if (!document) return;
    setDownloadMenu(false);
    setDownloading(true);
    try {
      const token = localStorage.getItem("tn_token");
      const res = await fetch(api.documents.downloadUrl(document.id, format), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Не удалось скачать");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = document.filename.replace(/\.\w+$/, "") + (format === "pdf" ? ".pdf" : ".docx");
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const viewVersion = async (revision: number | null) => {
    if (!document || !editor) return;
    if (revision === null) {
      setViewingRevision(null);
      editor.commands.setContent(document.html_content || "<p></p>", false);
      editor.setEditable(true);
      return;
    }
    const list = (await api.documents.versions(document.id)) as {
      revision: number;
      html_content?: string;
    }[];
    const match = list.find((v) => v.revision === revision);
    setViewingRevision(revision);
    editor.setEditable(false);
    if (match?.html_content) editor.commands.setContent(match.html_content, false);
  };

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-tn-muted">
        Откройте договор из чата — он появится здесь
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-tn-panel">
      <div className="relative z-20 flex shrink-0 items-center justify-between gap-2 border-b border-tn-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{document.filename}</div>
          <div className="text-xs text-tn-muted">
            {viewingRevision !== null ? (
              <span className="text-tn-red">Просмотр v{viewingRevision} · только чтение</span>
            ) : (
              <>
                rev {document.revision}
                {document.is_anonymized ? " · анонимизирован" : ""}
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {onRecheck && (
            <button
              type="button"
              onClick={onRecheck}
              disabled={recheckBusy || viewingRevision !== null}
              className="rounded-lg bg-tn-red px-2.5 py-1 text-xs text-white disabled:opacity-40"
            >
              <RefreshCw size={13} className="mr-1 inline" />
              {recheckBusy ? "Проверка…" : "Повторная проверка"}
            </button>
          )}
          <div className="relative">
            <button
              ref={historyBtnRef}
              type="button"
              onClick={() => {
                setDownloadMenu(false);
                setHistoryOpen((v) => !v);
              }}
              className={`rounded-lg border px-2 py-1 text-xs ${
                historyOpen
                  ? "border-tn-red bg-tn-red/10 text-tn-red"
                  : "border-tn-border text-tn-muted hover:bg-tn-surface"
              }`}
            >
              <History size={13} className="mr-1 inline" /> История
            </button>
            {historyOpen && (
              <div ref={historyPanelRef} className="tn-history-flyout" role="dialog">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">История версий</div>
                  <button
                    type="button"
                    className="rounded p-1 hover:bg-tn-surface"
                    onClick={() => setHistoryOpen(false)}
                  >
                    <X size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  className={`tn-doc-version ${viewingRevision === null ? "is-active" : ""}`}
                  onClick={() => void viewVersion(null)}
                >
                  <div className="font-medium">Текущая</div>
                  <div className="text-tn-muted">rev {document.revision}</div>
                </button>
                {versions.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    className={`tn-doc-version ${viewingRevision === v.revision ? "is-active" : ""}`}
                    onClick={() => void viewVersion(v.revision)}
                  >
                    <div className="font-medium">{new Date(v.created_at).toLocaleString("ru")}</div>
                    <div className="text-tn-muted">
                      v{v.revision} · {v.note || "snapshot"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              ref={downloadBtnRef}
              type="button"
              onClick={() => {
                setHistoryOpen(false);
                setDownloadMenu((v) => !v);
              }}
              disabled={downloading}
              className="rounded-lg border border-tn-border px-2 py-1 text-xs text-tn-muted hover:bg-tn-surface"
            >
              <Download size={13} className="mr-1 inline" />
              {downloading ? "…" : "Скачать"}
            </button>
            {downloadMenu && (
              <div className="tn-menu-popover" style={{ top: "calc(100% + 6px)", right: 0, left: "auto" }}>
                <button type="button" onClick={() => void download("docx")}>
                  Word (.docx)
                </button>
                <button type="button" onClick={() => void download("pdf")}>
                  PDF (.pdf)
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || viewingRevision !== null}
            className="rounded-lg border border-tn-border px-2 py-1 text-xs hover:bg-tn-surface disabled:opacity-40"
          >
            <Save size={13} className="mr-1 inline" /> {saving ? "…" : "Сохранить"}
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <div
          ref={docScrollRef}
          className="relative min-w-0 flex-1 overflow-auto bg-tn-surface/40"
        >
          <div className="mx-auto my-3 min-h-[60vh] max-w-[640px] rounded-sm bg-white shadow-tn dark:bg-[#2a2624]">
            <EditorContent editor={editor} />
          </div>
        </div>

        {comments.length > 0 && (
          <aside className="w-64 shrink-0 overflow-auto border-l border-tn-border bg-tn-surface/80 p-2 backdrop-blur-[1px]">
            <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-tn-muted">
              Замечания
            </div>
            {comments.map((c) => (
              <div
                key={c.id}
                className={`tn-doc-comment mb-2 w-full text-left ${
                  activeFindingId === c.id ? "is-active" : ""
                } ${c.status === "fixed" ? "is-fixed" : ""}`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => focusFinding(c.id)}
                >
                  <div className="text-xs font-semibold text-tn-red">{c.title}</div>
                  <div className="mt-1 text-[11px] text-tn-muted">{c.description}</div>
                </button>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] opacity-60">
                    {c.status === "fixed" ? "Исправлено" : "Открыто"}
                  </span>
                  {onToggleFinding ? (
                    <button
                      type="button"
                      className="tn-fix-btn"
                      onClick={() => onToggleFinding(c)}
                    >
                      {c.status === "fixed" ? "Вернуть" : "Исправлено"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </aside>
        )}
      </div>

      {flashStyle && (
        <div
          className={`tn-clause-flash-overlay${flashFading ? " is-fading" : ""}`}
          style={flashStyle}
          aria-hidden
        />
      )}
    </div>
  );
}
