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

function buildApiUrl(path: string) {
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function getFriendlyRequestError(message: string, status?: number) {
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

  try {
    response = await fetch(buildApiUrl(path), {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
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
    const data = await request<{ user: ApiUser }>("/api/auth/me");
    return data.user;
  } catch (error) {
    if (error instanceof Error && /Authentication required|User not found/.test(error.message)) {
      return null;
    }
    throw error;
  }
}

export async function registerUser(payload: { name: string; email: string; password: string; city: string }) {
  const data = await request<{ user: ApiUser }>("/api/auth/register", {
    method: "POST",
    body: payload,
  });
  return data.user;
}

export async function loginUser(payload: { email: string; password: string }) {
  const data = await request<{ user: ApiUser }>("/api/auth/login", {
    method: "POST",
    body: payload,
  });
  return data.user;
}

export async function loginWithGoogleCode(payload: { code: string; city: string }) {
  const data = await request<{ user: ApiUser }>("/api/auth/google", {
    method: "POST",
    body: payload,
  });
  return data.user;
}

export function logoutUser() {
  return request<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
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
