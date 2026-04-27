import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { config } from "./config.js";

const db = new Database(config.databasePath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    name TEXT NOT NULL,
    avatar TEXT,
    city TEXT NOT NULL DEFAULT 'Almaty',
    rating INTEGER,
    pro INTEGER NOT NULL DEFAULT 0,
    invite_email INTEGER NOT NULL DEFAULT 1,
    result_email INTEGER NOT NULL DEFAULT 1,
    coach_email INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    room_id TEXT,
    mode TEXT NOT NULL DEFAULT 'friend',
    white_user_id TEXT,
    black_user_id TEXT,
    result TEXT NOT NULL,
    status TEXT NOT NULL,
    pgn TEXT,
    fen TEXT,
    winner_user_id TEXT,
    summary TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS games_room_id_idx ON games (room_id);
  CREATE INDEX IF NOT EXISTS games_white_user_idx ON games (white_user_id);
  CREATE INDEX IF NOT EXISTS games_black_user_idx ON games (black_user_id);
`);

function mapUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar || "",
    city: row.city,
    rating: row.rating,
    pro: Boolean(row.pro),
    notifications: {
      gameInvitations: Boolean(row.invite_email),
      gameResults: Boolean(row.result_email),
      coachTips: Boolean(row.coach_email),
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGame(row) {
  return {
    id: row.id,
    roomId: row.room_id,
    mode: row.mode,
    result: row.result,
    status: row.status,
    pgn: row.pgn || "",
    fen: row.fen || "",
    summary: row.summary || "",
    winnerUserId: row.winner_user_id,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    white: {
      id: row.white_user_id,
      name: row.white_name || "White",
    },
    black: {
      id: row.black_user_id,
      name: row.black_name || "Black",
    },
  };
}

export function findUserById(id) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return mapUser(row);
}

export function findUserByEmail(email) {
  const row = db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email);
  return mapUser(row);
}

export function findUserByEmailWithPassword(email) {
  return db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email);
}

export function findUserByGoogleId(googleId) {
  const row = db.prepare("SELECT * FROM users WHERE google_id = ?").get(googleId);
  return mapUser(row);
}

export function createUser(input) {
  const id = input.id || randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users (
      id, email, password_hash, google_id, name, avatar, city, rating, pro,
      invite_email, result_email, coach_email, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.email,
    input.passwordHash || null,
    input.googleId || null,
    input.name,
    input.avatar || "",
    input.city || "Almaty",
    input.rating ?? null,
    input.pro ? 1 : 0,
    input.notifications?.gameInvitations === false ? 0 : 1,
    input.notifications?.gameResults === false ? 0 : 1,
    input.notifications?.coachTips ? 1 : 0,
    now,
    now,
  );
  return findUserById(id);
}

export function updateUserProfile(userId, input) {
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!existing) return null;

  const next = {
    name: input.name ?? existing.name,
    avatar: input.avatar ?? existing.avatar,
    city: input.city ?? existing.city,
    rating: input.rating ?? existing.rating,
    pro: input.pro ?? Boolean(existing.pro),
    invite: input.notifications?.gameInvitations ?? Boolean(existing.invite_email),
    result: input.notifications?.gameResults ?? Boolean(existing.result_email),
    coach: input.notifications?.coachTips ?? Boolean(existing.coach_email),
  };

  db.prepare(`
    UPDATE users
    SET name = ?, avatar = ?, city = ?, rating = ?, pro = ?, invite_email = ?, result_email = ?, coach_email = ?, updated_at = ?
    WHERE id = ?
  `).run(
    next.name,
    next.avatar || "",
    next.city,
    next.rating ?? null,
    next.pro ? 1 : 0,
    next.invite ? 1 : 0,
    next.result ? 1 : 0,
    next.coach ? 1 : 0,
    new Date().toISOString(),
    userId,
  );

  return findUserById(userId);
}

export function upsertGoogleUser(input) {
  const existingByGoogleId = db.prepare("SELECT * FROM users WHERE google_id = ?").get(input.googleId);
  if (existingByGoogleId) {
    db.prepare(`
      UPDATE users
      SET email = ?, name = ?, avatar = ?, city = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.email,
      input.name,
      input.avatar || existingByGoogleId.avatar || "",
      input.city || existingByGoogleId.city,
      new Date().toISOString(),
      existingByGoogleId.id,
    );
    return { user: findUserById(existingByGoogleId.id), created: false };
  }

  const existingByEmail = db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(input.email);
  if (existingByEmail) {
    db.prepare(`
      UPDATE users
      SET google_id = ?, name = ?, avatar = ?, updated_at = ?
      WHERE id = ?
    `).run(
      input.googleId,
      input.name || existingByEmail.name,
      input.avatar || existingByEmail.avatar || "",
      new Date().toISOString(),
      existingByEmail.id,
    );
    return { user: findUserById(existingByEmail.id), created: false };
  }

  return {
    user: createUser({
      email: input.email,
      googleId: input.googleId,
      name: input.name,
      avatar: input.avatar || "",
      city: input.city || "Almaty",
      passwordHash: null,
      notifications: {
        gameInvitations: true,
        gameResults: true,
        coachTips: false,
      },
    }),
    created: true,
  };
}

export function createGameRecord(input) {
  const id = input.id || randomUUID();
  const createdAt = input.createdAt || new Date().toISOString();
  const finishedAt = input.finishedAt || new Date().toISOString();
  db.prepare(`
    INSERT INTO games (
      id, room_id, mode, white_user_id, black_user_id, result, status, pgn, fen,
      winner_user_id, summary, created_at, finished_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.roomId || null,
    input.mode || "friend",
    input.whiteUserId || null,
    input.blackUserId || null,
    input.result,
    input.status,
    input.pgn || "",
    input.fen || "",
    input.winnerUserId || null,
    input.summary || "",
    createdAt,
    finishedAt,
  );

  return id;
}

export function listHistoryForUser(userId) {
  const rows = db.prepare(`
    SELECT
      g.*,
      white.name AS white_name,
      black.name AS black_name
    FROM games g
    LEFT JOIN users white ON white.id = g.white_user_id
    LEFT JOIN users black ON black.id = g.black_user_id
    WHERE g.white_user_id = ? OR g.black_user_id = ?
    ORDER BY g.finished_at DESC
    LIMIT 50
  `).all(userId, userId);

  return rows.map(mapGame);
}

export function getUserEmailPreferences(email) {
  const row = db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email);
  return mapUser(row);
}

export function getRawUser(userId) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}
