/** Заголовок чата из первого сообщения (нулевой старт → автосоздание). */
export function chatTitleFromDraft(draft?: string, maxLen = 48): string {
  const title = (draft || "").trim().replace(/\s+/g, " ").slice(0, maxLen);
  return title || "Новый чат";
}
