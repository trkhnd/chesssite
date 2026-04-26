# Chess Master

A level 4 modern chess web platform prototype: playable chess, AI opponent, Firebase-ready auth, Elo placement quiz, Stockfish coach, puzzle gym, learning academy, saved history, shareable friend rooms, community hub, city leaderboard, profile persistence, responsive design, light/dark themes, and a Stripe-ready Pro screen.

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Features

- Human vs AI chess with Easy, Club, and Stockfish-backed Master bot levels
- Premium home dashboard
- Prototype login/signup modal with saved-account validation
- Elo placement quiz instead of a random starting level
- Legal chess moves powered by `chess.js`
- Simple tactical AI with captures, checks, center control, and promotion scoring
- Live move history and captured pieces
- Puzzle training page
- Puzzle generator after the current set is solved
- Learning academy page
- YouTube learning resources
- Community hub page
- Rich city leaderboard page with city stats
- Cleaner fixed-size chessboard with edge coordinates
- Post-game AI Coach report
- Local profile with name, city, Elo, and Pro status
- Saved game archive using local storage
- Shareable friend room links using Firestore when Firebase is configured, with local BroadcastChannel fallback
- City leaderboard, including the current player
- Upgrade to Pro screen for monetization storytelling
- Responsive layout for mobile and desktop
- Light/dark theme

## How to test multiplayer

1. Run the app.
2. Click `Friend`.
3. Copy the room link.
4. Open the link in another tab or browser window.
5. Moves are synced between both tabs through the browser's `BroadcastChannel`.

## Production upgrades

1. Fill `.env` from `.env.example` for Firebase Auth and Firestore.
2. Deploy with Firebase Hosting or Vercel.
3. Connect the Pro button to Stripe Checkout.
4. Add PGN import/export and deeper coach analysis.

## Public deployment

See [docs/deploy.md](docs/deploy.md).
