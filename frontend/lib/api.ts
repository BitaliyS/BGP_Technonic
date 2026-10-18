// Пустая строка = same-origin /api (прод за Traefik → Next rewrite → backend)
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: "lawyer" | "manager" | "admin";
  is_active: boolean;
};

export type Project = {
  id: number;
  title: string;
  owner_id: number;
  kind: "project" | "solo" | string;
  memory_summary: string;
  created_at: string;
  updated_at: string;
};

export type Chat = {
  id: number;
  project_id: number;
  title: string;
  model_id: string;
  created_at: string;
};

export type Message = {
  id: number;
  role: string;
  content: string;
  meta_json: string;
  created_at: string;
};

export type Document = {
  id: number;
  project_id: number;
  filename: string;
  html_content: string;
  plain_text: string;
  contract_type: string | null;
  revision: number;
  is_anonymized: boolean;
  created_at: string;
  updated_at: string;
};

export type CheckType = {
  id: number;
  key: string;
  title: string;
  description: string;
  prompt_key: string;
  rules: string[];
  is_active: boolean;
  sort_order: number;
};

function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("tn_token") : null;
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = err.detail;
    const message = Array.isArray(detail)
      ? detail.map((d: { msg?: string }) => d.msg || JSON.stringify(d)).join("; ")
      : typeof detail === "string"
        ? detail
        : detail
          ? JSON.stringify(detail)
          : "Request failed";
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<User>("/api/auth/me"),
  models: () => request<{ models: string[] }>("/api/models"),
  projects: {
    list: () => request<Project[]>("/api/projects"),
    create: (title: string) =>
      request<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ title, kind: "project" }),
      }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
    get: (id: number) => request<Project>(`/api/projects/${id}`),
    memory: (id: number) =>
      request<{ summary: string; memory: unknown }>(`/api/projects/${id}/memory`),
    chats: (id: number) => request<Chat[]>(`/api/projects/${id}/chats`),
    createChat: (id: number, title?: string, model_id?: string) =>
      request<Chat>(`/api/projects/${id}/chats`, {
        method: "POST",
        body: JSON.stringify({ title: title || "Новый чат", model_id }),
      }),
    createSoloChat: (title?: string, model_id?: string) =>
      request<{ project: Project; chat: Chat }>("/api/projects/solo-chats", {
        method: "POST",
        body: JSON.stringify({ title: title || "Новый чат", model_id }),
      }),
    renameChat: (projectId: number, chatId: number, title: string) =>
      request<Chat>(`/api/projects/${projectId}/chats/${chatId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      }),
    deleteChat: (projectId: number, chatId: number) =>
      request<{ ok: boolean }>(`/api/projects/${projectId}/chats/${chatId}`, {
        method: "DELETE",
      }),
    messages: (projectId: number, chatId: number) =>
      request<Message[]>(`/api/projects/${projectId}/chats/${chatId}/messages`),
  },
  documents: {
    list: (projectId: number) =>
      request<Document[]>(`/api/projects/${projectId}/documents`),
    upload: async (projectId: number, file: File) => {
      const token = localStorage.getItem("tn_token");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/api/projects/${projectId}/documents`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(
          detail
            ? `Не удалось загрузить файл: ${detail.slice(0, 200)}`
            : `Не удалось загрузить файл (ошибка ${res.status})`
        );
      }
      return res.json() as Promise<Document>;
    },
    get: (id: number) => request<Document>(`/api/documents/${id}`),
    save: (id: number, html_content: string, note = "manual_edit") =>
      request<Document>(`/api/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify({ html_content, note }),
      }),
    versions: (id: number) =>
      request<
        {
          id: number;
          revision: number;
          note: string;
          html_content?: string;
          created_at: string;
        }[]
      >(`/api/documents/${id}/versions`),
    anonymize: (id: number) =>
      request<Document>(`/api/documents/${id}/anonymize`, { method: "POST" }),
    downloadUrl: (id: number, format: "docx" | "pdf" = "docx") =>
      `${API_URL}/api/documents/${id}/download?format=${format}`,
  },
  users: {
    list: () => request<User[]>("/api/users"),
    create: (body: {
      email: string;
      full_name: string;
      password: string;
      role: string;
    }) =>
      request<User>("/api/users", { method: "POST", body: JSON.stringify(body) }),
    update: (id: number, body: Partial<User> & { password?: string }) =>
      request<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/api/users/${id}`, { method: "DELETE" }),
  },
  checkTypes: {
    list: (activeOnly = true) =>
      request<CheckType[]>(
        `/api/check-types${activeOnly ? "" : "?active_only=false"}`
      ),
    create: (body: {
      title: string;
      key?: string;
      description?: string;
      rules?: string[];
      prompt_content?: string;
      sort_order?: number;
      is_active?: boolean;
    }) =>
      request<CheckType>("/api/check-types", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (
      id: number,
      body: Partial<{
        title: string;
        description: string;
        rules: string[];
        prompt_content: string;
        sort_order: number;
        is_active: boolean;
      }>
    ) =>
      request<CheckType>(`/api/check-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    remove: (id: number) =>
      request<{ ok: boolean }>(`/api/check-types/${id}`, { method: "DELETE" }),
  },
  prompts: {
    list: () =>
      request<
        {
          id: number;
          key: string;
          title: string;
          contract_type: string;
          content: string;
          version_number: number;
          updated_at: string;
        }[]
      >("/api/prompts"),
    update: (id: number, content: string, change_note: string) =>
      request(`/api/prompts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ content, change_note }),
      }),
    versions: (id: number) =>
      request<
        {
          id: number;
          version_number: number;
          content: string;
          change_note: string;
          source: string;
          created_at: string;
        }[]
      >(`/api/prompts/${id}/versions`),
    restore: (id: number, versionId: number) =>
      request(`/api/prompts/${id}/restore/${versionId}`, { method: "POST" }),
    removeVersion: (id: number, versionId: number) =>
      request<{ ok: boolean; version_number: number }>(
        `/api/prompts/${id}/versions/${versionId}`,
        { method: "DELETE" }
      ),
    sandbox: (body: {
      prompt_key?: string;
      prompt_content?: string;
      sample_text: string;
    }) => request("/api/prompts/sandbox", { method: "POST", body: JSON.stringify(body) }),
  },
  findings: {
    setStatus: (id: number, status: "open" | "fixed") =>
      request<{ id: number; status: string }>(`/api/findings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },
  team: {
    stats: (contract_type?: string) =>
      request<Record<string, unknown>>(
        `/api/team/stats${contract_type ? `?contract_type=${contract_type}` : ""}`
      ),
    findings: (params?: { lawyer_id?: number; document_id?: number }) => {
      const q = new URLSearchParams();
      if (params?.lawyer_id) q.set("lawyer_id", String(params.lawyer_id));
      if (params?.document_id) q.set("document_id", String(params.document_id));
      return request(`/api/team/findings?${q.toString()}`);
    },
  },
};

export async function streamChat(
  projectId: number,
  chatId: number,
  body: {
    message: string;
    intent: string;
    contract_type?: string | null;
    document_id?: number | null;
    model_id?: string;
  },
  handlers: {
    onToken?: (t: string) => void;
    onTool?: (d: unknown) => void;
    onDone?: (d: Record<string, unknown>) => void;
    onError?: (m: string) => void;
  }
) {
  const token = localStorage.getItem("tn_token");
  const res = await fetch(
    `${API_URL}/api/projects/${projectId}/chats/${chatId}/messages/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok || !res.body) {
    handlers.onError?.("Stream failed");
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (event === "token") handlers.onToken?.(parsed.text || "");
        else if (event === "tool") handlers.onTool?.(parsed);
        else if (event === "done") handlers.onDone?.(parsed);
        else if (event === "error") handlers.onError?.(parsed.message || "Error");
      } catch {
        /* ignore */
      }
    }
  }
}
