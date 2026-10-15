"use client";

import { DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import {
  CheckSquare,
  ChevronDown,
  FileText,
  Mic,
  Paperclip,
  Plus,
  Send,
  ShieldOff,
  X,
} from "lucide-react";
import { api, CheckType } from "@/lib/api";

export type ChatSendPayload = {
  message: string;
  intent: "chat" | "check" | "anonymize";
  contract_type?: string | null;
  file?: File | null;
};

type Props = {
  models: string[];
  modelId: string;
  onModelChange: (m: string) => void;
  disabled?: boolean;
  hasDocument?: boolean;
  draftText?: string;
  onDraftConsumed?: () => void;
  onSend: (payload: ChatSendPayload) => void | Promise<void>;
  onError?: (message: string) => void;
};

type OpenMenu = null | "plus" | "check";

const FALLBACK_TYPES: CheckType[] = [
  {
    id: 0,
    key: "real_estate",
    title: "Аренда недвижимости",
    description: "",
    prompt_key: "check_real_estate",
    rules: [],
    is_active: true,
    sort_order: 10,
  },
  {
    id: -1,
    key: "vehicle_lease",
    title: "Договор аренды ТС",
    description: "",
    prompt_key: "check_vehicle_lease",
    rules: [],
    is_active: true,
    sort_order: 20,
  },
];

export function ChatInput({
  models,
  modelId,
  onModelChange,
  disabled,
  hasDocument,
  draftText,
  onDraftConsumed,
  onSend,
  onError,
}: Props) {
  const [text, setText] = useState("");
  const [pendingIntent, setPendingIntent] = useState<"chat" | "check" | "anonymize">("chat");
  const [pendingType, setPendingType] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [open, setOpen] = useState<OpenMenu>(null);
  const [checkTypes, setCheckTypes] = useState<CheckType[]>(FALLBACK_TYPES);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragDepth = useRef(0);

  const canUseDoc = Boolean(pendingFile || hasDocument);

  useEffect(() => {
    api.checkTypes
      .list(true)
      .then((list) => {
        if (list.length) setCheckTypes(list);
      })
      .catch(() => {
        /* keep fallback */
      });
  }, []);

  useEffect(() => {
    if (draftText != null && draftText !== "") {
      setText(draftText);
      onDraftConsumed?.();
    }
  }, [draftText, onDraftConsumed]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(null);

  const reportError = (message: string) => {
    setLocalError(message);
    onError?.(message);
  };

  const acceptFile = (file: File | undefined | null) => {
    if (!file) return;
    if (disabled) {
      reportError("Сначала откройте или создайте чат, затем прикрепите договор.");
      return;
    }
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) {
      reportError("PDF пока не поддерживается. Прикрепите договор в формате Word (.docx) или .txt.");
      return;
    }
    if (name.endsWith(".doc") && !name.endsWith(".docx")) {
      reportError("Старый формат .doc не поддерживается. Сохраните файл как .docx.");
      return;
    }
    if (!name.endsWith(".docx") && !name.endsWith(".txt")) {
      reportError("Система принимает только .docx или .txt.");
      return;
    }
    setLocalError(null);
    setPendingFile(file);
  };

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (disabled) return;
    const message = text.trim();
    const needsDoc =
      pendingIntent === "check" || pendingIntent === "anonymize";
    if (!message && !pendingFile) return;
    if (needsDoc && !canUseDoc) {
      reportError("Прикрепите договор, затем выберите действие и отправьте.");
      return;
    }
    if (!message && pendingFile && pendingIntent === "chat") {
      reportError("Напишите запрос или выберите «Проверить» / «Анонимизация», затем отправьте.");
      return;
    }
    close();
    const file = pendingFile;
    onSend({
      message:
        message ||
        (pendingIntent === "anonymize"
          ? "Анонимизировать загруженный документ"
          : pendingIntent === "check"
            ? "Проверить договор"
            : ""),
      intent: pendingIntent,
      contract_type: pendingType,
      file,
    });
    setText("");
    setPendingIntent("chat");
    setPendingType(null);
    setPendingFile(null);
  };

  const pickCheck = (ct: CheckType) => {
    close();
    setText(`Проверить договор: ${ct.title}`);
    setPendingIntent("check");
    setPendingType(ct.key);
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const canSend =
    !disabled &&
    (Boolean(text.trim()) ||
      (Boolean(pendingFile) && pendingIntent !== "chat"));

  return (
    <div
      ref={rootRef}
      className={`tn-input-wrap mx-auto w-full max-w-3xl px-4 pb-3 ${dragging ? "is-drop-target" : ""}`}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="tn-drop-overlay" aria-hidden>
          Отпустите файл — он прикрепится к запросу (.docx или .txt)
        </div>
      )}

      {localError && (
        <div className="mb-2 rounded-xl border border-tn-red/30 bg-tn-red/5 px-3 py-2 text-xs text-tn-red">
          {localError}
        </div>
      )}

      <div className="tn-action-bar">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            close();
            fileRef.current?.click();
          }}
        >
          <Paperclip size={14} className="mr-1 inline" />
          Прикрепить
        </button>
        <div className="tn-check-wrap">
          <button
            type="button"
            disabled={disabled || !canUseDoc}
            className="is-primary"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => (v === "check" ? null : "check"));
            }}
            title={!canUseDoc ? "Сначала прикрепите договор" : "Выберите тип проверки"}
          >
            <CheckSquare size={14} className="mr-1 inline shrink-0" />
            <span>Проверить</span>
            <ChevronDown size={14} className="ml-1 inline shrink-0" />
          </button>
          {open === "check" && (
            <div
              className="tn-menu-popover tn-menu-popover--up"
              style={{ bottom: "calc(100% + 6px)", left: 0, top: "auto" }}
            >
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-tn-muted">
                Тип договора
              </div>
              {checkTypes.map((ct) => (
                <button key={ct.key} type="button" onClick={() => pickCheck(ct)}>
                  <span className="flex flex-col items-start gap-0.5">
                    <span>{ct.title}</span>
                    {ct.description ? (
                      <span className="text-[11px] font-normal text-tn-muted">{ct.description}</span>
                    ) : null}
                  </span>
                </button>
              ))}
              {!checkTypes.length && (
                <div className="px-3 py-2 text-xs text-tn-muted">Нет активных типов проверки</div>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={disabled || !canUseDoc}
          onClick={() => {
            close();
            setText("Анонимизировать загруженный документ");
            setPendingIntent("anonymize");
            setPendingType(null);
          }}
        >
          <ShieldOff size={14} className="mr-1 inline" />
          Анонимизация
        </button>
      </div>

      {pendingFile && (
        <div className="tn-attach-chip mb-2">
          <FileText size={14} className="shrink-0 text-tn-red" />
          <span className="min-w-0 flex-1 truncate" title={pendingFile.name}>
            {pendingFile.name}
          </span>
          <span className="shrink-0 text-[11px] text-tn-muted">к запросу</span>
          <button
            type="button"
            className="tn-attach-chip-remove"
            aria-label="Убрать файл"
            onClick={() => setPendingFile(null)}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <form
        onSubmit={submit}
        className="claude-input relative z-10 flex items-end gap-2 px-3 py-2"
      >
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => (v === "plus" ? null : "plus"));
            }}
            className="mb-1 rounded-full p-2 text-tn-muted hover:bg-tn-surface hover:text-tn-red"
            aria-label="Действия"
          >
            <Plus size={18} />
          </button>
          {open === "plus" && (
            <div className="tn-menu-popover" style={{ bottom: "calc(100% + 8px)", left: 0 }}>
              <button
                type="button"
                onClick={() => {
                  close();
                  fileRef.current?.click();
                }}
              >
                <Paperclip size={16} /> Прикрепить документ
              </button>
              <button type="button" disabled={!canUseDoc} onClick={() => setOpen("check")}>
                <CheckSquare size={16} /> Проверить
              </button>
              <button
                type="button"
                disabled={!canUseDoc}
                onClick={() => {
                  close();
                  setText("Анонимизировать загруженный документ");
                  setPendingIntent("anonymize");
                }}
              >
                <ShieldOff size={16} /> Анонимизация
              </button>
            </div>
          )}
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (
              pendingIntent !== "chat" &&
              !e.target.value.startsWith("Проверить") &&
              !e.target.value.startsWith("Анонимиз")
            ) {
              setPendingIntent("chat");
              setPendingType(null);
            }
          }}
          onFocus={close}
          placeholder="Прикрепите договор, напишите запрос или выберите действие…"
          rows={1}
          className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-tn-muted"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" className="mb-1 rounded-full p-2 text-tn-muted opacity-50" disabled>
          <Mic size={18} />
        </button>
        <button
          type="submit"
          disabled={!canSend}
          className="mb-1 rounded-full bg-tn-red p-2 text-white disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </form>

      <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-tn-muted">
        <span>Технониколь-ИИ может ошибаться. Перепроверяйте ответы.</span>
        <select
          value={modelId}
          onChange={(e) => onModelChange(e.target.value)}
          className="cursor-pointer rounded-md border border-tn-border bg-tn-panel px-2 py-1"
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".docx,.txt"
        className="hidden"
        onChange={(e) => {
          acceptFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
