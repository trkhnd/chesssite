import http from "node:http";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { OAuth2Client } from "google-auth-library";
import helmet from "helmet";
import morgan from "morgan";
import { Server } from "socket.io";
import { config, flags } from "./config.js";
import {
  clearSessionCookie,
  getSessionFromSocket,
  requireAuth,
  setSessionCookie,
  signSocketSession,
  signSession,
} from "./auth.js";
import {
  createGameRecord,
  createUser,
  findUserByEmail,
  findUserByEmailWithPassword,
  findUserById,
  getUserEmailPreferences,
  listHistoryForUser,
  updateUserProfile,
  upsertGoogleUser,
} from "./store.js";
import { logger } from "./logger.js";
import { RoomManager } from "./rooms.js";
import { sendEmail } from "./email/service.js";
import {
  authNoticeEmail,
  coachTipEmail,
  invitationEmail,
  resultEmail,
  welcomeEmail,
} from "./email/templates.js";

function isAllowedOrigin(origin) {
  if (!origin) return true;

  const configuredOrigins = [config.clientUrl, process.env.CORS_EXTRA_ORIGINS || "", "https://chesssite-ochre.vercel.app"]
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  const allowed = new Set([
    ...configuredOrigins,
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
  ]);

  if (allowed.has(origin)) return true;

  try {
    const url = new URL(origin);
    return (url.hostname === "localhost" || url.hostname === "127.0.0.1") && /^51\d\d$/.test(url.port);
  } catch {
    return false;
  }
}

function getAllowedOrigins() {
  return [config.clientUrl, process.env.CORS_EXTRA_ORIGINS || "", "https://chesssite-ochre.vercel.app"]
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("CORS origin is not allowed."));
  },
  credentials: true,
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });
app.set("trust proxy", 1);

const googleClient = flags.googleEnabled
  ? new OAuth2Client(config.googleClientId, config.googleClientSecret, "postmessage")
  : null;

const roomManager = new RoomManager();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeCity(value) {
  const city = String(value || "").trim();
  return city || "Almaty";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isStrongPassword(value) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value);
}

function sendError(res, status, error) {
  res.status(status).json({ ok: false, error });
}

function sendUser(res, status, user) {
  res.status(status).json({ ok: true, user, socketToken: signSocketSession(user) });
}

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use((req, _res, next) => {
  if (req.path.startsWith("/api/auth") || req.path.startsWith("/api/rooms")) {
    logger.info("request", req.method, req.path, "origin", req.headers.origin || "none");
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    nodeEnv: config.nodeEnv,
    port: config.port,
    clientUrl: config.clientUrl,
    serverUrl: config.serverUrl,
    allowedOrigins: getAllowedOrigins(),
  });
});

app.get("/api/public-config", (_req, res) => {
  res.json({
    googleEnabled: flags.googleEnabled,
    googleClientId: flags.googleEnabled ? config.googleClientId : "",
    emailEnabled: flags.emailEnabled,
    serverUrl: config.serverUrl,
  });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, city } = req.body || {};
  const normalizedName = normalizeName(name);
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "");
  const normalizedCity = normalizeCity(city);

  if (!normalizedName || !normalizedEmail || !normalizedPassword) {
    sendError(res, 400, "Name, email, and password are required.");
    return;
  }

  if (!isValidEmail(normalizedEmail)) {
    sendError(res, 400, "Enter a valid email address.");
    return;
  }

  if (!isStrongPassword(normalizedPassword)) {
    sendError(res, 400, "Password must be at least 8 characters and include letters and numbers.");
    return;
  }

  if (findUserByEmail(normalizedEmail)) {
    sendError(res, 409, "This email is already registered.");
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(normalizedPassword, 10);
    const user = createUser({
      id: randomUUID(),
      name: normalizedName,
      email: normalizedEmail,
      passwordHash,
      city: normalizedCity,
      notifications: {
        gameInvitations: true,
        gameResults: true,
        coachTips: false,
      },
    });

    setSessionCookie(res, signSession(user));
    void sendEmail({
      to: user.email,
      subject: "Welcome to Chess Master",
      html: welcomeEmail(user),
    });

    sendUser(res, 201, user);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      sendError(res, 409, "This email is already registered.");
      return;
    }
    logger.error("Registration failed", error instanceof Error ? error.message : error);
    sendError(res, 500, "Account creation failed.");
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || "");

  if (!normalizedEmail || !normalizedPassword) {
    sendError(res, 400, "Email and password are required.");
    return;
  }

  if (!isValidEmail(normalizedEmail)) {
    sendError(res, 400, "Enter a valid email address.");
    return;
  }

  const rawUser = findUserByEmailWithPassword(normalizedEmail);
  if (!rawUser?.password_hash) {
    sendError(res, 401, "Invalid email or password.");
    return;
  }

  const passwordOk = await bcrypt.compare(normalizedPassword, rawUser.password_hash);
  if (!passwordOk) {
    sendError(res, 401, "Invalid email or password.");
    return;
  }

  const user = findUserById(rawUser.id);
  setSessionCookie(res, signSession(user));
  void sendEmail({
    to: user.email,
    subject: "Chess Master sign-in",
    html: authNoticeEmail(user),
  });

  sendUser(res, 200, user);
});

app.post("/api/auth/google", async (req, res) => {
  if (!googleClient || !flags.googleEnabled) {
    sendError(res, 503, "Google login is not configured.");
    return;
  }

  const { code, city } = req.body || {};
  if (!code) {
    sendError(res, 400, "Google authorization code is required.");
    return;
  }

  try {
    const tokenResponse = await googleClient.getToken({
      code,
      redirect_uri: "postmessage",
    });

    const idToken = tokenResponse.tokens.id_token;
    if (!idToken) {
      sendError(res, 400, "Google did not return an ID token.");
      return;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: config.googleClientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      sendError(res, 400, "Google account data is incomplete.");
      return;
    }

    const result = upsertGoogleUser({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split("@")[0],
      avatar: payload.picture || "",
      city: city || "Almaty",
    });

    setSessionCookie(res, signSession(result.user));
    void sendEmail({
      to: result.user.email,
      subject: result.created ? "Welcome to Chess Master" : "Chess Master sign-in",
      html: result.created ? welcomeEmail(result.user) : authNoticeEmail(result.user),
    });

    sendUser(res, 200, result.user);
  } catch (error) {
    logger.error("Google login failed", error instanceof Error ? error.message : error);
    sendError(res, 500, "Google login failed.");
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = findUserById(req.session.userId);
  if (!user) {
    clearSessionCookie(res);
    sendError(res, 404, "User not found.");
    return;
  }

  sendUser(res, 200, user);
});

app.patch("/api/profile", requireAuth, (req, res) => {
  const user = updateUserProfile(req.session.userId, req.body || {});
  if (!user) {
    sendError(res, 404, "User not found.");
    return;
  }

  sendUser(res, 200, user);
});

app.get("/api/history", requireAuth, (req, res) => {
  res.json({ items: listHistoryForUser(req.session.userId) });
});

app.post("/api/history", requireAuth, (req, res) => {
  const { mode, result, status, pgn, fen, summary, opponentUserId } = req.body || {};
  if (!result || !status) {
    res.status(400).json({ error: "Result and status are required." });
    return;
  }

  createGameRecord({
    mode: mode || "ai",
    roomId: null,
    whiteUserId: req.session.userId,
    blackUserId: opponentUserId || null,
    result,
    status,
    pgn: pgn || "",
    fen: fen || "",
    winnerUserId: result === "1-0" ? req.session.userId : null,
    summary: summary || "",
  });

  res.status(201).json({ ok: true });
});

app.post("/api/rooms", requireAuth, (req, res) => {
  const user = findUserById(req.session.userId);
  const room = roomManager.createRoom(user, req.body || {});
  res.status(201).json({
    roomId: room.id,
    url: `${config.clientUrl}/play/room/${room.id}`,
    state: roomManager.toState(room),
  });
});

app.get("/api/rooms/:roomId", requireAuth, (req, res) => {
  const room = roomManager.getRoom(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }

  const user = findUserById(req.session.userId);
  const color = room.white.id === user.id ? "white" : room.black?.id === user.id ? "black" : null;
  res.json({
    state: roomManager.toState(room),
    color,
  });
});

app.post("/api/rooms/:roomId/invite", requireAuth, async (req, res) => {
  const room = roomManager.getRoom(req.params.roomId);
  const inviteEmail = String(req.body?.email || "").trim().toLowerCase();
  if (!room) {
    res.status(404).json({ error: "Room not found." });
    return;
  }
  if (!inviteEmail) {
    res.status(400).json({ error: "Invitation email is required." });
    return;
  }

  const recipient = getUserEmailPreferences(inviteEmail);
  if (recipient && !recipient.notifications.gameInvitations) {
    res.status(409).json({ error: "This user disabled invitation emails." });
    return;
  }

  const sender = findUserById(req.session.userId);
  await sendEmail({
    to: inviteEmail,
    subject: `${sender.name} invited you to play chess`,
    html: invitationEmail({
      inviterName: sender.name,
      inviteLink: `${config.clientUrl}/play/room/${room.id}`,
      roomId: room.id,
    }),
  });

  res.json({ ok: true });
});

app.post("/api/coach-tip", requireAuth, async (req, res) => {
  const user = findUserById(req.session.userId);
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  if (!user.notifications.coachTips) {
    res.json({ ok: true, skipped: true });
    return;
  }

  const tip = String(req.body?.tip || "").trim();
  const evaluation = String(req.body?.evaluation || "No evaluation yet").trim();

  if (!tip) {
    res.status(400).json({ error: "Coach tip text is required." });
    return;
  }

  await sendEmail({
    to: user.email,
    subject: "Chess Master coach tip",
    html: coachTipEmail({
      userName: user.name,
      tip,
      evaluation,
    }),
  });

  res.json({ ok: true });
});

io.use((socket, next) => {
  const session = getSessionFromSocket(socket);
  if (!session) {
    next(new Error("Authentication required."));
    return;
  }

  socket.data.session = session;
  next();
});

async function persistFinishedGame(room, moveResult) {
  const winnerUserId =
    moveResult.winnerColor === "white"
      ? room.white.id
      : moveResult.winnerColor === "black"
        ? room.black?.id || null
        : null;

  const summary = `Game finished with ${moveResult.status}. Result: ${moveResult.result}.`;

  createGameRecord({
    roomId: room.id,
    mode: "friend",
    whiteUserId: room.white.id,
    blackUserId: room.black?.id || null,
    result: moveResult.result,
    status: moveResult.status,
    pgn: room.chess.pgn(),
    fen: room.chess.fen(),
    winnerUserId,
    summary,
  });

  const players = [room.white, room.black].filter(Boolean);
  await Promise.all(
    players.map(async (player) => {
      const stored = findUserById(player.id);
      if (!stored?.notifications.gameResults) return;
      await sendEmail({
        to: stored.email,
        subject: "Your Chess Master game is finished",
        html: resultEmail({
          userName: stored.name,
          result: moveResult.result,
          summary,
          roomId: room.id,
        }),
      });
    }),
  );
}

io.on("connection", (socket) => {
  const session = socket.data.session;
  const user = findUserById(session.userId);

  socket.on("room:join", (payload, callback) => {
    const joinResult = roomManager.joinRoom(payload.roomId, user);
    if (!joinResult.ok) {
      callback?.(joinResult);
      return;
    }

    socket.data.roomId = joinResult.room.id;
    socket.join(joinResult.room.id);
    io.to(joinResult.room.id).emit("room:state", roomManager.toState(joinResult.room));
    callback?.({
      ok: true,
      color: joinResult.color,
      state: roomManager.toState(joinResult.room),
    });
  });

  socket.on("room:move", async (payload, callback) => {
    const moveResult = roomManager.makeMove(payload.roomId, user.id, payload);
    if (!moveResult.ok) {
      callback?.(moveResult);
      return;
    }

    io.to(moveResult.room.id).emit("room:state", roomManager.toState(moveResult.room));
    callback?.({ ok: true, state: roomManager.toState(moveResult.room) });

    if (moveResult.finished) {
      await persistFinishedGame(moveResult.room, moveResult);
    }
  });

  socket.on("room:sync", (payload, callback) => {
    const result = roomManager.syncRoom(payload.roomId);
    if (!result.ok) {
      callback?.(result);
      return;
    }
    io.to(result.room.id).emit("room:state", roomManager.toState(result.room));
    callback?.({ ok: true, state: roomManager.toState(result.room) });
  });

  socket.on("room:resign", async (payload, callback) => {
    const result = roomManager.resign(payload.roomId, user.id);
    if (!result.ok) {
      callback?.(result);
      return;
    }
    io.to(result.room.id).emit("room:state", roomManager.toState(result.room));
    callback?.({ ok: true, state: roomManager.toState(result.room) });
    if (result.finished) {
      await persistFinishedGame(result.room, result);
    }
  });

  socket.on("room:draw", async (payload, callback) => {
    const result = roomManager.draw(payload.roomId);
    if (!result.ok) {
      callback?.(result);
      return;
    }
    io.to(result.room.id).emit("room:state", roomManager.toState(result.room));
    callback?.({ ok: true, state: roomManager.toState(result.room) });
    if (result.finished) {
      await persistFinishedGame(result.room, result);
    }
  });

  socket.on("disconnect", () => {
    if (!socket.data.roomId) return;
    const room = roomManager.disconnect(socket.data.roomId, user.id);
    if (room) {
      io.to(room.id).emit("room:state", roomManager.toState(room));
    }
  });
});

server.listen(config.port, () => {
  logger.info("Chess Master backend listening", {
    port: config.port,
    nodeEnv: config.nodeEnv,
    clientUrl: config.clientUrl,
    serverUrl: config.serverUrl,
    allowedOrigins: getAllowedOrigins(),
  });
});

app.use((error, req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    sendError(res, 400, "Request body must be valid JSON.");
    return;
  }

  logger.error("Unhandled API error", {
    method: req.method,
    path: req.path,
    origin: req.headers.origin || "none",
    message: error instanceof Error ? error.message : String(error),
  });

  if (error instanceof Error && /CORS/i.test(error.message)) {
    sendError(res, 403, "CORS origin is not allowed.");
    return;
  }

  sendError(res, 500, "Server error.");
});
