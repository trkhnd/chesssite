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

export function verifySessionToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    return {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, cookieOptions());
}

export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
}

export function getSessionFromRequest(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token);
}

export function requireAuth(req, res, next) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  req.session = session;
  next();
}

export function getSessionFromSocket(socket) {
  const header = socket.handshake.headers.cookie || "";
  const cookies = cookie.parse(header);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  return verifySessionToken(token);
}
