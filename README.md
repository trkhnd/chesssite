# Chess Master

Chess Master is a modern chess platform with a React frontend and a Node.js backend. It includes server-backed authentication, live multiplayer rooms over Socket.IO, backend game history, notification settings, email delivery, and a stronger Stockfish-assisted coach flow.

## Features

- Email/password authentication with backend validation
- Secure session cookie and protected app access
- Dedicated play lobby with mode selection and timer cards
- Time controls: Bullet, Blitz, Rapid, Classical, and Custom
- Separate game page with clocks, move history, board controls, and coach panel
- One-device 1v1 mode with optional board auto-rotation
- Real `Play with Friend` room links at `/play/room/:roomId`
- Live multiplayer with automatic white/black assignment
- Legal move validation on both client and server with `chess.js`
- Game history persisted in the backend
- Email notifications for invites, results, sign-in notices, and coach tips
- Notification preferences for invitations, results, and coach emails
- AI play, puzzles, academy, community hub, city leaderboard, and themes
- City-aware community suggestions with 2GIS search links
- Stockfish-assisted coach with fallback heuristics, evaluation, best move, and difficulty modes
- Responsive layout for phone, tablet, and desktop

## Tech Stack

- Frontend: React 19, TypeScript, Vite, `chess.js`, Socket.IO client
- Backend: Express, Socket.IO, JWT cookie auth, Nodemailer
- Persistence: SQLite via `better-sqlite3`
- Optional integrations: Google OAuth, Gmail SMTP, Stripe payment link

## Project Structure

```text
src/               Frontend app, API client, sockets, Stockfish worker integration
server/            Express API, Socket.IO server, auth, rooms, email, SQLite store
public/stockfish/  Browser Stockfish assets
data/              Local SQLite database (created at runtime, gitignored)
```

## Installation

```bash
npm install
cp .env.example .env
```

## Environment Variables

Create a `.env` file from `.env.example`.

```env
PORT=4000
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:4000
CORS_EXTRA_ORIGINS=https://chesssite-ochre.vercel.app
DATABASE_URL=./data/chess-master.db
JWT_SECRET=change-me
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EMAIL_USER=
EMAIL_PASS=
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
VITE_API_URL=http://localhost:4000
VITE_STRIPE_PAYMENT_LINK=
```

Notes:

- `DATABASE_URL` can be a plain file path such as `./data/chess-master.db` or a `file:` path.
- `JWT_SECRET` must be replaced in production.
- `VITE_API_URL` is the frontend runtime base URL for the backend. In local development it should point to your local API, and in Vercel it should point to your deployed backend.
- `CLIENT_URL` is the frontend origin that the backend allows for CORS and cookie auth.
- `CORS_EXTRA_ORIGINS` can hold a comma-separated list of additional allowed frontend origins.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are optional. The frontend now uses email/password auth by default, and Google should only be re-enabled if the backend OAuth flow is configured and tested.
- If you use Gmail SMTP, use a Gmail App Password, not your normal Gmail password.

## Running Locally

Run both frontend and backend together:

```bash
npm run dev
```

`npm run dev` starts:

- `vite` for the frontend
- `node --watch-path=server server/index.js` for the backend

If the frontend port is already busy, Vite will move to the next free port and print the correct localhost URL in the terminal. When that happens, update `CLIENT_URL` in `.env` to match the port you actually use, or restart after freeing the preferred port.

Run them separately if needed:

```bash
npm run dev:client
npm run dev:server
```

Production-style frontend build:

```bash
npm run build
```

Start the backend without file watching:

```bash
npm run start:server
```

## Authentication Flow

- New users create an account with name, email, password, and city.
- Existing users log in with email and password.
- Passwords are hashed with `bcryptjs` before storage.
- A signed session cookie (`cm_session`) is set by the backend and sent automatically by the browser on future requests.
- In production, the cookie uses `SameSite=None` and `Secure=true` so a Vercel frontend can authenticate against a separately deployed backend.
- On page refresh, the frontend calls `/api/auth/me` to restore the session.
- Private app areas are only rendered after a valid session is present.
- Logging out clears the session cookie and returns the user to the landing/auth screen.

## API Configuration

The frontend API layer reads the backend URL from `VITE_API_URL`.

Examples:

- local frontend -> local backend
  - `VITE_API_URL=http://localhost:4000`
- Vercel frontend -> Render backend
  - `VITE_API_URL=https://your-backend.onrender.com`

The frontend now builds requests like:

```ts
fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
  credentials: "include",
});
```

If `VITE_API_URL` is empty, the app falls back to same-origin relative requests for local proxy-style development.

## Available Game Modes

- `Play vs AI`
  - Uses the selected clock and current AI strength
- `Play on one device`
  - Two local players share one screen
  - Optional board auto-rotation after every legal move
- `Play vs Friend online`
  - Creates a live room link with automatic white/black assignment
  - Uses Socket.IO for move sync and room state updates

## Timer Controls

The play lobby includes preset time controls:

- Bullet: `1+0`, `2+1`
- Blitz: `3+0`, `3+2`, `5+0`
- Rapid: `10+0`, `15+10`
- Classical: `30+0`
- Custom: choose your own minutes and increment

Timer behavior:

- The active player's clock runs
- Increment is added after a legal move
- If a clock reaches zero, the opponent wins on time
- Restart resets board, timers, and move history

## One-Device Mode

`Play on one device` is a local pass-and-play mode:

- White starts with the normal board orientation
- If auto-rotate is enabled, the board rotates after each legal move so the side to move sees their pieces from their own side
- Move history and clocks remain active

## City / 2GIS Community Layer

- The selected profile city also drives:
  - leaderboard focus
  - community suggestions
  - 2GIS club search links
- Community entries are presented as suggested searches, not verified official claims
- Example flow:
  - choose `Almaty`
  - open a suggested 2GIS search for `шахматный клуб Алматы`

## AI Coach

The coach now works in two layers:

- `Stockfish mode`
  - best move
  - evaluation score
  - tactical / positional guidance when the worker is available
- `Fallback coach mode`
  - used automatically if Stockfish is unavailable
  - looks at king safety, development, center control, captures, checks, and opening habits

Coach levels:

- Beginner
- Intermediate
- Advanced

Coach surfaces:

- dedicated `Coach` page
- coach panel beside the board on the game page

## Google OAuth Setup

Google auth is optional and currently hidden in the default UI until the backend OAuth flow is configured and verified.

1. Create OAuth credentials in Google Cloud.
2. Add `http://localhost:5173` to authorized JavaScript origins.
3. Add `postmessage` support by keeping the backend code-exchange flow unchanged.
4. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` into `.env`.

## Email Setup

The backend uses a reusable Nodemailer service in `server/email/service.js`.

Emails currently cover:

- welcome email after account creation
- sign-in notice
- friend room invitation
- game result notification
- coach tip notification

If SMTP fails, the app logs the error and continues without crashing.

## Deployment

Recommended production setup:

1. Deploy the backend on a stable URL and set `SERVER_URL`.
2. Deploy the frontend on `CLIENT_URL`.
3. Keep frontend and backend on the same parent domain if possible.
4. Set a strong `JWT_SECRET`.
5. Configure Google OAuth production origins.
6. Configure a real SMTP provider or Gmail App Password.

### Deploy Frontend on Vercel

Set this environment variable in Vercel:

```env
VITE_API_URL=https://your-backend-url.com
```

Then redeploy the frontend. After that, no frontend API request should point to `localhost`.

### Deploy Backend on Render

Suggested backend environment variables:

```env
PORT=5000
CLIENT_URL=https://chesssite-ochre.vercel.app
SERVER_URL=https://your-backend-url.com
CORS_EXTRA_ORIGINS=
DATABASE_URL=./data/chess-master.db
JWT_SECRET=replace-this
```

Backend deployment checklist:

- backend must listen on `process.env.PORT`
- `CLIENT_URL` must match the deployed frontend origin
- cookies require HTTPS in production
- if you use preview deployments, add them to `CORS_EXTRA_ORIGINS`

### Common Deployment Errors

- `Network error`
  - `VITE_API_URL` is missing or points to the wrong backend
  - backend deployment is down
- `Server unavailable`
  - backend returned a 5xx error or could not be reached
- auth works locally but not in production
  - `CLIENT_URL` does not match the real frontend URL
  - production cookies need HTTPS
  - cross-origin deployments need `SameSite=None`
7. Put the app behind HTTPS so secure cookies work properly.

## Current Notes

- The backend stores data locally in SQLite by default.
- Multiplayer room state is kept in memory while the server is running.
- Friend game results are persisted to history when the game finishes.
- The existing frontend structure is still centered in `src/App.tsx`, but the network logic has been moved into reusable client helpers under `src/lib/`.
- Friend clocks are synchronized through room state updates while the room is active.
- Community club cards are suggestion-driven and intentionally open 2GIS searches instead of claiming unverified official listings.

## Common Errors And Fixes

- `This email is already registered.`
  - Use the login form instead of sign-up, or choose another email.

- `Invalid email or password.`
  - Double-check the exact email used during registration and make sure the password has not changed.

- `Authentication required.`
  - Your session expired or the backend was restarted. Log in again.

- Login works in one port but not another
  - Make sure the frontend URL matches the backend CORS allowlist. In local development, keep `CLIENT_URL` aligned with the actual Vite port.

- Gmail SMTP does not send mail
  - Use a Gmail App Password, not your normal Gmail password.
