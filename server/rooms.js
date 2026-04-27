import { randomUUID } from "node:crypto";
import { Chess } from "chess.js";

const DEFAULT_TIME_CONTROL = {
  id: "rapid-10-0",
  label: "Rapid 10+0",
  category: "Rapid",
  minutes: 10,
  incrementSeconds: 0,
};

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

function cloneTimeControl(input = {}) {
  return {
    id: input.id || DEFAULT_TIME_CONTROL.id,
    label: input.label || DEFAULT_TIME_CONTROL.label,
    category: input.category || DEFAULT_TIME_CONTROL.category,
    minutes: Number(input.minutes || DEFAULT_TIME_CONTROL.minutes),
    incrementSeconds: Number(input.incrementSeconds || DEFAULT_TIME_CONTROL.incrementSeconds),
  };
}

function applyClock(room) {
  if (!room.black || room.finished || !room.lastTickAt) return room;

  const now = Date.now();
  const elapsed = now - room.lastTickAt;
  if (elapsed <= 0) return room;

  const side = currentTurn(room.chess);
  room.remainingMs[side] = Math.max(0, room.remainingMs[side] - elapsed);
  room.lastTickAt = now;

  if (room.remainingMs[side] === 0) {
    room.finished = true;
    room.timeoutWinner = side === "white" ? "black" : "white";
    room.manualResult = side === "white" ? "0-1" : "1-0";
    room.manualStatus = `${side} flagged`;
  }

  return room;
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(host, settings = {}) {
    const roomId = randomUUID().slice(0, 8).toUpperCase();
    const timeControl = cloneTimeControl(settings.timeControl);
    const startingMs = timeControl.minutes * 60 * 1000;
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
      timeControl,
      remainingMs: {
        white: startingMs,
        black: startingMs,
      },
      lastTickAt: null,
      finished: false,
      timeoutWinner: null,
      manualResult: "*",
      manualStatus: "waiting for opponent",
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
    applyClock(room);

    if (room.white.id === user.id) {
      room.disconnectedUserId = null;
      return { ok: true, room, color: "white", playerJoined: false };
    }

    if (room.black?.id === user.id) {
      room.disconnectedUserId = null;
      return { ok: true, room, color: "black", playerJoined: false };
    }

    if (!room.black) {
      room.black = {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar || "",
      };
      room.lastTickAt = Date.now();
      room.disconnectedUserId = null;
      return { ok: true, room, color: "black", playerJoined: true };
    }

    return { ok: false, error: "This room already has two players." };
  }

  disconnect(roomId, userId) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    applyClock(room);
    if (room.white.id === userId || room.black?.id === userId) {
      room.disconnectedUserId = userId;
    }
    return room;
  }

  makeMove(roomId, userId, moveInput) {
    const room = this.getRoom(roomId);
    if (!room) return { ok: false, error: "Room not found." };
    if (!room.black) return { ok: false, error: "Waiting for opponent." };
    applyClock(room);
    if (room.finished) {
      return { ok: false, error: "Game already finished." };
    }

    const color =
      room.white.id === userId ? "white" : room.black.id === userId ? "black" : null;

    if (!color) {
      return { ok: false, error: "You are not assigned to this game." };
    }

    if (currentTurn(room.chess) !== color) {
      return { ok: false, error: "It is not your turn." };
    }

    let move;
    try {
      move = room.chess.move({
        from: moveInput.from,
        to: moveInput.to,
        promotion: moveInput.promotion || "q",
      });
    } catch {
      move = null;
    }

    if (!move) {
      return { ok: false, error: "Illegal move." };
    }

    room.remainingMs[color] += room.timeControl.incrementSeconds * 1000;
    room.lastTickAt = Date.now();
    room.disconnectedUserId = null;
    if (room.chess.isGameOver()) {
      room.finished = true;
      room.manualResult = getResult(room.chess);
      room.manualStatus = getStatus(room);
    }

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

  syncRoom(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return { ok: false, error: "Room not found." };
    applyClock(room);
    return { ok: true, room, finished: room.finished };
  }

  resign(roomId, userId) {
    const room = this.getRoom(roomId);
    if (!room) return { ok: false, error: "Room not found." };
    applyClock(room);
    if (room.finished) return { ok: false, error: "Game already finished." };

    const color = room.white.id === userId ? "white" : room.black?.id === userId ? "black" : null;
    if (!color) return { ok: false, error: "You are not assigned to this game." };

    room.finished = true;
    room.manualResult = color === "white" ? "0-1" : "1-0";
    room.manualStatus = `${color} resigned`;
    room.lastTickAt = null;
    return { ok: true, room, finished: true, result: room.manualResult, status: room.manualStatus, winnerColor: color === "white" ? "black" : "white" };
  }

  draw(roomId) {
    const room = this.getRoom(roomId);
    if (!room) return { ok: false, error: "Room not found." };
    applyClock(room);
    if (room.finished) return { ok: false, error: "Game already finished." };
    room.finished = true;
    room.manualResult = "1/2-1/2";
    room.manualStatus = "draw agreed";
    room.lastTickAt = null;
    return { ok: true, room, finished: true, result: room.manualResult, status: room.manualStatus, winnerColor: null };
  }

  toState(room) {
    applyClock(room);
    return {
      roomId: room.id,
      fen: room.chess.fen(),
      pgn: room.chess.pgn(),
      status: room.finished ? room.manualStatus : getStatus(room),
      turn: currentTurn(room.chess),
      result: room.finished ? room.manualResult : getResult(room.chess),
      isCheck: !room.finished && room.chess.isCheck(),
      isCheckmate: room.chess.isCheckmate(),
      isDraw: room.finished ? room.manualResult === "1/2-1/2" : room.chess.isDraw(),
      waitingForOpponent: !room.black,
      timeControl: room.timeControl,
      remainingMs: room.remainingMs,
      timeoutWinner: room.timeoutWinner,
      finished: room.finished,
      players: {
        white: room.white,
        black: room.black,
      },
    };
  }
}
