import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;
const SOCKET_BASE_URL = String(import.meta.env.VITE_API_URL || "")
  .trim()
  .replace(/\/+$/, "");

export function getSocket() {
  if (!socket) {
    socket = io(SOCKET_BASE_URL || "/", {
      autoConnect: false,
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
  }

  return socket;
}
