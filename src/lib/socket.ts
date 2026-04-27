import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
const SOCKET_BASE_URL = String(import.meta.env.VITE_API_URL || "")
  .trim()
  .replace(/\/+$/, "");
let socketToken = "";

export function setSocketToken(token: string | null | undefined) {
  socketToken = token || "";
  if (socket) {
    socket.auth = socketToken ? { token: socketToken } : {};
  }
}

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_BASE_URL || "/", {
      autoConnect: false,
      withCredentials: true,
      transports: ["websocket", "polling"],
      auth: socketToken ? { token: socketToken } : {},
    });
  }

  return socket;
}
