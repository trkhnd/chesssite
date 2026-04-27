import { randomUUID } from "node:crypto";
import { Chess } from "chess.js";

function normalizeRoomId(roomId) {
  return roomId.trim().toUpperCase();
}

function getStatus(room) {
  if (!room.black) return "waiting for opponent";
  if (room.disconnectedUserId) return "opponent disconnected";
  if (room.chess.isCheckmate()) return "checkmate";
  if (room.chess.isDraw()) return "draw";
  if (room.chess.isCheck()) {
    return `${room.chess.turn() === "w" ? "white" : "black"} in check`;
  }
  return "in progress";
}

function getResult(chess) {
  if (chess.isCheckmate()) {
    return chess.turn() === "w" ? "0-1" : "1-0";
  }
  if (chess.isDraw()) return "1/2-1/2";
  return "*";
}

function getWinnerColor(chess) {
  if (!chess.isCheckmate()) return null;
  return chess.turn() === "w" ? "black" : "white";
}

function currentTurn(chess) {
  return chess.turn() === "w" ? "white" : "black";
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(host) {
    const roomId = randomUUID().slice(0, 8).toUpperCase();
    const room = {
      id: roomId,
      chess: new Chess(),
      white: {
        id: host.id,
        name: host.name,
        email: host.email,
        avatar: host.avatar || "",
      },
      black: null,
      createdAt: new Date().toISOString(),
      disconnectedUserId: null,
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId) {
    return this.rooms.get(normalizeRoomId(roomId)) || null;
  }

  joinRoom(roomId, user) {
    const room = this.getRoom(roomId);
    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    if (room.white.id === user.id) {
      room.disconnectedUserId = null;
      return { ok: true, room, color: "white" };
    }

    if (room.black?.id === user.id) {
      room.disconnectedUserId = null;
      return { ok: true, room, color: "black" };
    }

    if (!room.black) {
      room.black = {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
      };
      room.disconnectedUserId = null;
      return { ok: true, room, color: "black" };
    }

    return { ok: false, error: "This room already has two players." };
  }

  disconnect(roomId, userId) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    if (room.white.id === userId || room.black?.id === userId) {
      room.disconnectedUserId = userId;
    }
    return room;
  }

  makeMove(roomId, userId, moveInput) {
    const room = this.getRoom(roomId);
    if (!room) return { ok: false, error: "Room not found." };
    if (!room.black) return { ok: false, error: "Waiting for opponent." };

    const color =
      room.white.id === userId ? "white" : room.black.id === userId ? "black" : null;

    if (!color) {
      return { ok: false, error: "You are not assigned to this game." };
    }

    if (currentTurn(room.chess) !== color) {
      return { ok: false, error: "It is not your turn." };
    }

    const move = room.chess.move({
      from: moveInput.from,
      to: moveInput.to,
      promotion: moveInput.promotion || "q",
    });

    if (!move) {
      return { ok: false, error: "Illegal move." };
    }

    room.disconnectedUserId = null;

    return {
      ok: true,
      room,
      move,
      status: getStatus(room),
      result: getResult(room.chess),
      winnerColor: getWinnerColor(room.chess),
      finished: room.chess.isGameOver(),
    };
  }

  toState(room) {
    return {
      roomId: room.id,
      fen: room.chess.fen(),
      pgn: room.chess.pgn(),
      status: getStatus(room),
      turn: currentTurn(room.chess),
      result: getResult(room.chess),
      isCheck: room.chess.isCheck(),
      isCheckmate: room.chess.isCheckmate(),
      isDraw: room.chess.isDraw(),
      waitingForOpponent: !room.black,
      players: {
        white: room.white,
        black: room.black,
      },
    };
  }
}
