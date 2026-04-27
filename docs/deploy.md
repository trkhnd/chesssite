# Deploy Chess Master Publicly

## Architecture

- Frontend: Vite/React build output
- Backend: Express + Socket.IO server
- Database: SQLite by default
- Auth: backend email/password plus Google OAuth
- Email: Nodemailer with Gmail SMTP or another SMTP provider

## 1. Prepare Environment

Copy `.env.example` to `.env` and fill the production values:

```bash
PORT=4000
CLIENT_URL=https://your-frontend-domain.com
SERVER_URL=https://your-backend-domain.com
DATABASE_URL=./data/chess-master.db
JWT_SECRET=replace-with-a-long-random-secret
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EMAIL_USER=
EMAIL_PASS=
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=465
EMAIL_SECURE=true
VITE_STRIPE_PAYMENT_LINK=
```

If you use Gmail SMTP, generate a Gmail App Password. Do not use your normal Gmail password.

## 2. Google OAuth

1. Create OAuth credentials in Google Cloud.
2. Add your frontend domain to authorized JavaScript origins.
3. Keep the backend code-exchange flow enabled with the configured client ID and secret.

## 3. Build Frontend

```bash
npm install
npm run build
```

Serve the `dist/` folder from your frontend host or CDN.

## 4. Start Backend

```bash
npm run start:server
```

The backend must stay reachable at `SERVER_URL` for:

- `/api/*` authentication and profile routes
- `/socket.io` multiplayer rooms
- email invitation and result notifications

## 5. Production Notes

- Use HTTPS so secure cookies work properly.
- Keep frontend and backend on the same parent domain if possible.
- Persist the `data/` directory or replace SQLite with your production database strategy.
- Use a process manager such as PM2, Docker, Fly.io, Railway, or Render for the backend.
- Add reverse-proxy rules for `/api` and `/socket.io` if frontend and backend are served behind one domain.
