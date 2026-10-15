"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Props = {
  text: string;
};

export function CopyMessageButton({ text }: Props) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const value = (text || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      className="tn-msg-copy"
      onClick={() => void onCopy()}
      title={copied ? "Скопировано" : "Копировать"}
      aria-label={copied ? "Скопировано" : "Копировать сообщение"}
    >
      {copied ? <Check size={14} strokeWidth={2} /> : <Copy size={14} strokeWidth={2} />}
    </button>
  );
}
