export type NotificationSettings = {
  gameInvitations: boolean;
  gameResults: boolean;
  coachTips: boolean;
};

export type ApiUser = {
  id: string;
  email: string;
  name: string;
  avatar: string;
  city: string;
  rating: number | null;
  pro: boolean;
  notifications: NotificationSettings;
};

export type SessionPayload = {
  user: ApiUser;
  sessionToken: string;
  socketToken: string;
};

export type PublicConfig = {
  googleEnabled: boolean;
  googleClientId: string;
  emailEnabled: boolean;
  serverUrl: string;
};

export type RoomPlayer = {
  id: string;
  name: string;
  email: string;
  avatar: string;
};

export type RoomState = {
  roomId: string;
  fen: string;
  pgn: string;
  status: string;
  turn: "white" | "black";
  result: string;
  isCheck: boolean;
  isCheckmate: boolean;
  isDraw: boolean;
  waitingForOpponent: boolean;
  finished: boolean;
  timeoutWinner: "white" | "black" | null;
  timeControl: {
    id: string;
    label: string;
    category: string;
    minutes: number;
    incrementSeconds: number;
  };
  remainingMs: {
    white: number;
    black: number;
  };
  players: {
    white: RoomPlayer;
    black: RoomPlayer | null;
  };
};

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: Record<string, unknown> | string | null;
};

const API_BASE_URL = String(import.meta.env.VITE_API_URL || "")
  .trim()
  .replace(/\/+$/, "");
const SESSION_TOKEN_KEY = "cm-session-token";

function getStoredSessionToken() {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function storeSessionToken(token: string) {
  try {
    if (token) {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
      return;
    }

    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Ignore storage failures and continue with cookie auth only.
  }
}

function buildApiUrl(path: string) {
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function getFriendlyRequestError(message: string, status?: number) {
  if (status === 401) {
    if (/expired/i.test(message)) return "Session expired. Please log in again.";
    if (/invalid email or password/i.test(message)) return "Invalid email or password.";
    if (/auth/i.test(message)) return "Please log in to continue.";
  }

  if (status && status >= 500) {
    return "Server unavailable. Please try again in a moment.";
  }

  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(message)) {
    return "Network error. Please check your connection and server URL.";
  }

  return message || "Server unavailable. Please try again in a moment.";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  const sessionToken = getStoredSessionToken();
  const headers = new Headers(options.headers || {});

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (sessionToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${sessionToken}`);
  }

  try {
    response = await fetch(buildApiUrl(path), {
      credentials: "include",
      headers,
      ...options,
      body:
        options.body === undefined || options.body === null
          ? undefined
          : typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new Error(getFriendlyRequestError(message));
  }

  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    storeSessionToken("");
  }

  if (!response.ok) {
    const message =
      typeof data?.error === "string"
        ? data.error
        : typeof data?.message === "string"
          ? data.message
          : "";
    throw new Error(getFriendlyRequestError(message, response.status));
  }

  return data as T;
}

export function getPublicConfig() {
  return request<PublicConfig>("/api/public-config");
}

export async function getSession() {
  try {
    const session = await request<SessionPayload>("/api/auth/me");
    storeSessionToken(session.sessionToken);
    return session;
  } catch (error) {
    if (error instanceof Error && /Authentication required|Please log in|Session expired|User not found/.test(error.message)) {
      storeSessionToken("");
      return null;
    }
    throw error;
  }
}

export async function registerUser(payload: { name: string; email: string; password: string; city: string }) {
  const data = await request<SessionPayload>("/api/auth/register", {
    method: "POST",
    body: payload,
  });
  storeSessionToken(data.sessionToken);
  return data;
}

export async function loginUser(payload: { email: string; password: string }) {
  const data = await request<SessionPayload>("/api/auth/login", {
    method: "POST",
    body: payload,
  });
  storeSessionToken(data.sessionToken);
  return data;
}

export async function loginWithGoogleCode(payload: { code: string; city: string }) {
  const data = await request<SessionPayload>("/api/auth/google", {
    method: "POST",
    body: payload,
  });
  storeSessionToken(data.sessionToken);
  return data;
}

export async function logoutUser() {
  const response = await request<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
  storeSessionToken("");
  return response;
}

export async function patchProfile(payload: {
  name?: string;
  city?: string;
  avatar?: string;
  rating?: number | null;
  pro?: boolean;
  notifications?: NotificationSettings;
}) {
  const data = await request<{ user: ApiUser }>("/api/profile", {
    method: "PATCH",
    body: payload,
  });
  return data.user;
}

export async function getHistory() {
  const data = await request<{ items: Array<Record<string, unknown>> }>("/api/history");
  return data.items;
}

export function saveHistory(payload: Record<string, unknown>) {
  return request<{ ok: boolean }>("/api/history", {
    method: "POST",
    body: payload,
  });
}

export async function createFriendRoom(payload: {
  timeControl?: {
    id: string;
    label: string;
    category: string;
    minutes: number;
    incrementSeconds: number;
  };
}) {
  const data = await request<{ roomId: string; url: string; state: RoomState }>("/api/rooms", {
    method: "POST",
    body: payload,
  });
  return data;
}

export async function getRoom(roomId: string) {
  return request<{ state: RoomState; color: "white" | "black" | null }>(`/api/rooms/${roomId}`);
}

export function sendRoomInvite(roomId: string, email: string) {
  return request<{ ok: boolean }>(`/api/rooms/${roomId}/invite`, {
    method: "POST",
    body: { email },
  });
}

export function sendCoachTipEmail(payload: { tip: string; evaluation: string }) {
  return request<{ ok: boolean; skipped?: boolean }>("/api/coach-tip", {
    method: "POST",
    body: payload,
  });
}
