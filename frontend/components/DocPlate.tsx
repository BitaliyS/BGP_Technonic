"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileText } from "lucide-react";
import { api } from "@/lib/api";

type Props = {
  documentId: number;
  filename: string;
  onOpen: () => void;
};

export function DocPlate({ documentId, filename, onOpen }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const ext = (filename.split(".").pop() || "DOCX").toUpperCase();

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [menuOpen]);

  const download = async (format: "docx" | "pdf") => {
    setMenuOpen(false);
    setBusy(true);
    try {
      const token = localStorage.getItem("tn_token");
      const res = await fetch(api.documents.downloadUrl(documentId, format), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename.replace(/\.\w+$/, "") + (format === "pdf" ? ".pdf" : ".docx");
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={rootRef} className="tn-doc-plate-wrap">
      <div className="tn-doc-plate">
        <button type="button" className="tn-doc-plate-main" onClick={onOpen}>
          <span className="tn-doc-plate-icon" aria-hidden>
            <FileText size={18} />
          </span>
          <span className="tn-doc-plate-meta">
            <span className="tn-doc-plate-title">{filename}</span>
            <span className="tn-doc-plate-sub">Document · {ext}</span>
          </span>
        </button>
        <div className="tn-doc-plate-actions">
          <button
            type="button"
            className="tn-doc-plate-dl"
            disabled={busy}
            onClick={() => void download("docx")}
            title="Скачать Word"
          >
            <Download size={14} />
            <span>Скачать</span>
          </button>
          <button
            type="button"
            className={`tn-doc-plate-more ${menuOpen ? "is-open" : ""}`}
            aria-label="Формат выгрузки"
            aria-expanded={menuOpen}
            disabled={busy}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <ChevronDown size={14} />
          </button>
          {menuOpen && (
            <div className="tn-menu-popover tn-doc-plate-menu">
              <button type="button" onClick={() => void download("docx")}>
                Word (.docx)
              </button>
              <button type="button" onClick={() => void download("pdf")}>
                PDF (.pdf)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
