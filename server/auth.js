import cookie from "cookie";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export const SESSION_COOKIE = "cm_session";

function cookieOptions() {
  const isProduction = config.nodeEnv === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  };
}

export function signSession(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
    },
    config.jwtSecret,
    { expiresIn: "7d" },
  );
}

export function signSocketSession(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      scope: "socket",
    },
    config.jwtSecret,
    { expiresIn: "12h" },
  );
}

function readSessionToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return {
      session: {
        userId: payload.sub,
        email: payload.email,
        name: payload.name,
      },
      reason: null,
    };
  } catch (error) {
    return {
      session: null,
      reason:
        error && typeof error === "object" && "name" in error && error.name === "TokenExpiredError"
          ? "expired"
          : "invalid",
    };
  }
}

export function verifySessionToken(token) {
  return readSessionToken(token).session;
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

function getBearerTokenFromRequest(req) {
  const header = req.headers?.authorization;
  if (typeof header !== "string") return "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export function getSessionFromRequest(req) {
  const token = getBearerTokenFromRequest(req) || req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token);
}

function getSessionStateFromRequest(req) {
  const token = getBearerTokenFromRequest(req) || req.cookies?.[SESSION_COOKIE];
  if (!token) return { session: null, reason: "missing" };
  return readSessionToken(token);
}

export function requireAuth(req, res, next) {
  const { session, reason } = getSessionStateFromRequest(req);
  if (!session) {
    res.status(401).json({
      error: reason === "expired" ? "Session expired. Please log in again." : "Please log in to continue.",
    });
    return;
  }

  req.session = session;
  next();
}

export function getSessionFromSocket(socket) {
  const authToken =
    typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
  if (authToken) {
    const authSession = verifySessionToken(authToken);
    if (authSession) return authSession;
  }

  const header = socket.handshake.headers.cookie || "";
  const cookies = cookie.parse(header);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token);
}
