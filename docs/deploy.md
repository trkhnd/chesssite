# Deploy Chess Master Publicly

## 1. Create Firebase

1. Create a Firebase project.
2. Enable Authentication with Email/Password.
3. Create a Firestore database.
4. Add a Web App and copy the Firebase config.

## 2. Configure environment

Copy `.env.example` to `.env` and fill:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## 3. Run locally with cloud auth

```bash
npm install
npm run dev
```

When these keys exist, Chess Master uses Firebase Auth and Firestore rooms. Without keys, it safely falls back to local auth and same-browser rooms.

## 4. Deploy

```bash
npm run build
firebase deploy
```

After deployment, friend links work across Chrome, Safari, phones, and other devices because room state is stored in Firestore.
