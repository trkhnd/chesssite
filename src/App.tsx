import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Color, Move, PieceSymbol, Square } from "chess.js";
import {
  BadgeDollarSign,
  BookOpen,
  Brain,
  CheckCircle2,
  Copy,
  Crown,
  Database,
  Dumbbell,
  Eye,
  EyeOff,
  ExternalLink,
  Flame,
  History,
  KeyRound,
  Languages,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Newspaper,
  Palette,
  Play,
  RefreshCcw,
  Save,
  Shield,
  Sparkles,
  Sun,
  Swords,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import {
  createFriendRoom,
  getHistory,
  getSession,
  loginUser,
  logoutUser,
  patchProfile,
  registerUser,
  saveHistory,
  sendCoachTipEmail,
  sendRoomInvite,
  type ApiUser,
  type NotificationSettings,
  type RoomState,
} from "./lib/api";
import { getSocket } from "./lib/socket";
import { analyzeFen, canUseStockfish, type StockfishAnalysis } from "./lib/stockfish";

type BoardSquare = {
  square: Square;
  piece: {
    color: Color;
    type: PieceSymbol;
  } | null;
};

type GameMode = "ai" | "friend";
type LocalGameMode = "ai" | "friend" | "local";
type AiLevel = "easy" | "medium" | "pro";
type CoachMode = "beginner" | "intermediate" | "advanced";
type ThemeName = "classic" | "midnight" | "royal" | "carbon";
type Language = "en" | "ru";
type View = "home" | "play" | "game" | "puzzles" | "learn" | "coach" | "history" | "community" | "leaderboard" | "pro";

type TimeControl = {
  id: string;
  label: string;
  category: "Bullet" | "Blitz" | "Rapid" | "Classical" | "Custom";
  minutes: number;
  incrementSeconds: number;
};

type Profile = {
  id?: string;
  name: string;
  city: string;
  rating: number | null;
  pro: boolean;
  email: string;
  avatar: string;
  notifications: NotificationSettings;
  signedIn: boolean;
};

type AuthFormState = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  city: string;
};

type AuthFieldErrors = Partial<Record<keyof AuthFormState, string>> & {
  form?: string;
};

type SavedGame = {
  id: string;
  date: string;
  mode: LocalGameMode;
  result: string;
  moves: string[];
  pgn: string;
  coach: CoachInsight[];
  city: string;
  reviewScore: number | null;
};

type CoachInsight = {
  tone: "good" | "warning" | "pro";
  title: string;
  text: string;
};

type Puzzle = {
  title: string;
  fen: string;
  theme: string;
  rating: number;
  goal: string;
  solution: {
    from: Square;
    to: Square;
    san: string;
  };
};

type CommunityDetail = {
  title: string;
  tag: string;
  meta: string;
  description: string;
  schedule: string;
  prize: string;
  action: string;
};

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

const copy = {
  en: {
    play: "Play",
    puzzles: "Puzzles",
    learn: "Learn",
    coach: "Coach",
    history: "History",
    community: "Community",
    cities: "Cities",
    pro: "Pro",
    home: "Home",
    preferences: "Preferences",
    theme: "Theme",
    language: "Language",
    classic: "Classic",
    midnight: "Midnight",
    royal: "Royal",
    carbon: "Carbon",
    clubhouse: "Clubhouse",
    communityHub: "Community hub",
    hostRoom: "Host room",
    backCommunity: "Back to community",
    joinNow: "Join now",
    openRoom: "Open room",
    participants: "Participants",
    schedule: "Schedule",
    prize: "Reward",
    masterDigest: "Master Digest",
    currentRoom: "Current room",
    settingsSaved: "Preferences saved.",
  },
  ru: {
    play: "Играть",
    puzzles: "Задачи",
    learn: "Обучение",
    coach: "Тренер",
    history: "История",
    community: "Сообщество",
    cities: "Города",
    pro: "Pro",
    home: "Главная",
    preferences: "Настройки",
    theme: "Тема",
    language: "Язык",
    classic: "Классика",
    midnight: "Ночь",
    royal: "Королевская",
    carbon: "Карбон",
    clubhouse: "Клуб",
    communityHub: "Центр сообщества",
    hostRoom: "Создать комнату",
    backCommunity: "Назад",
    joinNow: "Присоединиться",
    openRoom: "Открыть комнату",
    participants: "Участники",
    schedule: "Расписание",
    prize: "Награда",
    masterDigest: "Дайджест Master",
    currentRoom: "Текущая комната",
    settingsSaved: "Настройки сохранены.",
  },
} satisfies Record<Language, Record<string, string>>;

const themeOptions: Array<{ id: ThemeName; labelKey: string; description: string }> = [
  { id: "classic", labelKey: "classic", description: "Clean bright tournament hall" },
  { id: "midnight", labelKey: "midnight", description: "Focused dark analysis room" },
  { id: "royal", labelKey: "royal", description: "Premium deep green and gold" },
  { id: "carbon", labelKey: "carbon", description: "Modern black studio with amber accents" },
];

function normalizeTheme(value: unknown): ThemeName {
  if (value === "light") return "classic";
  if (value === "dark") return "midnight";
  if (value === "classic" || value === "midnight" || value === "royal" || value === "carbon") return value;
  return "midnight";
}

const pieceIcons: Record<string, string> = {
  wk: "♔",
  wq: "♕",
  wr: "♖",
  wb: "♗",
  wn: "♘",
  wp: "♙",
  bk: "♚",
  bq: "♛",
  br: "♜",
  bb: "♝",
  bn: "♞",
  bp: "♟",
};

const pieceValues: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

const aiProfiles: Record<AiLevel, { name: string; rating: number; style: string; depth: string }> = {
  easy: {
    name: "Easy Bot",
    rating: 700,
    style: "Makes human mistakes and sometimes misses tactics.",
    depth: "1-ply casual",
  },
  medium: {
    name: "Club Bot",
    rating: 1350,
    style: "Looks for checks, captures, center control, and promotions.",
    depth: "Tactical scoring",
  },
  pro: {
    name: "Master Bot",
    rating: 2050,
    style: "Uses Stockfish when available and falls back to lookahead.",
    depth: "Stockfish depth 11",
  },
};

const timeControlGroups: Array<{ category: TimeControl["category"]; options: TimeControl[] }> = [
  {
    category: "Bullet",
    options: [
      { id: "bullet-1-0", label: "1+0", category: "Bullet", minutes: 1, incrementSeconds: 0 },
      { id: "bullet-2-1", label: "2+1", category: "Bullet", minutes: 2, incrementSeconds: 1 },
    ],
  },
  {
    category: "Blitz",
    options: [
      { id: "blitz-3-0", label: "3+0", category: "Blitz", minutes: 3, incrementSeconds: 0 },
      { id: "blitz-3-2", label: "3+2", category: "Blitz", minutes: 3, incrementSeconds: 2 },
      { id: "blitz-5-0", label: "5+0", category: "Blitz", minutes: 5, incrementSeconds: 0 },
    ],
  },
  {
    category: "Rapid",
    options: [
      { id: "rapid-10-0", label: "10+0", category: "Rapid", minutes: 10, incrementSeconds: 0 },
      { id: "rapid-15-10", label: "15+10", category: "Rapid", minutes: 15, incrementSeconds: 10 },
    ],
  },
  {
    category: "Classical",
    options: [{ id: "classical-30-0", label: "30+0", category: "Classical", minutes: 30, incrementSeconds: 0 }],
  },
];

const defaultTimeControl: TimeControl = { id: "rapid-10-0", label: "10+0", category: "Rapid", minutes: 10, incrementSeconds: 0 };

const starterLeaderboard = [
  { name: "Aruzhan", city: "Almaty", rating: 1840, streak: 9, winRate: 64, title: "CM" },
  { name: "Timur", city: "Astana", rating: 1785, streak: 7, winRate: 61, title: "Arena" },
  { name: "Miras", city: "Shymkent", rating: 1710, streak: 6, winRate: 59, title: "Rapid" },
  { name: "Dana", city: "Almaty", rating: 1665, streak: 5, winRate: 57, title: "Coach" },
  { name: "Ayan", city: "Karaganda", rating: 1604, streak: 4, winRate: 55, title: "Blitz" },
];

const defaultProfile: Profile = {
  name: "Guest Player",
  city: "Almaty",
  rating: null,
  pro: false,
  email: "",
  avatar: "",
  notifications: {
    gameInvitations: true,
    gameResults: true,
    coachTips: false,
  },
  signedIn: false,
};

const quizQuestions = [
  {
    question: "How often do you play chess?",
    options: [
      { label: "Rarely", points: 0 },
      { label: "Weekly", points: 120 },
      { label: "Almost daily", points: 240 },
    ],
  },
  {
    question: "Can you reliably spot forks, pins, and skewers?",
    options: [
      { label: "Not yet", points: 0 },
      { label: "Sometimes", points: 130 },
      { label: "Yes", points: 260 },
    ],
  },
  {
    question: "Do you know opening principles without memorizing lines?",
    options: [
      { label: "No", points: 0 },
      { label: "Basic ideas", points: 110 },
      { label: "Confident", points: 220 },
    ],
  },
  {
    question: "How often do you blunder a piece in one move?",
    options: [
      { label: "Often", points: 0 },
      { label: "Sometimes", points: 120 },
      { label: "Rarely", points: 260 },
    ],
  },
  {
    question: "Can you convert a king and pawn endgame?",
    options: [
      { label: "No", points: 0 },
      { label: "Some positions", points: 120 },
      { label: "Usually", points: 240 },
    ],
  },
];

const lessons = [
  { title: "Opening foundations", level: "Beginner", progress: 70, duration: "18 min", modules: 6, text: "Build center control, develop pieces, and castle before launching attacks." },
  { title: "Tactical vision", level: "Intermediate", progress: 42, duration: "26 min", modules: 9, text: "Train forks, pins, skewers, discovered attacks, and overloaded defenders." },
  { title: "Endgame conversion", level: "Advanced", progress: 24, duration: "31 min", modules: 8, text: "Turn extra material into wins with king activity and clean pawn technique." },
  { title: "Calculation discipline", level: "Advanced", progress: 12, duration: "22 min", modules: 7, text: "Compare candidate moves without rushing into the first attractive tactic." },
];

const youtubeLessons = [
  {
    title: "Saint Louis Chess Club beginner lessons",
    level: "Beginner",
    url: "https://saintlouischessclub.org/education/learn/beginner-chess-lessons/",
    text: "Structured beginner videos and club lessons for fundamentals.",
  },
  {
    title: "Chess.com YouTube",
    level: "All levels",
    url: "https://www.youtube.com/@chess",
    text: "Tactics, games, news, and lesson-style videos from Chess.com.",
  },
  {
    title: "Daniel Naroditsky speedrun lessons",
    level: "Intermediate",
    url: "https://www.youtube.com/@DanielNaroditskyGM",
    text: "Clear practical explanations from opening to endgame decisions.",
  },
  {
    title: "Hanging Pawns openings",
    level: "Opening prep",
    url: "https://www.youtube.com/@HangingPawns",
    text: "Detailed opening plans and pawn-structure explanations.",
  },
];

const puzzles: Puzzle[] = [
  {
    title: "Back rank alarm",
    fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",
    theme: "Mate",
    rating: 900,
    goal: "White to move. Find the checkmate on the back rank.",
    solution: { from: "e1", to: "e8", san: "Re8#" },
  },
  {
    title: "Win the queen",
    fen: "6k1/5ppp/8/8/3q4/2N5/5PPP/3Q2K1 w - - 0 1",
    theme: "Fork",
    rating: 1250,
    goal: "White to move. Use the knight fork to attack king and queen.",
    solution: { from: "c3", to: "b5", san: "Nb5" },
  },
  {
    title: "Endgame squeeze",
    fen: "8/5pk1/6p1/4P3/4KPPP/8/8/8 w - - 0 1",
    theme: "Endgame",
    rating: 1320,
    goal: "White to move. Activate the king and keep opposition.",
    solution: { from: "e4", to: "d5", san: "Kd5" },
  },
];

const generatedPuzzleBank: Puzzle[] = [
  {
    title: "Rook lift mate",
    fen: "6k1/6pp/8/8/8/8/6PP/5RK1 w - - 0 1",
    theme: "Mate",
    rating: 980,
    goal: "White to move. Use the rook to finish the exposed king.",
    solution: { from: "f1", to: "f8", san: "Rf8#" },
  },
  {
    title: "Royal fork",
    fen: "4k3/8/8/8/3q4/8/4N3/4K3 w - - 0 1",
    theme: "Fork",
    rating: 1180,
    goal: "White to move. Find the knight fork that attacks king and queen.",
    solution: { from: "e2", to: "c3", san: "Nc3+" },
  },
  {
    title: "Passed pawn route",
    fen: "8/8/5k2/4p3/4P3/5K2/8/8 w - - 0 1",
    theme: "Endgame",
    rating: 1100,
    goal: "White to move. Step into the opposition path.",
    solution: { from: "f3", to: "e3", san: "Ke3" },
  },
];

const communityPosts = [
  {
    title: "Almaty Friday Arena",
    meta: "42 players registered",
    tag: "Tournament",
    action: "Join arena",
    description: "A weekly rapid arena for local players. Play five rounds, collect points, and appear on the city board.",
    schedule: "Friday 20:00 · 10+0 rapid",
    prize: "+35 city points and Pro skin raffle",
  },
  {
    title: "How I crossed 1600 in 30 days",
    meta: "Dana shared a study plan",
    tag: "Guide",
    action: "Read guide",
    description: "A practical improvement plan with daily tactics, opening review, and one annotated rapid game per day.",
    schedule: "10 minute read · includes study checklist",
    prize: "Save guide to your academy path",
  },
  {
    title: "Looking for rapid sparring partners",
    meta: "5 active rooms",
    tag: "Clubs",
    action: "Find players",
    description: "Find players near your level, open a room, and analyze the game together after it ends.",
    schedule: "Live now · 400-1800 Elo",
    prize: "Friendly match history and coach review",
  },
];

const legends = [
  {
    name: "Magnus Carlsen",
    role: "World Champion",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Magnus_Carlsen_in_2023.jpg",
    message: "Enjoy the fight. The best players stay curious even in quiet positions.",
    action: "Train calculation",
  },
  {
    name: "Judit Polgar",
    role: "Attacking legend",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Judit_Polgar.jpg",
    message: "Play actively. Initiative can be worth more than comfort.",
    action: "Open tactics",
  },
  {
    name: "Garry Kasparov",
    role: "World Champion",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Garry_Kasparov_IMG_0130.JPG",
    message: "Preparation creates confidence. Review, improve, repeat.",
    action: "Analyze game",
  },
];

const communityWisdom = [
  { player: "Emanuel Lasker", text: "When you see a good move, look for a better one." },
  { player: "Bobby Fischer", text: "Tactics flow from a superior position." },
  { player: "Anatoly Karpov", text: "Small advantages become victories through patience." },
];

const chessReportLinks = [
  {
    title: "FIDE News",
    source: "Official chess federation reports",
    url: "https://www.fide.com/news",
  },
  {
    title: "ChessBase News",
    source: "Tournament reports and analysis",
    url: "https://en.chessbase.com/",
  },
  {
    title: "Chess.com News",
    source: "Events, interviews, and game reports",
    url: "https://www.chess.com/news",
  },
  {
    title: "Lichess Blog",
    source: "Community studies and chess culture",
    url: "https://lichess.org/blog",
  },
];

const coachTimeline = [
  { label: "Opening", score: 74, text: "Develop minor pieces and avoid moving the queen too early." },
  { label: "Middlegame", score: 68, text: "Before attacking, identify loose pieces and forcing moves." },
  { label: "Endgame", score: 62, text: "Centralize your king and create outside passed pawns." },
];

const cityStats = [
  { city: "Almaty", players: 2480, avg: 1320, active: 312 },
  { city: "Astana", players: 1910, avg: 1295, active: 224 },
  { city: "Shymkent", players: 1080, avg: 1210, active: 146 },
  { city: "Karaganda", players: 860, avg: 1188, active: 118 },
  { city: "Aktobe", players: 740, avg: 1150, active: 92 },
];

const chessBooks = [
  { title: "Bobby Fischer Teaches Chess", author: "Bobby Fischer", level: "Beginner", reason: "A direct pattern-building book for mates, tactics, and calculation discipline.", tag: "tactics" },
  { title: "My System", author: "Aron Nimzowitsch", level: "Intermediate", reason: "Teaches prophylaxis, blockades, pawn chains, and long-term positional thinking.", tag: "strategy" },
  { title: "Logical Chess: Move by Move", author: "Irving Chernev", level: "Beginner", reason: "Explains each move in plain language, which is ideal for learning plans.", tag: "strategy" },
  { title: "The Soviet Chess Primer", author: "Ilya Maizelis", level: "Beginner", reason: "A structured foundation covering tactics, endgames, and core planning habits.", tag: "openings" },
  { title: "Silman’s Complete Endgame Course", author: "Jeremy Silman", level: "Intermediate", reason: "A practical step-by-step route through the endgames players actually need.", tag: "endgame" },
  { title: "How to Reassess Your Chess", author: "Jeremy Silman", level: "Advanced", reason: "Sharpens imbalances, planning, and positional decision-making.", tag: "calculation" },
];

const cityClubSuggestions: Record<string, Array<{ name: string; address: string; hours: string; level: string; description: string; query: string; contact: string }>> = {
  Almaty: [
    { name: "Almaty Chess Circle", address: "Suggested 2GIS search · Abay Ave / Baitursynov area", hours: "Daily 10:00-22:00", level: "Beginner friendly", description: "Good for casual rapid sessions, beginner sparring, and after-work study games.", query: "шахматный клуб Алматы", contact: "Instagram / phone via 2GIS listing" },
    { name: "Esentai Rapid Club", address: "Suggested 2GIS search · Al-Farabi Ave area", hours: "Mon-Sat 12:00-21:00", level: "Competitive", description: "A stronger-player style suggestion for blitz nights, club ladders, and coach sessions.", query: "chess club Almaty", contact: "Message the club after opening the 2GIS search" },
  ],
  Astana: [
    { name: "Astana Chess Hub", address: "Suggested 2GIS search · Mangilik El Ave area", hours: "Daily 11:00-21:00", level: "Adults", description: "A practical option for rapid evenings, local meetups, and tournament preparation.", query: "шахматный клуб Астана", contact: "Check 2GIS for working contacts" },
    { name: "Capital Junior & Open Chess", address: "Suggested 2GIS search · Turan Ave area", hours: "Mon-Fri 09:00-20:00", level: "Kids", description: "Suitable for structured lessons, scholastic groups, and parent-friendly schedules.", query: "chess club Astana", contact: "School desk or listed club manager in 2GIS" },
  ],
  Shymkent: [
    { name: "Shymkent Chess Point", address: "Suggested 2GIS search · Tauke Khan Ave area", hours: "Daily 10:00-20:00", level: "Adults", description: "A community-style place for friendly rapid matches and steady training blocks.", query: "шахматный клуб Шымкент", contact: "See 2GIS search results" },
    { name: "South Tactics Studio", address: "Suggested 2GIS search · Respublika Ave area", hours: "Tue-Sun 12:00-21:00", level: "Competitive", description: "Useful for players who want sharper tactical sparring and weekend mini-events.", query: "chess club Shymkent", contact: "Use 2GIS contact card" },
  ],
  Karaganda: [
    { name: "Karaganda Chess League", address: "Suggested 2GIS search · Bukhar-Zhyrau Ave area", hours: "Mon-Sat 11:00-20:00", level: "Competitive", description: "Club-style atmosphere for rated-style training games and opening prep nights.", query: "шахматный клуб Караганда", contact: "Club page via 2GIS" },
    { name: "Central Board Room", address: "Suggested 2GIS search · Nurken Abdirov Ave area", hours: "Daily 10:00-21:00", level: "Beginner friendly", description: "A calmer learning environment with puzzle corners and casual rapid sessions.", query: "chess club Karaganda", contact: "Look up the current listing in 2GIS" },
  ],
  Aktobe: [
    { name: "Aktobe Chess Room", address: "Suggested 2GIS search · Abilkair Khan Ave area", hours: "Daily 11:00-20:00", level: "Adults", description: "A flexible local option for evening games, coach reviews, and ladder challenges.", query: "шахматный клуб Актобе", contact: "See 2GIS for active contact details" },
    { name: "West Kazakhstan Junior Chess", address: "Suggested 2GIS search · Sanken Nursylova area", hours: "Mon-Fri 09:00-19:00", level: "Kids", description: "More education-oriented, with junior groups and family-friendly hours.", query: "chess club Aktobe", contact: "2GIS listing or club social page" },
  ],
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function createBoard(game: Chess): BoardSquare[] {
  const board = game.board();
  const squares: BoardSquare[] = [];

  for (let rankIndex = 0; rankIndex < 8; rankIndex += 1) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const rank = 8 - rankIndex;
      const square = `${files[fileIndex]}${rank}` as Square;
      squares.push({ square, piece: board[rankIndex][fileIndex] });
    }
  }

  return squares;
}

function safeMove(game: Chess, from: Square, to: Square) {
  try {
    return game.move({ from, to, promotion: "q" });
  } catch {
    return null;
  }
}

function materialBalance(game: Chess) {
  return game.board().flat().reduce((score, piece) => {
    if (!piece) return score;
    const value = pieceValues[piece.type];
    return score + (piece.color === "b" ? value : -value);
  }, 0);
}

function scoreMove(game: Chess, move: Move) {
  let score = Math.random() * 0.18;
  if (move.captured) score += pieceValues[move.captured] * 2.6;
  if (move.promotion) score += pieceValues[move.promotion] + 3;
  if (["d4", "d5", "e4", "e5"].includes(move.to)) score += 0.8;

  const clone = new Chess(game.fen());
  clone.move(move);
  if (clone.isCheckmate()) score += 1000;
  if (clone.isCheck()) score += 2;
  if (clone.isDraw()) score -= 2;
  score += materialBalance(clone) * 0.25;
  return score;
}

function chooseAiMove(game: Chess, level: AiLevel): Move | null {
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return null;

  if (level === "easy") {
    const captures = moves.filter((move) => move.captured);
    const pool = captures.length > 0 && Math.random() > 0.58 ? captures : moves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  const scored = moves.map((move) => {
    let score = scoreMove(game, move);

    if (level === "pro") {
      const clone = new Chess(game.fen());
      clone.move(move);
      const replies = clone.moves({ verbose: true });
      const bestWhiteReply = replies.length > 0 ? Math.max(...replies.map((reply) => scoreMove(clone, reply))) : 0;
      score -= bestWhiteReply * 0.72;
    }

    return { move, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].move;
}

function findBestMove(game: Chess) {
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return null;
  return [...moves].sort((a, b) => scoreMove(game, b) - scoreMove(game, a))[0];
}

function explainMove(game: Chess, history: Move[]) {
  const best = findBestMove(game);
  if (!best) return "No legal move recommendation is available in this position.";
  const lastMove = history[history.length - 1];
  if (!lastMove) return `Try starting with ${best.san}. It follows checks, captures, and center control.`;
  return `Current candidate: ${best.san}. Last move was ${lastMove.san}; now compare checks, captures, and threats before moving.`;
}

function getCoachTimeline(history: Move[], game: Chess) {
  const castled = history.some((move) => move.color === "w" && ["O-O", "O-O-O"].includes(move.san));
  const checks = history.filter((move) => move.color === "w" && /[+#]/.test(move.san)).length;
  const captures = history.filter((move) => move.color === "w" && move.captured).length;
  const review = estimateReviewScore(history, game) ?? 62;
  return [
    {
      label: "Opening",
      score: Math.min(95, castled ? review + 8 : review - 8),
      text: castled ? "Good king safety. You found a castling window." : "Look for faster development and a safe castling moment.",
    },
    {
      label: "Middlegame",
      score: Math.min(95, 58 + checks * 8 + captures * 5),
      text: checks > 0 ? "You created forcing moves. Keep calculating the opponent's best reply." : "Add candidate checks and captures before quiet moves.",
    },
    {
      label: "Endgame",
      score: Math.min(92, 60 + Math.max(0, 14 - history.length)),
      text: "Trade when ahead, centralize the king, and avoid rushing pawn breaks.",
    },
  ];
}

function loadPuzzleGame(index: number, puzzleList = puzzles) {
  return new Chess(puzzleList[index].fen);
}

function isSameMove(move: Move, puzzle: Puzzle) {
  return move.from === puzzle.solution.from && move.to === puzzle.solution.to;
}

function getPuzzleHint(puzzle: Puzzle) {
  if (puzzle.theme === "Mate") return "Hint: look for a rook move that gives check along the open file.";
  if (puzzle.theme === "Fork") return "Hint: a knight can attack two important pieces at once.";
  return "Hint: in king and pawn endings, opposition and king activity decide everything.";
}

function finishPuzzleReply(game: Chess) {
  const reply = chooseAiMove(game, "medium");
  if (reply) game.move(reply);
}

function makePuzzleBoard(game: Chess) {
  return createBoard(game);
}

function getPuzzleStatus(game: Chess, solved: boolean) {
  if (solved) return "Solved";
  if (game.isCheckmate()) return "Checkmate";
  return "White to move";
}

function getAiLabel(level: AiLevel) {
  const profile = aiProfiles[level];
  return `${profile.name} · ${profile.rating}`;
}

function scorePositionAfterMove(game: Chess, move: Move) {
  const clone = new Chess(game.fen());
  clone.move(move);
  return materialBalance(clone);
}

function pickHumanMoveSuggestion(game: Chess) {
  const moves = game.moves({ verbose: true });
  if (moves.length === 0) return null;
  return [...moves].sort((a, b) => scorePositionAfterMove(game, b) - scorePositionAfterMove(game, a))[0];
}

function makeAiThinkingText(level: AiLevel, move: Move) {
  if (level === "easy") return `${aiProfiles[level].name} played ${move.san}. This bot can still miss tactics.`;
  if (level === "medium") return `${aiProfiles[level].name} chose ${move.san}, prioritizing tactics and center control.`;
  return `${aiProfiles[level].name} played ${move.san} after checking your strongest reply.`;
}

function isValidPuzzleMove(game: Chess, from: Square, to: Square) {
  try {
    return game.move({ from, to, promotion: "q" });
  } catch {
    return null;
  }
}

function playUciMove(game: Chess, uci: string | null) {
  if (!uci || uci.length < 4) return null;
  return game.move({
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: (uci[4] || "q") as "q" | "r" | "b" | "n",
  });
}

function getLessonBoost(title: string) {
  if (title.includes("Opening")) return "Your opening module now recommends: develop knights before moving the queen.";
  if (title.includes("Tactical")) return "Tactical trainer unlocked a fork/pin mini-set.";
  if (title.includes("Endgame")) return "Endgame lab added opposition drills to your path.";
  return "Calculation checklist added to your coach notes.";
}

function makeRoomCode(label: string) {
  return `${label.replace(/[^A-Z]/gi, "").slice(0, 4).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function makeRoomDetail(label: string, profile: Profile): CommunityDetail {
  return {
    title: label,
    tag: "Live room",
    meta: `${profile.city} club room`,
    description: "A live training room where you can invite a friend, play a game, and review it with the coach after the result.",
    schedule: "Open now · shareable link",
    prize: "Saved game, coach report, and city activity credit",
    action: "Open room",
  };
}

function getRoomList(profile: Profile) {
  return [
    { label: "Rapid 10+0", online: 19, level: "All levels" },
    { label: "Beginner analysis", online: 33, level: "400-1000" },
    { label: `${profile.city} club`, online: 24, level: "Local" },
    { label: "Endgame lab", online: 15, level: "Training" },
  ];
}

function normalizeProgress(value: number) {
  return Math.max(0, Math.min(100, value));
}

function getLessonProgress(progress: Record<string, number>, title: string, fallback: number) {
  return progress[title] ?? fallback;
}

function makeLessonProgressDefaults() {
  return Object.fromEntries(lessons.map((lesson) => [lesson.title, lesson.progress]));
}

function getPuzzleResultText(puzzle: Puzzle, solved: boolean) {
  return solved ? `${puzzle.solution.san} solved. Pattern: ${puzzle.theme}.` : puzzle.goal;
}

function getCityRankLabel(rank: number) {
  if (rank === 1) return "Champion";
  if (rank <= 3) return "Podium";
  return "Climber";
}

function getProfileRating(profile: Profile) {
  return profile.rating ?? 400;
}

function getRatingGap(profile: Profile, aiLevel: AiLevel) {
  return aiProfiles[aiLevel].rating - getProfileRating(profile);
}

function getDifficultyAdvice(profile: Profile, aiLevel: AiLevel) {
  const gap = getRatingGap(profile, aiLevel);
  if (gap > 500) return "Hard challenge. Use this when you want serious resistance.";
  if (gap > 150) return "Good stretch level. You should lose sometimes and learn a lot.";
  if (gap < -250) return "Warm-up level. Great for practicing clean conversion.";
  return "Balanced pairing for your current estimated Elo.";
}

function chooseLessonAction(progress: number) {
  if (progress >= 100) return "Review";
  if (progress >= 70) return "Finish";
  return "Continue";
}

function getNextLesson(progress: Record<string, number>) {
  return lessons.find((lesson) => getLessonProgress(progress, lesson.title, lesson.progress) < 100) ?? lessons[0];
}

function makeCityUpdate(city: string) {
  return `${city} selected. Your leaderboard and community rooms now focus on that city.`;
}

function makeSavedGameSummary(savedGames: SavedGame[]) {
  const last = savedGames[0];
  if (!last) return "No saved games yet. Play and save a game to build coach memory.";
  return `Last saved: ${last.result}, ${last.moves.length} moves, ${last.reviewScore ?? "N/A"} review.`;
}

function getReviewLabel(score: number | null) {
  if (!score) return "No review yet";
  if (score >= 82) return "Excellent";
  if (score >= 68) return "Solid";
  return "Needs review";
}

function getOpeningName(history: Move[]) {
  const firstMoves = history.slice(0, 4).map((move) => move.san).join(" ");
  if (firstMoves.includes("e4")) return "Open Game structure";
  if (firstMoves.includes("d4")) return "Queen pawn structure";
  if (firstMoves.includes("Nf3")) return "Flexible knight opening";
  return "Unclassified opening";
}

function getPuzzleIndexByTitle(title: string, puzzleList = puzzles) {
  return Math.max(0, puzzleList.findIndex((puzzle) => puzzle.title === title));
}

function getPuzzleRatingDelta(solved: boolean) {
  return solved ? 8 : -3;
}

function getMoveQuality(move: Move | null) {
  if (!move) return "No move";
  if (move.san.includes("#")) return "Checkmate";
  if (move.san.includes("+")) return "Check";
  if (move.captured) return "Capture";
  return "Quiet move";
}

function getMoveFeedback(move: Move, mode: CoachMode) {
  if (move.san.includes("#")) {
    return "You found checkmate. Save this pattern and remember how the attack finished.";
  }
  if (move.captured) {
    return coachCopyByMode(
      mode,
      "You won material. Now check what your opponent threatens back.",
      "You gained material. Before the next move, make sure the piece you used is still safe.",
      "You won material. Confirm the tactical sequence is actually over and there is no counterplay.",
    );
  }
  if (move.san.includes("+")) {
    return coachCopyByMode(
      mode,
      "Check can be useful, but only if it improves your position.",
      "You gave check. Compare it with other forcing moves before assuming it is best.",
      "The checking move seized initiative. Make sure the follow-up keeps the pressure concrete.",
    );
  }

  return coachCopyByMode(
    mode,
    "Quiet moves are fine when they improve safety or development.",
    "That was a quiet move. Ask whether it improved development, center control, or king safety.",
    "The move was positional. Evaluate whether it improved your coordination enough to justify the tempo.",
  );
}

function getBotAvatar(level: AiLevel) {
  if (level === "easy") return "E";
  if (level === "medium") return "M";
  return "P";
}

function getBotClass(level: AiLevel) {
  return `botBadge ${level}`;
}

function getPuzzleSolvedCount(solved: Record<string, boolean>, puzzleList = puzzles) {
  return puzzleList.filter((puzzle) => solved[puzzle.title]).length;
}

function getCommunityHeadline(profile: Profile) {
  return `${profile.city} players are waiting for games, study rooms, and arenas.`;
}

function getPrimaryCoachAction(history: Move[]) {
  if (history.length === 0) return "Play a game";
  return "Analyze current position";
}

function getCourseCompletion(progress: Record<string, number>) {
  const values = lessons.map((lesson) => getLessonProgress(progress, lesson.title, lesson.progress));
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function makeHumanSuggestion(game: Chess) {
  const suggestion = pickHumanMoveSuggestion(game);
  return suggestion ? `${suggestion.san} (${getMoveQuality(suggestion)})` : "No legal moves";
}

function getPuzzleButtonLabel(active: boolean, solved: boolean) {
  if (solved) return "Solved";
  return active ? "Selected" : "Train";
}

function getSelectedPuzzleHeader(index: number, solved: Record<string, boolean>, puzzleList = puzzles) {
  const puzzle = puzzleList[index];
  return `${puzzle.title} · ${puzzle.theme} · ${solved[puzzle.title] ? "solved" : "unsolved"}`;
}

function getLearnHeroTitle(progress: Record<string, number>) {
  const next = getNextLesson(progress);
  return next ? next.title : "Review your completed path";
}

function getLearnHeroText(progress: Record<string, number>) {
  const next = getNextLesson(progress);
  return next ? next.text : "You completed the core path. Review weak modules or go to puzzles.";
}

function getCoachEmptyText(history: Move[]) {
  return history.length === 0
    ? "Start a game first. Coach analysis becomes useful after you make moves."
    : "Coach fallback is active. Focus on king safety, center control, and piece development before forcing tactics.";
}

function getHistoryScoreLabel(score: number | null) {
  return score ? `${score}% · ${getReviewLabel(score)}` : "Not reviewed";
}

function getRoomActionLabel(roomId: string) {
  return roomId ? "Copy room link" : "Create live room";
}

function getLeaderboardSubtitle(profile: Profile) {
  return `${profile.city} focus · your Elo ${formatElo(profile.rating)}`;
}

function getPuzzleProgressLabel(solved: Record<string, boolean>, puzzleList = puzzles) {
  return `${getPuzzleSolvedCount(solved, puzzleList)}/${puzzleList.length} solved today`;
}

function getAiLevelFromRating(profile: Profile): AiLevel {
  const rating = getProfileRating(profile);
  if (rating < 950) return "easy";
  if (rating < 1700) return "medium";
  return "pro";
}

function clampLessonProgress(progress: number) {
  return normalizeProgress(progress + 18);
}

function getAiResultBonus(level: AiLevel) {
  if (level === "easy") return 5;
  if (level === "medium") return 12;
  return 25;
}

function makeAiLevelToast(level: AiLevel, profile: Profile) {
  return `${aiProfiles[level].name} selected (${aiProfiles[level].rating}). ${getDifficultyAdvice(profile, level)}`;
}

function getPositionFen(game: Chess) {
  return game.fen().split(" ").slice(0, 2).join(" ");
}

function getCoachPositionLine(game: Chess, history: Move[]) {
  if (history.length === 0) return "No moves yet. Start with central control and quick development.";
  return `${getOpeningName(history)} · ${makeHumanSuggestion(game)} candidate · ${getPositionFen(game)}`;
}

function chooseAiMoveWithProfile(game: Chess, level: AiLevel) {
  return chooseAiMove(game, level);
}

function getRoomToast(label: string, code: string) {
  return `${label} joined. Room ${code} is ready; share the link or play in another tab.`;
}

function isPuzzleSolved(solved: Record<string, boolean>, puzzle: Puzzle) {
  return Boolean(solved[puzzle.title]);
}

function openProCheckout() {
  const paymentLink = import.meta.env.VITE_STRIPE_PAYMENT_LINK;
  if (paymentLink) {
    window.open(paymentLink, "_blank", "noopener,noreferrer");
    return true;
  }
  return false;
}

function makeGeneratedPuzzle(existingCount: number) {
  const base = generatedPuzzleBank[existingCount % generatedPuzzleBank.length];
  return {
    ...base,
    title: `${base.title} ${Math.floor(existingCount / generatedPuzzleBank.length) + 1}`,
    rating: base.rating + existingCount * 25,
  };
}

function getCapturedPieces(history: Move[]) {
  return history
    .filter((move) => move.captured)
    .map((move) => `${move.color === "w" ? "b" : "w"}${move.captured}`);
}

function getStatus(game: Chess) {
  if (game.isCheckmate()) {
    return game.turn() === "w" ? "Black wins by checkmate" : "White wins by checkmate";
  }
  if (game.isDraw()) return "Draw agreed by the position";
  if (game.isCheck()) return `${game.turn() === "w" ? "White" : "Black"} is in check`;
  return `${game.turn() === "w" ? "White" : "Black"} to move`;
}

function getResult(game: Chess) {
  if (game.isCheckmate()) return game.turn() === "w" ? "0-1" : "1-0";
  if (game.isDraw()) return "1/2-1/2";
  return "In progress";
}

function coachCopyByMode(mode: CoachMode, beginner: string, intermediate: string, advanced: string) {
  if (mode === "beginner") return beginner;
  if (mode === "intermediate") return intermediate;
  return advanced;
}

function formatEvaluation(analysis: StockfishAnalysis | null) {
  if (!analysis) return "N/A";
  if (analysis.mate !== null) return `Mate ${analysis.mate > 0 ? "for the side to move" : "against the side to move"}`;
  if (analysis.scoreCp === null) return "N/A";
  const pawns = analysis.scoreCp / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

function analyzeGame(history: Move[], game: Chess, analysis: StockfishAnalysis | null, coachMode: CoachMode): CoachInsight[] {
  const whiteCaptures = history.filter((move) => move.color === "w" && move.captured);
  const blackCaptures = history.filter((move) => move.color === "b" && move.captured);
  const checks = history.filter((move) => move.san.includes("+") || move.san.includes("#"));
  const queenEarly = history.slice(0, 8).some((move) => move.color === "w" && move.piece === "q");
  const castle = history.some((move) => move.color === "w" && (move.san === "O-O" || move.san === "O-O-O"));
  const centerControl = history.slice(0, 8).some((move) => move.color === "w" && /^(e4|d4|c4|Nf3)/.test(move.san));
  const undevelopedMinors = ["b1", "g1", "c1", "f1"].filter((square) => game.get(square as Square)?.color === "w").length;
  const bestMove = analysis?.bestMove ? playUciMove(new Chess(game.fen()), analysis.bestMove) : findBestMove(game);
  const insights: CoachInsight[] = [];

  if (bestMove) {
    insights.push({
      tone: typeof analysis?.scoreCp === "number" && analysis.scoreCp < -120 ? "warning" : "pro",
      title: "Best move suggestion",
      text: coachCopyByMode(
        coachMode,
        `A safer move here was ${bestMove.san}. ${analysis ? `Evaluation ${formatEvaluation(analysis)}.` : ""} Check forcing moves before you commit.`,
        `Stockfish prefers ${bestMove.san}. ${analysis ? `Evaluation ${formatEvaluation(analysis)}.` : ""} Compare that line against your candidate and ask what tactical detail it fixes.`,
        `Engine choice: ${bestMove.san}. ${analysis ? `Evaluation ${formatEvaluation(analysis)}.` : ""} Use it as a reference for move-order, king safety, and tactical accuracy.`,
      ),
    });
  }

  if (whiteCaptures.length >= blackCaptures.length) {
    insights.push({
      tone: "good",
      title: "Material discipline",
      text: coachCopyByMode(
        coachMode,
        `You kept material under control and converted ${whiteCaptures.length} capture chances.`,
        `You handled material well and converted ${whiteCaptures.length} capture opportunities without falling behind.`,
        `Material management was stable. You converted ${whiteCaptures.length} captures and avoided an immediate deficit.`,
      ),
    });
  } else {
    const lostBy = blackCaptures.length - whiteCaptures.length;
    insights.push({
      tone: "warning",
      title: "Loose pieces",
      text: coachCopyByMode(
        coachMode,
        `You lost material because a piece was left vulnerable. Before every move, ask what is undefended.`,
        `You fell behind by roughly ${lostBy} capture swing. Check which of your pieces can be taken after your move.`,
        `Material slipped because your move left tactical targets. Audit loose pieces and backward defenders before committing.`,
      ),
    });
  }

  insights.push({
    tone: checks.length > 1 ? "good" : "pro",
    title: "Initiative",
    text:
      checks.length > 1
        ? coachCopyByMode(
            coachMode,
            `You created ${checks.length} forcing moments. Keep looking for checks and direct threats.`,
            `You generated ${checks.length} forcing checks. Turn that initiative into concrete gains, not just activity.`,
            `You created ${checks.length} forcing moves. The next step is converting initiative into material, king pressure, or favorable structure.`,
          )
        : coachCopyByMode(
            coachMode,
            "You played quietly. Before moving, look for checks, captures, and threats.",
            "The position needed more forcing candidates. Scan checks, captures, and tactical ideas before quiet moves.",
            "Your candidate list was too quiet. Broaden calculation to forcing lines before settling on a positional move.",
          ),
  });

  insights.push({
    tone: centerControl ? "good" : "warning",
    title: "Center control",
    text: centerControl
      ? coachCopyByMode(
          coachMode,
          "You challenged the center early. That usually makes the rest of the position easier to play.",
          "Early center control helped your pieces coordinate. Keep building around that space advantage.",
          "You respected central control, which improved piece activity and future tactical chances.",
        )
      : coachCopyByMode(
          coachMode,
          "Control the center earlier with pawns or knights.",
          "You gave up too much central influence. Use e4, d4, c4, or Nf3 sooner to organize your pieces.",
          "Central passivity limited your options. Fight for key central squares earlier to improve initiative and development.",
        ),
  });

  if (queenEarly) {
    insights.push({
      tone: "warning",
      title: "Opening habit",
      text: coachCopyByMode(
        coachMode,
        "Your queen moved too early. Usually it is better to develop knights and bishops first.",
        "The queen came out early and likely invited tempo-gaining attacks. Develop minor pieces and castle first.",
        "Early queen activity cost development time. Favor minor-piece mobilization and king safety before queen operations.",
      ),
    });
  } else if (castle) {
    insights.push({
      tone: "good",
      title: "King safety",
      text: coachCopyByMode(
        coachMode,
        "You castled and made your king safer.",
        "You found a castling window and reduced tactical risk. Keep building that habit.",
        "You prioritized king safety correctly, which stabilizes calculation and attacking choices.",
      ),
    });
  } else {
    insights.push({
      tone: "pro",
      title: "King safety",
      text: coachCopyByMode(
        coachMode,
        "Your king is still unsafe. Try to castle earlier.",
        "You delayed king safety. Look for a castling window before launching new operations.",
        "The king remains exposed and that distorts the position. Secure it earlier so your attacking plans are sound.",
      ),
    });
  }

  if (undevelopedMinors >= 2) {
    insights.push({
      tone: "warning",
      title: "Development",
      text: coachCopyByMode(
        coachMode,
        "Several pieces are still sleeping on their starting squares. Develop them before hunting tactics.",
        "You still have too many undeveloped minor pieces. Activate them to improve coordination and defense.",
        "Development lag is holding the position back. Untangle the minor pieces before investing in side plans.",
      ),
    });
  }

  if (game.isCheckmate()) {
    insights.unshift({
      tone: game.turn() === "b" ? "good" : "warning",
      title: game.turn() === "b" ? "Finish found" : "Tactical miss",
      text:
        game.turn() === "b"
          ? coachCopyByMode(
              coachMode,
              "You delivered checkmate. Save the game and remember the final pattern.",
              "You found checkmate. Save the game and review how the attack was prepared.",
              "You converted the attack cleanly into mate. Revisit the move order that made the final tactic possible.",
            )
          : coachCopyByMode(
              coachMode,
              "You were checkmated. Go back a few moves and look for the first danger sign.",
              "You were checkmated. Review the last five moves and identify the first defensive resource you missed.",
              "The game ended in mate against you. Trace the sequence back to the first structural or tactical concession.",
            ),
    });
  }

  return insights;
}

function estimateReviewScore(history: Move[], game: Chess) {
  if (history.length < 2) return null;
  const captures = history.filter((move) => move.color === "w" && move.captured).length;
  const checks = history.filter((move) => move.color === "w" && /[+#]/.test(move.san)).length;
  const earlyQueenPenalty = history.slice(0, 8).some((move) => move.color === "w" && move.piece === "q") ? 8 : 0;
  const mateBonus = game.isCheckmate() && game.turn() === "b" ? 12 : 0;
  return Math.max(42, Math.min(98, 68 + captures * 4 + checks * 3 + mateBonus - earlyQueenPenalty));
}

function estimateQuizElo(answers: Record<number, number>) {
  const total = Object.values(answers).reduce((sum, value) => sum + value, 0);
  return Math.round(Math.max(400, Math.min(2200, 450 + total)));
}

function formatElo(rating: number | null) {
  return rating ? `${rating}` : "Unrated";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function fieldError(errors: AuthFieldErrors, field: keyof AuthFormState) {
  return errors[field];
}

function fenPreview(fen: string) {
  const placement = fen.split(" ")[0];
  const map: Record<string, string> = {
    K: "♔",
    Q: "♕",
    R: "♖",
    B: "♗",
    N: "♘",
    P: "♙",
    k: "♚",
    q: "♛",
    r: "♜",
    b: "♝",
    n: "♞",
    p: "♟",
  };
  return placement
    .replace(/\//g, "")
    .split("")
    .flatMap((char) => (Number.isNaN(Number(char)) ? map[char] : Array.from({ length: Number(char) }, () => "")));
}

function getRoomIdFromLocation() {
  const match = window.location.pathname.match(/^\/play\/room\/([A-Za-z0-9_-]+)$/i);
  if (match?.[1]) {
    return match[1].toUpperCase();
  }

  return new URLSearchParams(window.location.search).get("room") || "";
}

function roomPath(roomId: string) {
  return `/play/room/${roomId.toUpperCase()}`;
}

function gamePath() {
  return "/play/game";
}

function isGamePath() {
  return window.location.pathname === "/play/game";
}

function makeTimeControl(minutes: number, incrementSeconds: number): TimeControl {
  return {
    id: `custom-${minutes}-${incrementSeconds}`,
    label: `${minutes}+${incrementSeconds}`,
    category: "Custom",
    minutes,
    incrementSeconds,
  };
}

function formatClock(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getTimeControlTitle(control: { category: string; label: string }) {
  return `${control.category} ${control.label}`;
}

function getModeLabel(mode: LocalGameMode) {
  if (mode === "friend") return "Play vs friend online";
  if (mode === "local") return "Play on one device";
  return "Play vs AI";
}

function getBoardOrientation(mode: LocalGameMode, turn: "white" | "black", autoRotate: boolean) {
  if (mode === "local" && autoRotate) {
    return turn === "white" ? "white" : "black";
  }
  return "white";
}

function getDisplayStatusLabel(params: {
  game: Chess;
  mode: LocalGameMode;
  roomState: RoomState | null;
  resultOverride: string | null;
  statusOverride: string | null;
}) {
  if (params.mode === "friend" && params.roomState) {
    const state = params.roomState;
    if (state.finished && state.timeoutWinner) {
      return state.timeoutWinner === "white" ? "White wins on time" : "Black wins on time";
    }
    return state.status;
  }

  if (params.resultOverride === "1/2-1/2") return params.statusOverride || "Draw agreed";
  if (params.resultOverride === "1-0" && params.statusOverride?.includes("time")) return "White wins on time";
  if (params.resultOverride === "0-1" && params.statusOverride?.includes("time")) return "Black wins on time";
  if (params.statusOverride) return params.statusOverride;
  return getStatus(params.game);
}

function getClubSuggestions(city: string) {
  return cityClubSuggestions[city] ?? cityClubSuggestions.Almaty;
}

function get2gisSearchUrl(query: string) {
  return `https://2gis.kz/search/${encodeURIComponent(query)}`;
}

function mapUserToProfile(user: ApiUser): Profile {
  return {
    id: user.id,
    name: user.name,
    city: user.city,
    rating: user.rating,
    pro: user.pro,
    email: user.email,
    avatar: user.avatar,
    notifications: user.notifications,
    signedIn: true,
  };
}

export default function App() {
  const initialRoomId = getRoomIdFromLocation();
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [history, setHistory] = useState<Move[]>([]);
  const [theme, setTheme] = useState<ThemeName>(() => normalizeTheme(loadJson("cm-theme", "midnight")));
  const [language, setLanguage] = useState<Language>(() => loadJson("cm-language", "en"));
  const [view, setView] = useState<View>(initialRoomId || isGamePath() ? "game" : "home");
  const [mode, setMode] = useState<LocalGameMode>(initialRoomId ? "friend" : "ai");
  const [aiLevel, setAiLevel] = useState<AiLevel>(() => loadJson("cm-ai-level", "medium"));
  const [selectedTimeControlId, setSelectedTimeControlId] = useState(() => loadJson("cm-time-control-id", defaultTimeControl.id));
  const [customMinutes, setCustomMinutes] = useState(() => loadJson("cm-custom-minutes", 12));
  const [customIncrement, setCustomIncrement] = useState(() => loadJson("cm-custom-increment", 5));
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [savedGames, setSavedGames] = useState<SavedGame[]>(() => loadJson("cm-games", []));
  const [roomId, setRoomId] = useState(initialRoomId);
  const [toast, setToast] = useState("Take the Elo quiz first. Chess Master will not invent your level.");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState<AuthFormState>({ name: "", email: "", password: "", confirmPassword: "", city: "Almaty" });
  const [authErrors, setAuthErrors] = useState<AuthFieldErrors>({});
  const [authNotice, setAuthNotice] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [lessonProgress, setLessonProgress] = useState<Record<string, number>>(() =>
    loadJson("cm-lesson-progress", makeLessonProgressDefaults()),
  );
  const [puzzleSet, setPuzzleSet] = useState<Puzzle[]>(() => loadJson("cm-puzzle-set", puzzles));
  const [selectedPuzzleIndex, setSelectedPuzzleIndex] = useState(0);
  const [puzzleGame, setPuzzleGame] = useState(() => loadPuzzleGame(0));
  const [puzzleSelected, setPuzzleSelected] = useState<Square | null>(null);
  const [puzzleTargets, setPuzzleTargets] = useState<Square[]>([]);
  const [puzzleSolved, setPuzzleSolved] = useState<Record<string, boolean>>(() => loadJson("cm-puzzle-solved", {}));
  const [puzzleMessage, setPuzzleMessage] = useState(puzzles[0].goal);
  const [communityDetail, setCommunityDetail] = useState<CommunityDetail | null>(null);
  const [coachMode, setCoachMode] = useState<CoachMode>("beginner");
  const [stockfishBusy, setStockfishBusy] = useState(false);
  const [stockfishAnalysis, setStockfishAnalysis] = useState<StockfishAnalysis | null>(null);
  const [friendColor, setFriendColor] = useState<"white" | "black" | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [whiteTimeMs, setWhiteTimeMs] = useState(defaultTimeControl.minutes * 60 * 1000);
  const [blackTimeMs, setBlackTimeMs] = useState(defaultTimeControl.minutes * 60 * 1000);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [resultOverride, setResultOverride] = useState<string | null>(null);
  const [autoRotateBoard, setAutoRotateBoard] = useState(true);
  const lastSavedFen = useRef("");
  const authPanelRef = useRef<HTMLDivElement | null>(null);

  const board = useMemo(() => createBoard(game), [game]);
  const capturedPieces = useMemo(() => getCapturedPieces(history), [history]);
  const whiteCaptured = capturedPieces.filter((piece) => piece.startsWith("w"));
  const blackCaptured = capturedPieces.filter((piece) => piece.startsWith("b"));
  const coachReport = useMemo(() => analyzeGame(history, game, stockfishAnalysis, coachMode), [history, game, stockfishAnalysis, coachMode]);
  const reviewScore = useMemo(() => estimateReviewScore(history, game), [history, game]);
  const roomUrl = roomId ? `${window.location.origin}${roomPath(roomId)}` : "";
  const puzzleBoard = useMemo(() => makePuzzleBoard(puzzleGame), [puzzleGame]);
  const selectedPuzzle = puzzleSet[selectedPuzzleIndex] ?? puzzleSet[0];
  const dynamicCoachTimeline = useMemo(() => getCoachTimeline(history, game), [history, game]);
  const roomList = useMemo(() => getRoomList(profile), [profile]);
  const courseCompletion = useMemo(() => getCourseCompletion(lessonProgress), [lessonProgress]);
  const selectedTimeControl = useMemo(() => {
    const preset = timeControlGroups.flatMap((group) => group.options).find((option) => option.id === selectedTimeControlId);
    return preset ?? makeTimeControl(customMinutes, customIncrement);
  }, [selectedTimeControlId, customMinutes, customIncrement]);
  const activeTurn = roomState?.turn || (game.turn() === "w" ? "white" : "black");
  const boardOrientation = getBoardOrientation(mode, activeTurn, autoRotateBoard);
  const displayedBoard = useMemo(() => (boardOrientation === "white" ? board : [...board].reverse()), [board, boardOrientation]);
  const displayStatus = useMemo(
    () =>
      getDisplayStatusLabel({
        game,
        mode,
        roomState,
        resultOverride,
        statusOverride,
      }),
    [game, mode, roomState, resultOverride, statusOverride],
  );
  const communityClubs = useMemo(() => getClubSuggestions(profile.city), [profile.city]);
  const t = (key: keyof typeof copy.en) => copy[language][key] ?? copy.en[key];

  const leaderboard = useMemo(() => {
    const userStreak = savedGames.filter((savedGame) => savedGame.result === "1-0").length;
    return [...starterLeaderboard, { name: profile.name, city: profile.city, rating: profile.rating ?? 400, streak: userStreak, winRate: 50, title: "You" }]
      .sort((a, b) => b.rating - a.rating)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }, [profile, savedGames]);

  const nextLesson = getNextLesson(lessonProgress);
  const solvedPuzzleCount = getPuzzleSolvedCount(puzzleSolved, puzzleSet);
  const homeCopy =
    language === "ru"
      ? {
          mission: "План на сегодня",
          missionTitle: "Заполни день сильной шахматной работой",
          missionText: "Короткий маршрут из партии, тактики, урока и анализа. Нажми любой блок и сразу продолжай тренировку.",
          momentum: "Твой прогресс",
          lesson: "Следующий урок",
          puzzle: "Тактика",
          coach: "AI-разбор",
          city: "Клуб города",
          lessonText: `Продолжить: ${nextLesson.title}.`,
          puzzleText: `${solvedPuzzleCount}/${puzzleSet.length} решено. Новая задача появится после полного прохождения.`,
          coachText: reviewScore ? `Текущая оценка партии: ${reviewScore}%.` : "Сыграй несколько ходов, затем попроси Stockfish проверить позицию.",
          cityText: `${profile.city}: арены, комнаты и местный рейтинг.`,
          lessonButton: "Начать урок",
          puzzleButton: "Решать",
          coachButton: stockfishBusy ? "Анализ..." : "Разобрать",
          cityButton: "Открыть клуб",
          elo: "Elo",
          course: "Курс",
          puzzles: "Пазлы",
          archive: "Архив",
          savedSummary: makeSavedGameSummary(savedGames),
        }
      : {
          mission: "Today's command center",
          missionTitle: "Fill this session with serious chess work",
          missionText: "A focused route through one game, one tactic, one lesson, and one review. Every card jumps into the real feature.",
          momentum: "Your momentum",
          lesson: "Next lesson",
          puzzle: "Tactics",
          coach: "AI review",
          city: "City club",
          lessonText: `Continue: ${nextLesson.title}.`,
          puzzleText: `${solvedPuzzleCount}/${puzzleSet.length} solved. A fresh puzzle appears after you clear the set.`,
          coachText: reviewScore ? `Current game review: ${reviewScore}%.` : "Play a few moves, then ask Stockfish to check the position.",
          cityText: `${profile.city}: arenas, rooms, and local leaderboard.`,
          lessonButton: "Start lesson",
          puzzleButton: "Train puzzle",
          coachButton: stockfishBusy ? "Analyzing..." : "Analyze",
          cityButton: "Open club",
          elo: "Elo",
          course: "Course",
          puzzles: "Puzzles",
          archive: "Archive",
          savedSummary: makeSavedGameSummary(savedGames),
        };

  const homeMissions = [
    {
      icon: BookOpen,
      title: homeCopy.lesson,
      text: homeCopy.lessonText,
      metric: `${courseCompletion}%`,
      button: homeCopy.lessonButton,
      action: () => {
        setView("learn");
        continueLesson(nextLesson.title);
      },
    },
    {
      icon: Dumbbell,
      title: homeCopy.puzzle,
      text: homeCopy.puzzleText,
      metric: `${solvedPuzzleCount}/${puzzleSet.length}`,
      button: homeCopy.puzzleButton,
      action: () => {
        setView("puzzles");
        selectPuzzle(selectedPuzzleIndex);
      },
    },
    {
      icon: Brain,
      title: homeCopy.coach,
      text: homeCopy.coachText,
      metric: reviewScore ? `${reviewScore}%` : "SF",
      button: homeCopy.coachButton,
      action: analyzeNow,
    },
    {
      icon: Users,
      title: homeCopy.city,
      text: homeCopy.cityText,
      metric: `#${leaderboard.find((entry) => entry.name === profile.name)?.rank ?? "-"}`,
      button: homeCopy.cityButton,
      action: () => setView("community"),
    },
  ];

  useEffect(() => {
    localStorage.setItem("cm-profile", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem("cm-games", JSON.stringify(savedGames));
  }, [savedGames]);

  useEffect(() => {
    localStorage.setItem("cm-theme", JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("cm-language", JSON.stringify(language));
  }, [language]);

  useEffect(() => {
    localStorage.setItem("cm-ai-level", JSON.stringify(aiLevel));
  }, [aiLevel]);

  useEffect(() => {
    localStorage.setItem("cm-time-control-id", JSON.stringify(selectedTimeControlId));
  }, [selectedTimeControlId]);

  useEffect(() => {
    localStorage.setItem("cm-custom-minutes", JSON.stringify(customMinutes));
  }, [customMinutes]);

  useEffect(() => {
    localStorage.setItem("cm-custom-increment", JSON.stringify(customIncrement));
  }, [customIncrement]);

  useEffect(() => {
    localStorage.setItem("cm-lesson-progress", JSON.stringify(lessonProgress));
  }, [lessonProgress]);

  useEffect(() => {
    localStorage.setItem("cm-puzzle-solved", JSON.stringify(puzzleSolved));
  }, [puzzleSolved]);

  useEffect(() => {
    localStorage.setItem("cm-puzzle-set", JSON.stringify(puzzleSet));
  }, [puzzleSet]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapApp() {
      try {
        const sessionUser = await getSession();
        if (cancelled) return;

        if (sessionUser) {
          setProfile(mapUserToProfile(sessionUser));
        }
      } catch (error) {
        if (!cancelled) {
          setToast(error instanceof Error ? error.message : "Failed to load application session.");
        }
      } finally {
        if (!cancelled) {
          setSessionChecked(true);
        }
      }
    }

    void bootstrapApp();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!profile.signedIn) return;

    setHistoryLoading(true);
    getHistory()
      .then((items) => {
        const mapped = items.map((item) => ({
          id: String(item.id),
          date: String(item.finishedAt || item.createdAt || new Date().toISOString()),
          mode: item.mode === "friend" ? "friend" : "ai",
          result: String(item.result || "*"),
          moves: typeof item.pgn === "string" ? item.pgn.split(" ").filter(Boolean) : [],
          pgn: String(item.pgn || ""),
          coach: [],
          city: profile.city,
          reviewScore: null,
        })) as SavedGame[];
        setSavedGames(mapped);
      })
      .catch((error) => setToast(error instanceof Error ? error.message : "Failed to load history."))
      .finally(() => setHistoryLoading(false));
  }, [profile.signedIn, profile.city]);

  useEffect(() => {
    const handlePopState = () => {
      const nextRoomId = getRoomIdFromLocation();
      if (nextRoomId) {
        setRoomId(nextRoomId);
        setView("game");
        setMode("friend");
        return;
      }
      if (isGamePath()) {
        setView("game");
        return;
      }
      setView("home");
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!profile.signedIn || !roomId) return;

    const socket = getSocket();

    const handleRoomState = (nextState: RoomState) => {
      setRoomState(nextState);
      syncGame(new Chess(nextState.fen));
    };

    const handleConnectError = () => {
      setToast("Live room connection failed.");
    };

    socket.on("room:state", handleRoomState);
    socket.on("connect_error", handleConnectError);

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit(
      "room:join",
      { roomId },
      (response: { ok: boolean; error?: string; color?: "white" | "black"; state?: RoomState }) => {
        if (!response?.ok || !response.state) {
          setToast(response?.error || "Unable to join room.");
          return;
        }

        setFriendColor(response.color || null);
        setMode("friend");
        setView("game");
        setRoomState(response.state);
        syncGame(new Chess(response.state.fen));
        setToast(response.state.waitingForOpponent ? "Room created. Waiting for opponent." : "Friend room connected.");
      },
    );

    const syncInterval = window.setInterval(() => {
      socket.emit("room:sync", { roomId }, () => undefined);
    }, 1000);

    return () => {
      window.clearInterval(syncInterval);
      socket.off("room:state", handleRoomState);
      socket.off("connect_error", handleConnectError);
    };
  }, [profile.signedIn, roomId]);

  useEffect(() => {
    if (!game.isGameOver() || lastSavedFen.current === game.fen()) return;
    lastSavedFen.current = game.fen();
    saveGame("auto");
  }, [game]);

  useEffect(() => {
    if (mode !== "friend" || !roomState) return;
    setWhiteTimeMs(roomState.remainingMs.white);
    setBlackTimeMs(roomState.remainingMs.black);
    if (roomState.finished && roomState.timeoutWinner) {
      setStatusOverride(roomState.timeoutWinner === "white" ? "White wins on time" : "Black wins on time");
      setResultOverride(roomState.timeoutWinner === "white" ? "1-0" : "0-1");
    } else if (roomState.finished) {
      setStatusOverride(roomState.status);
      setResultOverride(roomState.result);
    }
  }, [mode, roomState]);

  useEffect(() => {
    if (view !== "game" || mode === "friend") return;
    if (resultOverride || game.isGameOver()) return;

    const interval = window.setInterval(() => {
      if (game.turn() === "w") {
        setWhiteTimeMs((current) => {
          const next = Math.max(0, current - 250);
          if (next === 0) {
            setResultOverride("0-1");
            setStatusOverride("Black wins on time");
          }
          return next;
        });
      } else {
        setBlackTimeMs((current) => {
          const next = Math.max(0, current - 250);
          if (next === 0) {
            setResultOverride("1-0");
            setStatusOverride("White wins on time");
          }
          return next;
        });
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [view, mode, game, resultOverride]);

  function syncGame(nextGame: Chess) {
    setGame(new Chess(nextGame.fen()));
    setHistory(nextGame.history({ verbose: true }));
  }

  function resetLocalClock(control = selectedTimeControl) {
    const startingMs = control.minutes * 60 * 1000;
    setWhiteTimeMs(startingMs);
    setBlackTimeMs(startingMs);
    setStatusOverride(null);
    setResultOverride(null);
  }

  function applyIncrement(color: "white" | "black", control = selectedTimeControl) {
    const increment = control.incrementSeconds * 1000;
    if (!increment) return;
    if (color === "white") {
      setWhiteTimeMs((current) => current + increment);
      return;
    }
    setBlackTimeMs((current) => current + increment);
  }

  function openGameView(path = gamePath()) {
    setView("game");
    window.history.replaceState(null, "", path);
  }

  function startGame(nextMode: LocalGameMode) {
    const nextGame = new Chess();
    lastSavedFen.current = "";
    setMode(nextMode);
    setRoomId("");
    setRoomState(null);
    setFriendColor(null);
    setSelected(null);
    setLegalTargets([]);
    resetLocalClock(selectedTimeControl);
    syncGame(nextGame);
    openGameView();
    setToast(`${getModeLabel(nextMode)} started · ${getTimeControlTitle(selectedTimeControl)}.`);
  }

  function makeAiMove(nextGame: Chess) {
    window.setTimeout(async () => {
      if (nextGame.isGameOver() || mode !== "ai") return;
      let aiMove: Move | null = null;

      if (aiLevel === "pro" && canUseStockfish()) {
        setStockfishBusy(true);
        const analysis = await analyzeFen(nextGame.fen(), 11);
        setStockfishAnalysis(analysis);
        aiMove = playUciMove(nextGame, analysis.bestMove);
        setStockfishBusy(false);
      }

      if (!aiMove) {
        const fallback = chooseAiMoveWithProfile(nextGame, aiLevel);
        if (!fallback) return;
        aiMove = nextGame.move(fallback);
      }

      syncGame(nextGame);
      applyIncrement("black");
      setToast(makeAiThinkingText(aiLevel, aiMove));
    }, aiLevel === "pro" ? 260 : 420);
  }

  function handleSquareClick(square: Square) {
    if (game.isGameOver() || resultOverride) return;
    if (mode === "ai" && game.turn() !== "w") return;
    if (mode === "friend") {
      if (!friendColor) {
        setToast("Join the room first.");
        return;
      }
      if ((friendColor === "white" && game.turn() !== "w") || (friendColor === "black" && game.turn() !== "b")) {
        setToast("Wait for your turn.");
        return;
      }
    }

    const piece = game.get(square);
    const friendlyColor = mode === "friend" ? (friendColor === "white" ? "w" : "b") : "w";
    if (!selected) {
      if (piece && piece.color === friendlyColor) {
        setSelected(square);
        setLegalTargets(game.moves({ square, verbose: true }).map((move) => move.to));
      }
      return;
    }

    const nextGame = new Chess(game.fen());
    const move = safeMove(nextGame, selected, square);

    setSelected(null);
    setLegalTargets([]);

    if (!move) {
      if (piece && piece.color === friendlyColor) {
        setSelected(square);
        setLegalTargets(game.moves({ square, verbose: true }).map((target) => target.to));
      }
      return;
    }

    if (mode === "friend") {
      const socket = getSocket();
      socket.emit(
        "room:move",
        {
          roomId,
          from: move.from,
          to: move.to,
          promotion: "q",
        },
        (response: { ok: boolean; error?: string; state?: RoomState }) => {
          if (!response?.ok) {
            setToast(response?.error || "Move rejected.");
            return;
          }

          if (response.state) {
            setRoomState(response.state);
            syncGame(new Chess(response.state.fen));
          }
        },
      );
      return;
    }

    const movingColor = move.color === "w" ? "white" : "black";
    syncGame(nextGame);
    applyIncrement(movingColor);
    setToast(`${move.san}: ${getMoveFeedback(move, coachMode)}`);
    if (mode === "ai") {
      makeAiMove(nextGame);
    }
  }

  function resetGame(nextMode = mode) {
    if (nextMode === "friend") {
      void createRoom();
      return;
    }

    startGame(nextMode);
  }

  function saveGame(source: "auto" | "manual") {
    const now = new Date().toISOString();
    const saved: SavedGame = {
      id: crypto.randomUUID(),
      date: now,
      mode,
      result: resultOverride || getResult(game),
      moves: history.map((move) => move.san),
      pgn: game.pgn(),
      coach: coachReport,
      city: profile.city,
      reviewScore,
    };
    setSavedGames((current) => [saved, ...current].slice(0, 20));
    if (profile.signedIn && mode !== "friend") {
      void saveHistory({
        mode,
        result: saved.result,
        status: statusOverride || (game.isGameOver() ? getStatus(game) : "saved"),
        pgn: saved.pgn,
        fen: game.fen(),
        summary: `${getReviewLabel(reviewScore)} review saved from the ${mode} board.`,
      }).catch(() => undefined);
    }
    if (source === "manual") setToast("Game saved to your local history.");
  }

  async function createRoom() {
    try {
      setRoomBusy(true);
      const room = await createFriendRoom({ timeControl: selectedTimeControl });
      setRoomId(room.roomId);
      setMode("friend");
      setFriendColor("white");
      setRoomState(room.state);
      resetLocalClock(selectedTimeControl);
      openGameView(roomPath(room.roomId));
      syncGame(new Chess(room.state.fen));
      setToast(`Friend room created · ${getTimeControlTitle(selectedTimeControl)}. Share the link and wait for black to join.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to create room.");
    } finally {
      setRoomBusy(false);
    }
  }

  async function copyRoomLink() {
    if (!roomUrl) return;
    await navigator.clipboard.writeText(roomUrl);
    setToast("Room link copied.");
  }

  function backToLobby() {
    setView("play");
    if (!roomId) {
      window.history.replaceState(null, "", "/");
    }
  }

  function restartCurrentGame() {
    if (mode === "friend") {
      void createRoom();
      return;
    }
    startGame(mode);
  }

  function offerDraw() {
    if (mode === "friend" && roomId) {
      const socket = getSocket();
      socket.emit("room:draw", { roomId }, (response: { ok: boolean; error?: string; state?: RoomState }) => {
        if (!response?.ok) {
          setToast(response?.error || "Draw request failed.");
          return;
        }
        if (response.state) {
          setRoomState(response.state);
          syncGame(new Chess(response.state.fen));
        }
        setToast("Draw agreed.");
      });
      return;
    }

    setResultOverride("1/2-1/2");
    setStatusOverride("Draw agreed");
    setToast("Draw agreed.");
  }

  function resignGame() {
    if (mode === "friend" && roomId) {
      const socket = getSocket();
      socket.emit("room:resign", { roomId }, (response: { ok: boolean; error?: string; state?: RoomState }) => {
        if (!response?.ok) {
          setToast(response?.error || "Resign failed.");
          return;
        }
        if (response.state) {
          setRoomState(response.state);
          syncGame(new Chess(response.state.fen));
        }
        setToast("Game ended by resignation.");
      });
      return;
    }

    if (game.turn() === "w") {
      setResultOverride("0-1");
      setStatusOverride("White resigned");
    } else {
      setResultOverride("1-0");
      setStatusOverride("Black resigned");
    }
    setToast("Game ended by resignation.");
  }

  async function sendInviteEmail() {
    if (!roomId || !inviteEmail.trim()) {
      setToast("Add an email address for the invitation.");
      return;
    }

    try {
      setInviteBusy(true);
      await sendRoomInvite(roomId, inviteEmail.trim().toLowerCase());
      setInviteEmail("");
      setToast("Invitation email sent.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Invitation email failed.");
    } finally {
      setInviteBusy(false);
    }
  }

  function upgradeToPro() {
    if (openProCheckout()) {
      setToast("Opening Stripe payment link.");
      return;
    }
    setProfile((current) => ({ ...current, pro: true }));
    if (profile.signedIn) {
      void patchProfile({ pro: true }).catch(() => undefined);
    }
    setToast("Pro unlocked locally. Add VITE_STRIPE_PAYMENT_LINK to use a real Stripe checkout.");
  }

  function openAuth(modeName: "login" | "signup") {
    setAuthMode(modeName);
    setAuthErrors({});
    setAuthNotice(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setAuthForm({
      name: profile.name === "Guest Player" ? "" : profile.name,
      email: profile.email,
      password: "",
      confirmPassword: "",
      city: profile.city,
    });
    requestAnimationFrame(() => {
      authPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password.trim();
    const name = authForm.name.trim();
    const city = authForm.city.trim() || "Almaty";
    const nextErrors: AuthFieldErrors = {};

    setAuthErrors({});
    setAuthNotice(null);

    if (!isValidEmail(email)) {
      nextErrors.email = "Enter a real email address.";
    }

    if (authMode === "signup") {
      if (!name) {
        nextErrors.name = "Add your name before creating an account.";
      }
      if (!isStrongPassword(password)) {
        nextErrors.password = "Use at least 8 characters with letters and numbers.";
      }
      if (password !== authForm.confirmPassword.trim()) {
        nextErrors.confirmPassword = "Passwords do not match.";
      }
    } else {
      if (!password) {
        nextErrors.password = "Enter your password to log in.";
      }
    }

    if (!city) {
      nextErrors.city = "Add your city.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setAuthErrors(nextErrors);
      setAuthNotice({
        tone: "error",
        text: authMode === "signup" ? "Please fix the highlighted fields before creating your account." : "Please fix the highlighted fields before logging in.",
      });
      return;
    }

    setAuthPending(true);

    try {
      const user =
        authMode === "signup"
          ? await registerUser({ name, email, password, city })
          : await loginUser({ email, password });
      setProfile(mapUserToProfile(user));
      setView(roomId ? "game" : "home");
      setAuthErrors({});
      setAuthNotice({
        tone: "success",
        text: authMode === "signup" ? "Account created successfully. Opening your dashboard." : "Signed in successfully. Opening your dashboard.",
      });
      setToast(authMode === "signup" ? `Account created for ${user.name}.` : `Welcome back, ${user.name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed.";
      setAuthErrors({ form: message });
      setAuthNotice({ tone: "error", text: message });
      setToast(message);
    } finally {
      setAuthPending(false);
    }
  }

  async function signOut() {
    try {
      await logoutUser();
    } catch {
      setToast("Sign out failed.");
      return;
    }

    setView("home");
    setRoomId("");
    setRoomState(null);
    setFriendColor(null);
    setProfile({ ...defaultProfile, city: profile.city, rating: profile.rating });
    window.history.replaceState(null, "", "/");
    setToast("Signed out. Log in again to continue.");
  }

  function finishQuiz() {
    if (Object.keys(quizAnswers).length !== quizQuestions.length) {
      setToast("Answer all quiz questions to estimate your starting Elo.");
      return;
    }
    const rating = estimateQuizElo(quizAnswers);
    setProfile((current) => ({ ...current, rating }));
    if (profile.signedIn) {
      void patchProfile({ rating }).catch(() => undefined);
    }
    setQuizOpen(false);
    setToast(`Your estimated starting Elo is ${rating}. This comes from your quiz answers, not a random number.`);
  }

  function selectAiLevel(level: AiLevel) {
    setAiLevel(level);
    setMode("ai");
    setToast(makeAiLevelToast(level, profile));
  }

  function autoPickAiLevel() {
    const recommended = getAiLevelFromRating(profile);
    selectAiLevel(recommended);
  }

  function continueLesson(title: string) {
    setLessonProgress((current) => {
      const lesson = lessons.find((item) => item.title === title);
      const fallback = lesson?.progress ?? 0;
      return { ...current, [title]: clampLessonProgress(getLessonProgress(current, title, fallback)) };
    });
    setToast(getLessonBoost(title));
  }

  function selectPuzzle(index: number) {
    setSelectedPuzzleIndex(index);
    setPuzzleGame(loadPuzzleGame(index, puzzleSet));
    setPuzzleSelected(null);
    setPuzzleTargets([]);
    setPuzzleMessage(getPuzzleResultText(puzzleSet[index], isPuzzleSolved(puzzleSolved, puzzleSet[index])));
  }

  function requestPuzzleHint() {
    setPuzzleMessage(getPuzzleHint(selectedPuzzle));
  }

  function resetPuzzle() {
    setPuzzleGame(loadPuzzleGame(selectedPuzzleIndex, puzzleSet));
    setPuzzleSelected(null);
    setPuzzleTargets([]);
    setPuzzleMessage(selectedPuzzle.goal);
  }

  function handlePuzzleSquareClick(square: Square) {
    if (isPuzzleSolved(puzzleSolved, selectedPuzzle)) return;
    const piece = puzzleGame.get(square);

    if (!puzzleSelected) {
      if (piece?.color === "w") {
        setPuzzleSelected(square);
        setPuzzleTargets(puzzleGame.moves({ square, verbose: true }).map((move) => move.to));
      }
      return;
    }

    const nextGame = new Chess(puzzleGame.fen());
    const move = isValidPuzzleMove(nextGame, puzzleSelected, square);
    setPuzzleSelected(null);
    setPuzzleTargets([]);

    if (!move) {
      if (piece?.color === "w") {
        setPuzzleSelected(square);
        setPuzzleTargets(puzzleGame.moves({ square, verbose: true }).map((target) => target.to));
      }
      return;
    }

    if (isSameMove(move, selectedPuzzle)) {
      finishPuzzleReply(nextGame);
      setPuzzleGame(new Chess(nextGame.fen()));
      const nextSolved = { ...puzzleSolved, [selectedPuzzle.title]: true };
      setPuzzleSolved(nextSolved);
      setProfile((current) => ({
        ...current,
        rating: current.rating ? current.rating + getPuzzleRatingDelta(true) : current.rating,
      }));
      setPuzzleMessage(`${selectedPuzzle.solution.san} is correct. Pattern mastered: ${selectedPuzzle.theme}.`);
      setToast(`Puzzle solved: ${selectedPuzzle.title}.`);

      if (getPuzzleSolvedCount(nextSolved, puzzleSet) === puzzleSet.length) {
        const nextPuzzle = makeGeneratedPuzzle(puzzleSet.length);
        setPuzzleSet((current) => [...current, nextPuzzle]);
        setSelectedPuzzleIndex(puzzleSet.length);
        setPuzzleGame(new Chess(nextPuzzle.fen));
        setPuzzleMessage(`New puzzle generated: ${nextPuzzle.goal}`);
        setToast("All puzzles solved. Chess Master generated a fresh puzzle.");
      }
    } else {
      setPuzzleGame(loadPuzzleGame(selectedPuzzleIndex, puzzleSet));
      setPuzzleMessage(`Not quite. ${getPuzzleHint(selectedPuzzle)}`);
      setToast("Puzzle reset. Try again with the hint.");
    }
  }

  async function analyzeNow() {
    if (view !== "game") setView("coach");
    if (!canUseStockfish()) {
      setStockfishAnalysis(null);
      setToast(`${getCoachPositionLine(game, history)} Engine unavailable, so Chess Master is using the built-in positional coach instead.`);
      return;
    }

    setStockfishBusy(true);
    const analysis = await analyzeFen(game.fen(), 12);
    setStockfishAnalysis(analysis);
    setStockfishBusy(false);

    const best = analysis.bestMove ? playUciMove(new Chess(game.fen()), analysis.bestMove) : null;
    const scoreText =
      analysis.mate !== null
        ? `mate ${analysis.mate}`
        : analysis.scoreCp !== null
          ? `${(analysis.scoreCp / 100).toFixed(2)} pawns`
          : "no score";

    if (profile.signedIn && profile.notifications.coachTips && best) {
      void sendCoachTipEmail({
        tip: `Coach mode ${coachMode}: consider ${best.san}. Improve king safety, development, and center control before your next move.`,
        evaluation: scoreText,
      }).catch(() => undefined);
    }

    setToast(best ? `Stockfish recommends ${best.san} (${scoreText}).` : "Analysis refreshed with fallback positional advice.");
  }

  async function joinCommunityRoom(label: string) {
    setMode("friend");
    setToast(`${label} selected. Creating a live room for this community game.`);
    await createRoom();
  }

  function selectCity(city: string) {
    setProfile((current) => ({ ...current, city }));
    if (profile.signedIn) {
      void patchProfile({ city }).catch(() => undefined);
    }
    setToast(makeCityUpdate(city));
  }

  async function persistProfileSettings() {
    if (!profile.signedIn) return;

    try {
      setAuthPending(true);
      const user = await patchProfile({
        name: profile.name,
        city: profile.city,
        avatar: profile.avatar,
        rating: profile.rating,
        pro: profile.pro,
        notifications: profile.notifications,
      });
      setProfile(mapUserToProfile(user));
      setToast("Profile settings saved.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Failed to save profile settings.");
    } finally {
      setAuthPending(false);
    }
  }

  function cycleTheme() {
    const order: ThemeName[] = ["classic", "midnight", "royal", "carbon"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
    setToast(`${copy[language][next]} theme selected.`);
  }

  function updateTheme(next: ThemeName) {
    setTheme(next);
    setToast(copy[language].settingsSaved);
  }

  function updateLanguage(next: Language) {
  setLanguage(next);
  setToast(copy[next].settingsSaved);
  }

  function followLegend(name: string) {
    if (name.includes("Magnus")) {
      setView("learn");
      setToast("Magnus mindset selected: train calculation and practical decision-making.");
    } else if (name.includes("Judit")) {
      setView("puzzles");
      setToast("Judit mindset selected: sharpen tactics and attacking intuition.");
    } else {
      setView("coach");
      setToast("Kasparov mindset selected: analyze preparation and improve the next game.");
    }
  }

  function openExternal(url: string, label: string) {
    window.open(url, "_blank", "noopener,noreferrer");
    setToast(`${label} opened in a new tab.`);
  }

  function openCommunityDetail(detail: CommunityDetail) {
    setCommunityDetail(detail);
    setToast(`${detail.title} opened.`);
  }

  function joinCommunityDetail(detail: CommunityDetail) {
    void joinCommunityRoom(detail.title);
    setCommunityDetail(detail);
  }

  const nav = [
    { id: "home", labelKey: "home", icon: Play },
    { id: "play", labelKey: "play", icon: Swords },
    { id: "puzzles", labelKey: "puzzles", icon: Dumbbell },
    { id: "learn", labelKey: "learn", icon: BookOpen },
    { id: "coach", labelKey: "coach", icon: Brain },
    { id: "history", labelKey: "history", icon: History },
    { id: "community", labelKey: "community", icon: Users },
    { id: "leaderboard", labelKey: "cities", icon: Trophy },
    { id: "pro", labelKey: "pro", icon: Crown },
  ] as const;

  const welcomeBenefits = [
    "Secure backend account sign-in",
    "Saved lesson progress and game archive",
    "Stockfish review with move feedback",
    "Socket.IO live rooms and city community hubs",
  ];

  const coachActionPlan = [
    { title: "Opening reset", text: "Review your first 8 moves and compare them with basic development rules." },
    { title: "Tactical scan", text: "Before every move, check forcing moves: checks, captures, threats, and hanging pieces." },
    { title: "Endgame discipline", text: "Convert small advantages by centralizing the king and improving the worst piece." },
  ];

  const learnExtras = [
    { title: "Opening study", text: "Pair your current lesson with one external video and one practice game." },
    { title: "Tactics block", text: "Solve 3 puzzles before queueing a new game to warm up your pattern memory." },
    { title: "Review block", text: "Save one game and send it to Coach so the next lesson reflects your mistakes." },
  ];

  const communityExtras = [
    { title: "Friday rapid", text: "Arena-style city session with fast pairings and post-game review rooms." },
    { title: "Opening lab", text: "Players share one line, one trap, and one strategic idea from current study." },
    { title: "Coach office hour", text: "Drop one saved game and compare how different players would handle the critical moment." },
  ];

  if (!sessionChecked) {
    return (
      <main className={`app ${theme}`}>
        <section className="welcomeGate">
          <div className="welcomeHero">
            <span className="eyebrow">Starting Chess Master</span>
            <h2>Preparing your chess workspace.</h2>
            <p>Loading authentication, multiplayer, and training services.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`app ${theme}`}>
      <section className="topbar">
        <div className="brand">
          <div className="brandMark">♞</div>
          <div>
            <h1>Chess Master</h1>
            <p>Play, train, analyze, and climb your city ranking</p>
          </div>
        </div>

        <div className="topActions">
          <button className="iconButton mobileMenu" onClick={() => setMobileNavOpen((current) => !current)} aria-label="Open navigation">
            <Menu size={18} />
          </button>
          <button className="iconButton" onClick={cycleTheme} aria-label="Toggle theme">
            {theme === "classic" ? <Sun size={18} /> : theme === "midnight" ? <Moon size={18} /> : theme === "royal" ? <Crown size={18} /> : <Sparkles size={18} />}
          </button>
          {profile.signedIn ? (
            <button className="authButton" onClick={signOut}>
              <LogOut size={18} />
              Sign out
            </button>
          ) : (
            <>
              <button className="authButton" onClick={() => openAuth("login")} type="button">
                <LogIn size={18} />
                Log in
              </button>
              <button className="signupButton" onClick={() => openAuth("signup")} type="button">
                Start free
              </button>
            </>
          )}
          <button className="proButton" onClick={() => (profile.signedIn ? setView("pro") : openAuth("signup"))} type="button">
            <Crown size={18} />
            {profile.pro ? "Pro Active" : "Upgrade Pro"}
          </button>
        </div>
      </section>

      {!profile.signedIn ? (
        <section className="welcomeGate">
          <div className="welcomeHero">
            <span className="eyebrow">Welcome to Chess Master</span>
            <h2>Serious chess training starts after a real sign-in.</h2>
            <p>
              Use your email and password to enter your training space. After that, we take you into the full chess platform with saved progress, AI review, puzzles, lessons, and community rooms.
            </p>
            <div className="heroActions">
              <button className="primaryButton" onClick={() => openAuth("signup")} type="button">
                <LogIn size={18} />
                Create account
              </button>
              <button className="ghostButton" onClick={() => openAuth("login")} type="button">
                <KeyRound size={16} />
                Log in
              </button>
            </div>
            <div className="welcomeBenefits">
              {welcomeBenefits.map((item) => (
                <article key={item}>
                  <CheckCircle2 size={18} />
                  <span>{item}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="welcomeAuthPanel" ref={authPanelRef}>
            <div className="panelTitle">
              <Shield size={18} />
              <h3>Professional authorization</h3>
            </div>
            <p className="welcomeAuthLead">
              Create your account or log in here. This form talks directly to the backend and unlocks the full chess platform only after a real session is created.
            </p>
            <div className="authFeatureList">
              <div>
                <Database size={16} />
                <span>Backend user records, history, and notification settings</span>
              </div>
              <div>
                <Shield size={16} />
                <span>Validated email and stronger password requirements</span>
              </div>
              <div>
                <Users size={16} />
                <span>Feature pages unlock only after sign-in</span>
              </div>
            </div>
            <div className="authStatusCard">
              <strong>{authMode === "signup" ? "Create a serious training account" : "Welcome back to your training space"}</strong>
              <span>
                {authMode === "signup"
                  ? "Your account unlocks saved games, puzzle progress, city leaderboards, and friend rooms."
                  : "Log in to restore your dashboard, history, settings, and multiplayer access."}
              </span>
            </div>
            <div className="authModeSwitch welcomeAuthSwitch">
              <button
                type="button"
                className={authMode === "login" ? "activeAuthMode" : ""}
                onClick={() => {
                  setAuthMode("login");
                  setAuthErrors({});
                  setAuthNotice(null);
                }}
              >
                Log in
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "activeAuthMode" : ""}
                onClick={() => {
                  setAuthMode("signup");
                  setAuthErrors({});
                  setAuthNotice(null);
                }}
              >
                Create account
              </button>
            </div>
            <form className="welcomeAuthForm" onSubmit={submitAuth}>
              {authNotice && (
                <div className={`authInlineMessage ${authNotice.tone}`} role={authNotice.tone === "error" ? "alert" : "status"}>
                  <strong>{authNotice.tone === "success" ? "Success" : authNotice.tone === "error" ? "Check this" : "Heads up"}</strong>
                  <span>{authNotice.text}</span>
                </div>
              )}
              <div className="authProof">
                <span><CheckCircle2 size={15} /> Saved progress</span>
                <span><CheckCircle2 size={15} /> Cloud rooms</span>
                <span><CheckCircle2 size={15} /> Coach history</span>
              </div>
              {authMode === "signup" && (
                <label>
                  Name
                  <input
                    required
                    value={authForm.name}
                    aria-invalid={Boolean(fieldError(authErrors, "name"))}
                    onChange={(event) => {
                      setAuthForm({ ...authForm, name: event.target.value });
                      setAuthErrors((current) => ({ ...current, name: undefined, form: undefined }));
                    }}
                  />
                  {fieldError(authErrors, "name") && <small className="fieldError">{fieldError(authErrors, "name")}</small>}
                </label>
              )}
              <label>
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={authForm.email}
                  aria-invalid={Boolean(fieldError(authErrors, "email"))}
                  onChange={(event) => {
                    setAuthForm({ ...authForm, email: event.target.value });
                    setAuthErrors((current) => ({ ...current, email: undefined, form: undefined }));
                  }}
                />
                {fieldError(authErrors, "email") && <small className="fieldError">{fieldError(authErrors, "email")}</small>}
              </label>
              <label>
                Password
                <span className="passwordField">
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    minLength={8}
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    value={authForm.password}
                    aria-invalid={Boolean(fieldError(authErrors, "password"))}
                    onChange={(event) => {
                      setAuthForm({ ...authForm, password: event.target.value });
                      setAuthErrors((current) => ({ ...current, password: undefined, form: undefined }));
                    }}
                  />
                  <button
                    className="passwordToggle"
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
                {fieldError(authErrors, "password") && <small className="fieldError">{fieldError(authErrors, "password")}</small>}
              </label>
              {authMode === "signup" && (
                <label>
                  Confirm password
                  <span className="passwordField">
                    <input
                      required
                      type={showConfirmPassword ? "text" : "password"}
                      minLength={8}
                      autoComplete="new-password"
                      value={authForm.confirmPassword}
                      aria-invalid={Boolean(fieldError(authErrors, "confirmPassword"))}
                      onChange={(event) => {
                        setAuthForm({ ...authForm, confirmPassword: event.target.value });
                        setAuthErrors((current) => ({ ...current, confirmPassword: undefined, form: undefined }));
                      }}
                    />
                    <button
                      className="passwordToggle"
                      type="button"
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      aria-label={showConfirmPassword ? "Hide password confirmation" : "Show password confirmation"}
                    >
                      {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </span>
                  {fieldError(authErrors, "confirmPassword") && <small className="fieldError">{fieldError(authErrors, "confirmPassword")}</small>}
                </label>
              )}
              <label>
                City
                <input
                  value={authForm.city}
                  aria-invalid={Boolean(fieldError(authErrors, "city"))}
                  onChange={(event) => {
                    setAuthForm({ ...authForm, city: event.target.value });
                    setAuthErrors((current) => ({ ...current, city: undefined, form: undefined }));
                  }}
                />
                {fieldError(authErrors, "city") && <small className="fieldError">{fieldError(authErrors, "city")}</small>}
              </label>
              {authErrors.form && <div className="formErrorText" role="alert">{authErrors.form}</div>}
              <div className="authStack authActions">
                <button className="primaryButton" type="submit" disabled={authPending}>
                  {authPending ? "Please wait..." : authMode === "login" ? "Log in" : "Create account"}
                </button>
                <button
                  className="textButton"
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "signup" : "login");
                    setAuthErrors({});
                    setAuthNotice(null);
                  }}
                  disabled={authPending}
                >
                  {authMode === "login" ? "Need an account? Create one" : "Already have an account? Log in"}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : (
      <section className={`productShell ${mobileNavOpen ? "navOpen" : ""}`}>
        <aside className="navPanel">
          <div className="profileCard">
            <div className="avatar">{profile.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <strong>{profile.name}</strong>
              <span>{profile.signedIn ? profile.email : "Guest account"} · Elo {formatElo(profile.rating)}</span>
            </div>
          </div>

          <div className="navList">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={view === item.id ? "active" : ""}
                  onClick={() => {
                    setView(item.id);
                    setMobileNavOpen(false);
                  }}
                >
                  <Icon size={18} />
                  {t(item.labelKey)}
                </button>
              );
            })}
          </div>

          <div className="miniStats">
            <div>
              <span>Your Elo</span>
              <strong>{formatElo(profile.rating)}</strong>
            </div>
            <div>
              <span>Review</span>
              <strong>{reviewScore ? `${reviewScore}%` : "N/A"}</strong>
            </div>
          </div>
          <button className="wideButton quizNavButton" onClick={() => setQuizOpen(true)}>
            <Dumbbell size={16} />
            Estimate my Elo
          </button>
        </aside>

        <section className="mainStage">
          {view === "home" && (
            <section className="homeView">
              <div className="heroPanel">
                <div className="heroCopy">
                  <span className="eyebrow">Next-generation chess club</span>
                  <h2>Train like a serious player without losing the fun.</h2>
                  <p>
                    Chess Master combines fast games, honest Elo onboarding, AI review, tactical workouts, local city rankings, and friend rooms in one polished platform.
                  </p>
                  <div className="heroActions">
                    <button className="primaryButton" onClick={() => setView("play")}>
                      <Play size={18} />
                      Play now
                    </button>
                    <button className="ghostButton" onClick={() => openAuth("signup")}>
                      <LogIn size={16} />
                      Create account
                    </button>
                    <button className="ghostButton" onClick={() => setQuizOpen(true)}>
                      <Dumbbell size={16} />
                      Take Elo quiz
                    </button>
                  </div>
                </div>
                <div className="heroBoardPreview">
                  <div className="previewGlow" />
                  <div className="miniBoard">
                    {["♜", "♞", "♝", "♛", "♚", "♝", "♞", "♜", "♟", "♟", "♟", "", "", "♟", "♟", "♟", "", "", "", "", "♟", "", "", "", "", "", "", "♙", "♙", "", "", "", "", "", "♙", "", "", "♘", "", "", "♙", "♙", "", "", "", "♙", "♙", "♙", "♖", "♘", "♗", "♕", "♔", "♗", "", "♖"].map((piece, index) => (
                      <span key={`${piece}-${index}`} className={(Math.floor(index / 8) + index) % 2 === 0 ? "previewLight" : "previewDark"}>
                        {piece}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="quickCards">
                <button onClick={() => setView("play")}>
                  <Swords size={24} />
                  <strong>Play AI or friends</strong>
                  <span>Start a ranked training game or send a live room link.</span>
                </button>
                <button onClick={() => setView("puzzles")}>
                  <Dumbbell size={24} />
                  <strong>Daily tactics</strong>
                  <span>Train calculation with beautiful puzzle cards.</span>
                </button>
                <button onClick={() => setView("coach")}>
                  <Brain size={24} />
                  <strong>Review mistakes</strong>
                  <span>Get practical coaching notes after every game.</span>
                </button>
                <button onClick={() => setView("leaderboard")}>
                  <Trophy size={24} />
                  <strong>Represent your city</strong>
                  <span>Climb the leaderboard for {profile.city}.</span>
                </button>
              </div>

              <div className="arenaStrip">
                <div>
                  <span className="eyebrow">Tonight's arena</span>
                  <strong>Almaty Rapid Clash</strong>
                </div>
                <span>18 players online</span>
                <button className="primaryButton" onClick={() => setView("community")}>Join lobby</button>
              </div>

              <section className="trainingPlan">
                <div className="trainingHeader">
                  <div>
                    <span className="eyebrow">{homeCopy.mission}</span>
                    <h3>{homeCopy.missionTitle}</h3>
                    <p>{homeCopy.missionText}</p>
                  </div>
                  <div className="planBadge">
                    <Flame size={18} />
                    {profile.pro ? "Pro plan active" : "Starter path"}
                  </div>
                </div>

                <div className="missionGrid">
                  {homeMissions.map((mission) => {
                    const Icon = mission.icon;
                    return (
                      <article className="missionCard" key={mission.title}>
                        <div className="missionIcon">
                          <Icon size={22} />
                        </div>
                        <div>
                          <span>{mission.metric}</span>
                          <h4>{mission.title}</h4>
                          <p>{mission.text}</p>
                        </div>
                        <button className="ghostButton" onClick={mission.action}>
                          <Zap size={15} />
                          {mission.button}
                        </button>
                      </article>
                    );
                  })}
                </div>

                <div className="momentumBoard">
                  <div>
                    <span>{homeCopy.elo}</span>
                    <strong>{formatElo(profile.rating)}</strong>
                  </div>
                  <div>
                    <span>{homeCopy.course}</span>
                    <strong>{courseCompletion}%</strong>
                  </div>
                  <div>
                    <span>{homeCopy.puzzles}</span>
                    <strong>{solvedPuzzleCount}/{puzzleSet.length}</strong>
                  </div>
                  <div>
                    <span>{homeCopy.archive}</span>
                    <strong>{savedGames.length}</strong>
                  </div>
                  <p>{homeCopy.savedSummary}</p>
                </div>
              </section>
            </section>
          )}

          {view === "play" && (
            <section className="dashboardView playLobby">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">Choose your game</span>
                  <h2>Modern chess, clean setup, no wasted clicks.</h2>
                  <p className="sectionLead">Pick a mode, choose a time control, and launch straight into a focused game page with clocks, move list, coach help, and restart controls.</p>
                </div>
                <div className="planBadge">
                  <Flame size={18} />
                  {getTimeControlTitle(selectedTimeControl)}
                </div>
              </div>

              <div className="playModeGrid">
                <article className={mode === "friend" ? "playModeCard activePlayMode" : "playModeCard"}>
                  <Users size={24} />
                  <h3>Play vs Friend online</h3>
                  <p>Share a room link, assign colors automatically, and play a live game with saved history.</p>
                  <button className="wideButton" onClick={() => { setMode("friend"); void createRoom(); }} disabled={roomBusy}>
                    {roomBusy ? "Creating room..." : "Start friend room"}
                  </button>
                </article>
                <article className={mode === "local" ? "playModeCard activePlayMode" : "playModeCard"}>
                  <Crown size={24} />
                  <h3>Play on one device</h3>
                  <p>Two players, one board, optional auto-rotation after every move, and the same clock logic.</p>
                  <button className="wideButton" onClick={() => startGame("local")}>
                    Start local 1v1
                  </button>
                </article>
                <article className={mode === "ai" ? "playModeCard activePlayMode" : "playModeCard"}>
                  <Brain size={24} />
                  <h3>Play vs AI</h3>
                  <p>Train against an easy, club, or master-strength bot with live coach suggestions and clean review.</p>
                  <button className="wideButton" onClick={() => startGame("ai")}>
                    Start AI game
                  </button>
                </article>
              </div>

              <div className="timeControlPanel">
                <div className="panelTitle">
                  <Zap size={18} />
                  <h3>Time controls</h3>
                </div>
                <div className="timeControlGroups">
                  {timeControlGroups.map((group) => (
                    <div key={group.category} className="timeControlGroup">
                      <span className="eyebrow">{group.category}</span>
                      <div className="timeControlOptions">
                        {group.options.map((option) => (
                          <button
                            key={option.id}
                            className={selectedTimeControl.id === option.id ? "timeCard activeTimeCard" : "timeCard"}
                            onClick={() => setSelectedTimeControlId(option.id)}
                          >
                            <strong>{option.label}</strong>
                            <small>{option.category}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <div className="timeControlGroup">
                    <span className="eyebrow">Custom</span>
                    <div className="customTimeControl">
                      <label>
                        Minutes
                        <input
                          type="number"
                          min={1}
                          max={180}
                          value={customMinutes}
                          onChange={(event) => {
                            setSelectedTimeControlId("custom");
                            setCustomMinutes(Math.max(1, Number(event.target.value) || 1));
                          }}
                        />
                      </label>
                      <label>
                        Increment
                        <input
                          type="number"
                          min={0}
                          max={60}
                          value={customIncrement}
                          onChange={(event) => {
                            setSelectedTimeControlId("custom");
                            setCustomIncrement(Math.max(0, Number(event.target.value) || 0));
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
                <div className="timeSummaryBar">
                  <div>
                    <strong>{getModeLabel(mode)}</strong>
                    <span>{getTimeControlTitle(selectedTimeControl)}</span>
                  </div>
                  <button className="primaryButton" onClick={() => (mode === "friend" ? void createRoom() : startGame(mode))} disabled={roomBusy}>
                    <Play size={16} />
                    Play Game
                  </button>
                </div>
              </div>

              <div className="playSupportGrid">
                <article className="coachCard">
                  <div className="panelTitle">
                    <Brain size={18} />
                    <h3>AI setup</h3>
                  </div>
                  {(Object.keys(aiProfiles) as AiLevel[]).map((level) => (
                    <button key={level} className={aiLevel === level ? "aiLevel activeAi" : "aiLevel"} onClick={() => selectAiLevel(level)}>
                      <span className={getBotClass(level)}>{getBotAvatar(level)}</span>
                      <span>
                        <strong>{aiProfiles[level].name}</strong>
                        <small>{aiProfiles[level].rating} Elo · {aiProfiles[level].depth}</small>
                      </span>
                    </button>
                  ))}
                  <button className="ghostButton aiRecommend" onClick={autoPickAiLevel}>Use recommended AI</button>
                </article>

                <article className="roomCard">
                  <div className="panelTitle">
                    <History size={18} />
                    <h3>Recent games</h3>
                  </div>
                  {savedGames.length === 0 ? (
                    <div className="emptyState compactEmpty">No games saved yet. Start with a short blitz or a local practice match.</div>
                  ) : (
                    <div className="recentGames">
                      {savedGames.slice(0, 3).map((savedGame) => (
                        <div key={savedGame.id} className="recentGameRow">
                          <strong>{savedGame.result}</strong>
                          <span>{savedGame.mode} · {savedGame.moves.length} moves</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <div className="booksGrid">
                {chessBooks.slice(0, 3).map((book) => (
                  <article className="bookCard" key={book.title}>
                    <span>{book.tag}</span>
                    <h3>{book.title}</h3>
                    <strong>{book.author}</strong>
                    <p>{book.reason}</p>
                    <small>{book.level}</small>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === "game" && (
            <div className="gamePage">
              <section className="gameBoardShell">
                <div className="gameHeader">
                  <div>
                    <span className="eyebrow">{getModeLabel(mode)} · {getTimeControlTitle(mode === "friend" && roomState ? roomState.timeControl : selectedTimeControl)}</span>
                    <h2>{displayStatus}</h2>
                  </div>
                  <div className="headerActions">
                    <button className="ghostButton" onClick={() => saveGame("manual")}>
                      <Save size={16} />
                      Save
                    </button>
                    <button className="ghostButton" onClick={backToLobby}>
                      <Menu size={16} />
                      Back to lobby
                    </button>
                  </div>
                </div>

                <div className="timerStack topTimer">
                  <div>
                    <span>{mode === "friend" ? roomState?.players.black?.name || "Black" : mode === "ai" ? aiProfiles[aiLevel].name : "Black"}</span>
                    <strong>{formatClock(mode === "friend" && roomState ? roomState.remainingMs.black : blackTimeMs)}</strong>
                  </div>
                  <small>{activeTurn === "black" ? "Clock running" : "Waiting"}</small>
                </div>

                <div className={boardOrientation === "black" ? "board boardFlipped" : "board"} aria-label="Chess board">
                  {displayedBoard.map(({ square, piece }, index) => {
                    const isLight = (Math.floor(index / 8) + index) % 2 === 0;
                    const isSelected = selected === square;
                    const isTarget = legalTargets.includes(square);
                    const file = square[0];
                    const rank = square[1];
                    return (
                      <button
                        key={square}
                        className={[
                          "square",
                          isLight ? "lightSquare" : "darkSquare",
                          isSelected ? "selected" : "",
                          isTarget ? "target" : "",
                        ].join(" ")}
                        onClick={() => handleSquareClick(square)}
                        aria-label={square}
                      >
                        <span className={piece ? `piece ${piece.color}` : "piece"}>
                          {piece ? pieceIcons[`${piece.color}${piece.type}`] : ""}
                        </span>
                        {file === (boardOrientation === "white" ? "a" : "h") && <span className="coord rankCoord">{rank}</span>}
                        {rank === (boardOrientation === "white" ? "1" : "8") && <span className="coord fileCoord">{file}</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="timerStack bottomTimer">
                  <div>
                    <span>{mode === "friend" ? roomState?.players.white.name || "White" : "White"}</span>
                    <strong>{formatClock(mode === "friend" && roomState ? roomState.remainingMs.white : whiteTimeMs)}</strong>
                  </div>
                  <small>{activeTurn === "white" ? "Clock running" : "Waiting"}</small>
                </div>

                <div className="gameActionRow">
                  <button className="ghostButton" onClick={resignGame}>Resign</button>
                  <button className="ghostButton" onClick={offerDraw}>Offer draw</button>
                  <button className="ghostButton" onClick={restartCurrentGame} disabled={roomBusy}>{mode === "friend" ? "New room" : "Restart"}</button>
                </div>
              </section>

              <aside className="gameSideRail">
                <div className="coachCard gameCoachCard">
                  <div className="panelTitle">
                    <Brain size={19} />
                    <h3>Coach panel</h3>
                  </div>
                  <p>{stockfishBusy ? "Analyzing position..." : displayStatus}</p>
                  <div className="coachActions">
                    <button className="ghostButton" onClick={analyzeNow}>{stockfishBusy ? "Analyzing..." : "Analyze again"}</button>
                    <button className="ghostButton" onClick={() => setCoachMode("beginner")}>Explain simpler</button>
                    <button
                      className="ghostButton"
                      onClick={() =>
                        setToast(
                          findBestMove(game) || history[history.length - 1]
                            ? getMoveFeedback((findBestMove(game) || history[history.length - 1]) as Move, coachMode)
                            : "Training tip: develop pieces, fight for the center, and secure your king before attacking.",
                        )
                      }
                    >
                      Training tip
                    </button>
                  </div>
                  <div className="coachBulletPanel">
                    <div>
                      <span>Best move</span>
                      <strong>{stockfishAnalysis?.bestMove || (findBestMove(game)?.san ?? "Heuristic move ready")}</strong>
                    </div>
                    <div>
                      <span>Evaluation</span>
                      <strong>{formatEvaluation(stockfishAnalysis)}</strong>
                    </div>
                    <div>
                      <span>Why it works</span>
                      <p>{coachReport[0]?.text || getCoachEmptyText(history)}</p>
                    </div>
                    <div>
                      <span>Danger to avoid</span>
                      <p>{coachReport.find((item) => item.tone === "warning")?.text || "No immediate tactical warning. Stay alert to checks and hanging pieces."}</p>
                    </div>
                  </div>
                </div>

                <div className="roomCard">
                  <div className="panelTitle">
                    <Users size={19} />
                    <h3>Game info</h3>
                  </div>
                  <p>{getModeLabel(mode)} · {getTimeControlTitle(mode === "friend" && roomState ? roomState.timeControl : selectedTimeControl)}</p>
                  {mode === "local" && (
                    <label className="toggleRow">
                      <span>Auto-rotate board</span>
                      <input type="checkbox" checked={autoRotateBoard} onChange={(event) => setAutoRotateBoard(event.target.checked)} />
                    </label>
                  )}
                  {roomId && (
                    <>
                      <code>{roomUrl}</code>
                      <button className="wideButton" onClick={copyRoomLink}>
                        <Copy size={16} />
                        Copy room link
                      </button>
                      <label>
                        Invite by email
                        <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="friend@example.com" />
                      </label>
                      <button className="ghostButton wideButton" onClick={sendInviteEmail} disabled={inviteBusy}>
                        {inviteBusy ? "Sending invite..." : "Send invite email"}
                      </button>
                    </>
                  )}
                </div>

                <div className="movesCard">
                  <div className="panelTitle">
                    <History size={19} />
                    <h3>Move history</h3>
                  </div>
                  <div className="moveList">
                    {history.length === 0 ? (
                      <span className="empty">Moves will appear after the game starts.</span>
                    ) : (
                      history.map((move, index) => (
                        <span key={`${move.san}-${index}`}>
                          {index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}
                          {move.san}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="booksGrid compactBooksGrid">
                  {chessBooks.slice(0, 2).map((book) => (
                    <article className="bookCard" key={`game-${book.title}`}>
                      <span>{book.tag}</span>
                      <h3>{book.title}</h3>
                      <strong>{book.author}</strong>
                      <p>{book.reason}</p>
                      <small>{book.level}</small>
                    </article>
                  ))}
                </div>
              </aside>
            </div>
          )}

          {view === "puzzles" && (
            <section className="dashboardView">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">Tactics gym</span>
                  <h2>Daily puzzle set</h2>
                  <p className="sectionLead">{getPuzzleProgressLabel(puzzleSolved, puzzleSet)}. Pick a puzzle, solve it on the board, and build pattern memory.</p>
                </div>
                <button className="primaryButton" onClick={() => selectPuzzle((selectedPuzzleIndex + 1) % puzzleSet.length)}>
                  <Zap size={16} />
                  Next puzzle
                </button>
              </div>
              <div className="puzzleTrainer">
                <div>
                  <span className="eyebrow">{getSelectedPuzzleHeader(selectedPuzzleIndex, puzzleSolved, puzzleSet)}</span>
                  <h3>{getPuzzleStatus(puzzleGame, isPuzzleSolved(puzzleSolved, selectedPuzzle))}</h3>
                  <p>{puzzleMessage}</p>
                  <div className="puzzleActions">
                    <button className="ghostButton" onClick={requestPuzzleHint}>Hint</button>
                    <button className="ghostButton" onClick={resetPuzzle}>Reset puzzle</button>
                  </div>
                </div>
                <div className="puzzlePlayBoard">
                  {puzzleBoard.map(({ square, piece }, index) => {
                    const isLight = (Math.floor(index / 8) + index) % 2 === 0;
                    const isSelected = puzzleSelected === square;
                    const isTarget = puzzleTargets.includes(square);
                    return (
                      <button
                        key={`puzzle-${square}`}
                        className={[
                          "square",
                          isLight ? "lightSquare" : "darkSquare",
                          isSelected ? "selected" : "",
                          isTarget ? "target" : "",
                        ].join(" ")}
                        onClick={() => handlePuzzleSquareClick(square)}
                      >
                        <span className={piece ? `piece ${piece.color}` : "piece"}>
                          {piece ? pieceIcons[`${piece.color}${piece.type}`] : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="puzzleGrid">
                {puzzleSet.map((puzzle, index) => (
                  <article className={selectedPuzzleIndex === index ? "puzzleCard selectedPuzzleCard" : "puzzleCard"} key={puzzle.title}>
                    <div className="puzzleBoard">
                      {fenPreview(puzzle.fen).map((piece, index) => (
                        <span key={`${puzzle.title}-${index}`} className={(Math.floor(index / 8) + index) % 2 === 0 ? "previewLight" : "previewDark"}>
                          {piece}
                        </span>
                      ))}
                    </div>
                    <div>
                      <span>{puzzle.theme} · {puzzle.rating}</span>
                      <h3>{puzzle.title}</h3>
                      <p>{puzzle.goal}</p>
                    </div>
                    <button className="wideButton" onClick={() => selectPuzzle(index)}>
                      {getPuzzleButtonLabel(selectedPuzzleIndex === index, isPuzzleSolved(puzzleSolved, puzzle))}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === "learn" && (
            <section className="dashboardView">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">Academy</span>
                  <h2>Personal training path</h2>
                  <p className="sectionLead">A structured path that adapts to your estimated Elo and saved game mistakes.</p>
                </div>
                <BookOpen size={34} />
              </div>
              <div className="academyHero">
                <div>
                  <span className="eyebrow">Recommended today · {courseCompletion}% complete</span>
                  <h3>{getLearnHeroTitle(lessonProgress)}</h3>
                  <p>{getLearnHeroText(lessonProgress)}</p>
                </div>
                <button className="primaryButton" onClick={() => continueLesson(getNextLesson(lessonProgress).title)}>Start lesson</button>
              </div>
              <div className="youtubeGrid featuredLinks">
                <div className="sectionHeader compactHeader">
                  <div>
                    <span className="eyebrow">Education library</span>
                    <h3>Learn from trusted chess teachers</h3>
                    <p className="sectionLead">Use these study links together with your Chess Master lessons and Stockfish review.</p>
                  </div>
                </div>
                {youtubeLessons.map((lesson) => (
                  <a key={lesson.title} href={lesson.url} target="_blank" rel="noreferrer" className="youtubeCard">
                    <span>{lesson.level}</span>
                    <strong>{lesson.title}</strong>
                    <p>{lesson.text}</p>
                    <small>
                      Open resource
                      <ExternalLink size={14} />
                    </small>
                  </a>
                ))}
              </div>
              <div className="lessonList">
                {lessons.map((lesson) => (
                  <article className="lessonCard" key={lesson.title}>
                    <div>
                      <span>{lesson.level}</span>
                      <h3>{lesson.title}</h3>
                      <p>{lesson.text}</p>
                    </div>
                    <div className="lessonMeta">
                      <span>{lesson.modules} modules</span>
                      <span>{lesson.duration}</span>
                    </div>
                    <div className="progressTrack">
                      <span style={{ width: `${getLessonProgress(lessonProgress, lesson.title, lesson.progress)}%` }} />
                    </div>
                    <button className="ghostButton" onClick={() => continueLesson(lesson.title)}>
                      {chooseLessonAction(getLessonProgress(lessonProgress, lesson.title, lesson.progress))}
                    </button>
                  </article>
                ))}
              </div>
              <div className="utilityGrid">
                {learnExtras.map((item) => (
                  <article className="utilityCard" key={item.title}>
                    <BookOpen size={20} />
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                    <button className="ghostButton" onClick={() => setView(item.title.includes("Tactics") ? "puzzles" : item.title.includes("Review") ? "coach" : "play")}>
                      Open focus
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === "coach" && (
            <section className="dashboardView">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">AI Coach</span>
                  <h2>Post-game report</h2>
                  <p className="sectionLead">
                    Stockfish is connected for best-move analysis when the browser worker is available. The coach also explains practical habits from your move history.
                  </p>
                </div>
                <div className="coachHeaderActions">
                  <div className="reviewRing">{reviewScore ? `${reviewScore}%` : "N/A"}</div>
                  <button className="primaryButton" onClick={analyzeNow}>{stockfishBusy ? "Analyzing..." : "Analyze with Stockfish"}</button>
                </div>
              </div>
              <div className="stockfishPanel">
                <strong>{canUseStockfish() ? "Stockfish engine ready" : "Stockfish worker unavailable"}</strong>
                <span>
                  {stockfishAnalysis?.bestMove
                    ? `Best move: ${stockfishAnalysis.bestMove} · ${
                        stockfishAnalysis.mate !== null
                          ? `mate ${stockfishAnalysis.mate}`
                          : stockfishAnalysis.scoreCp !== null
                            ? `${(stockfishAnalysis.scoreCp / 100).toFixed(2)} pawns`
                            : "score pending"
                      }`
                    : `Fallback coach active: ${findBestMove(game)?.san ?? "develop pieces and secure the king"}. Analyze again whenever the worker is available.`}
                </span>
                <div className="coachModes">
                  {(["beginner", "intermediate", "advanced"] as CoachMode[]).map((modeName) => (
                    <button
                      key={modeName}
                      className={coachMode === modeName ? "activeCoachMode" : ""}
                      onClick={() => setCoachMode(modeName)}
                    >
                      {modeName}
                    </button>
                  ))}
                </div>
                <span>
                  Evaluation: {formatEvaluation(stockfishAnalysis)} · Coach mode: {coachMode}
                </span>
                <div className="coachActions">
                  <button className="ghostButton" onClick={analyzeNow}>{stockfishBusy ? "Analyzing..." : "Analyze again"}</button>
                  <button className="ghostButton" onClick={() => setCoachMode("beginner")}>Explain simpler</button>
                  <button className="ghostButton" onClick={() => setToast(coachReport[0]?.text || getCoachEmptyText(history))}>Give me a training tip</button>
                </div>
              </div>
              <div className="coachLine">
                <strong>{getReviewLabel(reviewScore)}</strong>
                <span>{history.length ? getCoachPositionLine(game, history) : getCoachEmptyText(history)}</span>
              </div>
              <div className="coachSummary">
                {dynamicCoachTimeline.map((item) => (
                  <article key={item.label}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.score}/100</span>
                    </div>
                    <p>{item.text}</p>
                    <div className="progressTrack">
                      <span style={{ width: `${item.score}%` }} />
                    </div>
                  </article>
                ))}
              </div>
              <div className="insightGrid">
                {coachReport.map((insight) => (
                  <article className={`insightCard ${insight.tone}`} key={insight.title}>
                    <CheckCircle2 size={20} />
                    <h3>{insight.title}</h3>
                    <p>{insight.text}</p>
                  </article>
                ))}
              </div>
              <div className="utilityGrid">
                {coachActionPlan.map((item) => (
                  <article className="utilityCard" key={item.title}>
                    <Brain size={20} />
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                    <button className="ghostButton" onClick={() => setView("play")}>
                      Return to board
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === "history" && (
            <section className="dashboardView">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">Saved games</span>
                  <h2>Your training archive</h2>
                </div>
                <button className="ghostButton" onClick={() => saveGame("manual")}>
                  <Save size={16} />
                  Save current
                </button>
              </div>
              <div className="historyList">
                {historyLoading ? (
                  <div className="emptyState">Loading your saved games...</div>
                ) : savedGames.length === 0 ? (
                  <div className="emptyState">Finish or save a game to build your archive.</div>
                ) : (
                  savedGames.map((savedGame) => (
                    <article className="savedGame" key={savedGame.id}>
                      <div>
                        <strong>{savedGame.result}</strong>
                        <span>{formatDate(savedGame.date)} · {savedGame.mode === "ai" ? "AI game" : "Friend room"} · {savedGame.city}</span>
                      </div>
                      <div className="savedMeta">
                        <span>{getHistoryScoreLabel(savedGame.reviewScore)}</span>
                        <span>{savedGame.moves.length} moves</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <div className="booksGrid">
                {chessBooks.slice(2, 5).map((book) => (
                  <article className="bookCard" key={`history-${book.title}`}>
                    <span>{book.tag}</span>
                    <h3>{book.title}</h3>
                    <strong>{book.author}</strong>
                    <p>{book.reason}</p>
                    <small>{book.level}</small>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === "leaderboard" && (
            <section className="dashboardView">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">Social layer</span>
                  <h2>City leaderboard</h2>
                  <p className="sectionLead">{getLeaderboardSubtitle(profile)}. Choose a city and compete in weekly standings.</p>
                </div>
                <Trophy size={34} />
              </div>
              <div className="cityCards">
                {cityStats.map((city) => (
                  <article className={profile.city === city.city ? "activeCity" : ""} key={city.city}>
                    <span>{city.city}</span>
                    <strong>{city.players.toLocaleString()} players</strong>
                    <p>{city.active} active today · average Elo {city.avg}</p>
                    <button className="ghostButton" onClick={() => selectCity(city.city)}>Represent {city.city}</button>
                  </article>
                ))}
              </div>
              <div className="leaderboard">
                {leaderboard.map((entry) => (
                  <div className={entry.name === profile.name ? "leaderRow currentUser" : "leaderRow"} key={`${entry.name}-${entry.rank}`}>
                    <span>#{entry.rank}</span>
                    <strong>{entry.name}</strong>
                    <span>{entry.city}</span>
                    <span>{entry.rating}</span>
                    <span>{entry.title}</span>
                    <span>{getCityRankLabel(entry.rank)}</span>
                    <span><Flame size={15} /> {entry.streak}</span>
                  </div>
                ))}
              </div>
              <div className="communityClubGrid compactClubGrid">
                {communityClubs.map((club) => (
                  <article className="clubCard" key={`leader-${club.name}`}>
                    <span>{profile.city} chess clubs</span>
                    <h3>{club.name}</h3>
                    <strong>{club.address}</strong>
                    <p>{club.description}</p>
                    <button className="wideButton" onClick={() => openExternal(get2gisSearchUrl(club.query), `${club.name} in 2GIS`)}>
                      Suggested 2GIS search
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === "community" && (
            <section className="dashboardView">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">{t("clubhouse")}</span>
                  <h2>{t("communityHub")}</h2>
                  <p className="sectionLead">
                    {getCommunityHeadline(profile)} {roomState?.roomId ? `${t("currentRoom")}: ${roomState.roomId}.` : ""}
                  </p>
                </div>
                <button className="primaryButton" onClick={() => void createRoom()}>
                  <Users size={16} />
                  {t("hostRoom")}
                </button>
              </div>
              {communityDetail ? (
                <div className="communityDetail">
                  <button className="textButton backButton" onClick={() => setCommunityDetail(null)}>
                    {t("backCommunity")}
                  </button>
                  <span className="eyebrow">{communityDetail.tag}</span>
                  <h3>{communityDetail.title}</h3>
                  <p>{communityDetail.description}</p>
                  <div className="detailStats">
                    <div>
                      <span>{t("participants")}</span>
                      <strong>{communityDetail.meta}</strong>
                    </div>
                    <div>
                      <span>{t("schedule")}</span>
                      <strong>{communityDetail.schedule}</strong>
                    </div>
                    <div>
                      <span>{t("prize")}</span>
                      <strong>{communityDetail.prize}</strong>
                    </div>
                  </div>
                  <div className="detailActions">
                    <button className="primaryButton" onClick={() => joinCommunityDetail(communityDetail)}>
                      {t("joinNow")}
                    </button>
                    <button className="ghostButton" onClick={() => setView("play")}>
                      {t("openRoom")}
                    </button>
                  </div>
                  <div className="utilityGrid">
                    {communityExtras.map((item) => (
                      <article className="utilityCard" key={item.title}>
                        <Users size={20} />
                        <h3>{item.title}</h3>
                        <p>{item.text}</p>
                        <button className="ghostButton" onClick={() => setView("play")}>
                          Open room
                        </button>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="communityClubGrid">
                    {communityClubs.map((club) => (
                      <article className="clubCard" key={`${profile.city}-${club.name}`}>
                        <span>{profile.city}</span>
                        <h3>{club.name}</h3>
                        <strong>{club.address}</strong>
                        <p>{club.description}</p>
                        <div className="clubMeta">
                          <span>{club.hours}</span>
                          <span>{club.level}</span>
                          <span>{club.contact}</span>
                        </div>
                        <button className="wideButton" onClick={() => openExternal(get2gisSearchUrl(club.query), `${club.name} in 2GIS`)}>
                          Open in 2GIS
                        </button>
                      </article>
                    ))}
                  </div>
                  <div className="communityGrid">
                    {communityPosts.map((post) => (
                      <article className="communityCard" key={post.title}>
                        <span>{post.tag}</span>
                        <h3>{post.title}</h3>
                        <p>{post.meta}</p>
                        <button className="ghostButton" onClick={() => openCommunityDetail(post)}>{post.action}</button>
                      </article>
                    ))}
                  </div>
                  <div className="liveRooms">
                    {roomList.map((room) => (
                      <button key={room.label} onClick={() => openCommunityDetail(makeRoomDetail(room.label, profile))}>
                        <span>{room.label}</span>
                        <strong>{room.online} online</strong>
                        <small>{room.level}</small>
                      </button>
                    ))}
                  </div>
                  <div className="communityWisdom">
                    <div className="sectionHeader compactHeader">
                      <div>
                        <span className="eyebrow">Chess wisdom</span>
                        <h3>Words before a hard game</h3>
                      </div>
                    </div>
                    {communityWisdom.map((item) => (
                      <button key={item.player} onClick={() => setToast(`${item.player}: ${item.text}`)}>
                        <strong>"{item.text}"</strong>
                        <span>{item.player}</span>
                      </button>
                    ))}
                  </div>
                  <div className="reportLinks">
                    <div className="sectionHeader compactHeader">
                      <div>
                        <span className="eyebrow">Chess reports</span>
                        <h3>Follow real tournament news</h3>
                      </div>
                    </div>
                    {chessReportLinks.map((link) => (
                      <button key={link.title} onClick={() => openExternal(link.url, link.title)}>
                        <span>{link.title}</span>
                        <small>{link.source}</small>
                        <ExternalLink size={15} />
                      </button>
                    ))}
                  </div>
                  <div className="booksGrid">
                    {chessBooks.slice(0, 3).map((book) => (
                      <article className="bookCard" key={`community-${book.title}`}>
                        <span>{book.tag}</span>
                        <h3>{book.title}</h3>
                        <strong>{book.author}</strong>
                        <p>{book.reason}</p>
                        <small>{book.level}</small>
                      </article>
                    ))}
                  </div>
                  <div className="utilityGrid">
                    {communityExtras.map((item) => (
                      <article className="utilityCard" key={item.title}>
                        <Users size={20} />
                        <h3>{item.title}</h3>
                        <p>{item.text}</p>
                        <button className="ghostButton" onClick={() => setView("play")}>
                          Open room
                        </button>
                      </article>
                    ))}
                  </div>
                </>
              )}
              <div className="newsPanel">
                <div className="panelTitle">
                  <Newspaper size={19} />
                  <h3>{t("masterDigest")}</h3>
                </div>
                <p>Weekly recap cards, tournament announcements, and coach tips update from your active rooms and saved training progress.</p>
              </div>
            </section>
          )}

          {view === "pro" && (
            <section className="dashboardView proView">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">Business layer</span>
                  <h2>Chess Master Pro</h2>
                </div>
                <BadgeDollarSign size={36} />
              </div>
              <div className="pricingGrid">
                <article className="priceCard">
                  <Shield size={24} />
                  <h3>Free</h3>
                  <strong>$0</strong>
                  <p>AI games, basic coach notes, local history, and city leaderboard.</p>
                </article>
                <article className="priceCard highlighted">
                  <Crown size={24} />
                  <h3>Pro</h3>
                  <strong>$9/mo</strong>
                  <p>Deep Stockfish analysis, opening prep, custom boards, cloud archive, and advanced city rankings.</p>
                  <button className="wideButton" onClick={upgradeToPro}>
                    <Sparkles size={16} />
                    {profile.pro ? "Pro is active" : "Activate prototype Pro"}
                  </button>
                </article>
              </div>
            </section>
          )}
        </section>

        <aside className="rightRail">
          <div className="profileEditor">
            <div className="panelTitle">
              <KeyRound size={18} />
              <h3>{profile.signedIn ? "Secure account" : "Create your account"}</h3>
            </div>
            <div className="authStatus">
              <span className={profile.signedIn ? "statusDot online" : "statusDot"} />
              <div>
                <strong>{profile.signedIn ? profile.name : "Guest session"}</strong>
                <small>{profile.signedIn ? profile.email : "Sign in to save progress across devices"}</small>
              </div>
            </div>
            <div className="authFeatureList">
              <div>
                <Database size={16} />
                <span>Backend auth, history, and notifications active</span>
              </div>
              <div>
                <Shield size={16} />
                <span>Protected session cookie and verified email/password flow</span>
              </div>
              <div>
                <Users size={16} />
                <span>{roomState?.roomId ? "Socket room connected" : "Create a room to start live multiplayer"}</span>
              </div>
            </div>
            <div className="authStack">
              {profile.signedIn ? (
                <button className="ghostButton" onClick={signOut}>Sign out</button>
              ) : (
                <>
                  <button className="primaryButton" onClick={() => openAuth("signup")}>Create account</button>
                  <button className="ghostButton" onClick={() => openAuth("login")}>Log in</button>
                </>
              )}
            </div>
            <label>
              Name
              <input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value || "Guest Player" })} />
            </label>
            <label>
              City
              <input value={profile.city} onChange={(event) => setProfile({ ...profile, city: event.target.value || "Almaty" })} />
            </label>
            <div className="settingsGroup">
              <span>Email notifications</span>
              <div className="notificationOptions">
                <label className="toggleRow">
                  <input
                    type="checkbox"
                    checked={profile.notifications.gameInvitations}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        notifications: {
                          ...current.notifications,
                          gameInvitations: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>Game invitations</span>
                </label>
                <label className="toggleRow">
                  <input
                    type="checkbox"
                    checked={profile.notifications.gameResults}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        notifications: {
                          ...current.notifications,
                          gameResults: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>Game results</span>
                </label>
                <label className="toggleRow">
                  <input
                    type="checkbox"
                    checked={profile.notifications.coachTips}
                    onChange={(event) =>
                      setProfile((current) => ({
                        ...current,
                        notifications: {
                          ...current.notifications,
                          coachTips: event.target.checked,
                        },
                      }))
                    }
                  />
                  <span>Coach tips</span>
                </label>
              </div>
            </div>
            {profile.signedIn && (
              <button className="primaryButton" onClick={() => void persistProfileSettings()} disabled={authPending}>
                {authPending ? "Saving..." : "Save settings"}
              </button>
            )}
          </div>

          <div className="roadmapCard grandmasterCard">
            <div className="panelTitle">
              <Sparkles size={18} />
              <h3>Grandmaster mindset</h3>
            </div>
            <blockquote>
              "When you see a good move, look for a better one."
              <span>Emanuel Lasker</span>
            </blockquote>
            <blockquote>
              "Tactics flow from a superior position."
              <span>Bobby Fischer</span>
            </blockquote>
            <blockquote>
              "Chess is everything: art, science, and sport."
              <span>Anatoly Karpov</span>
            </blockquote>
          </div>

          <div className="roadmapCard legendsCard">
            <div className="panelTitle">
              <Trophy size={18} />
              <h3>Legends corner</h3>
            </div>
            <div className="legendList">
              {legends.map((legend) => (
                <article key={legend.name} className="legendCard">
                  <img src={legend.image} alt={legend.name} loading="lazy" />
                  <div>
                    <span>{legend.role}</span>
                    <strong>{legend.name}</strong>
                    <p>{legend.message}</p>
                    <button className="ghostButton" onClick={() => followLegend(legend.name)}>
                      {legend.action}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="roadmapCard levelCard">
            <div className="panelTitle">
              <Crown size={18} />
              <h3>Great level coverage</h3>
            </div>
            <div className="levelTags">
              <span>Stockfish AI</span>
              <span>Game history</span>
              <span>Auth + progress</span>
              <span>Dark / light</span>
              <span>Secure sign-in</span>
              <span>Mobile board</span>
              <span>Live socket rooms</span>
              <span>AI Coach</span>
              <span>City leaderboard</span>
              <span>Training academy</span>
              <span>Generated puzzles</span>
              <span>Stripe-ready Pro</span>
            </div>
          </div>

          <div className="roadmapCard settingsCard">
            <div className="panelTitle">
              <Palette size={18} />
              <h3>{t("preferences")}</h3>
            </div>
            <div className="settingsGroup">
              <span>{t("theme")}</span>
              <div className="themeOptions">
                {themeOptions.map((option) => (
                  <button
                    key={option.id}
                    className={theme === option.id ? `themeChoice ${option.id} activeThemeChoice` : `themeChoice ${option.id}`}
                    onClick={() => updateTheme(option.id)}
                  >
                    <strong>{t(option.labelKey as keyof typeof copy.en)}</strong>
                    <small>{option.description}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="settingsGroup">
              <span>{t("language")}</span>
              <div className="languageSwitch">
                <button className={language === "en" ? "activeLang" : ""} onClick={() => updateLanguage("en")}>
                  <Languages size={15} />
                  English
                </button>
                <button className={language === "ru" ? "activeLang" : ""} onClick={() => updateLanguage("ru")}>
                  <Languages size={15} />
                  Русский
                </button>
              </div>
            </div>
            <div className="settingsGroup">
              <span>Notification routing</span>
              <div className="notificationOptions">
                <div className="toggleRow">
                  <span>Invitation emails</span>
                  <strong>{profile.notifications.gameInvitations ? "On" : "Off"}</strong>
                </div>
                <div className="toggleRow">
                  <span>Result emails</span>
                  <strong>{profile.notifications.gameResults ? "On" : "Off"}</strong>
                </div>
                <div className="toggleRow">
                  <span>Coach emails</span>
                  <strong>{profile.notifications.coachTips ? "On" : "Off"}</strong>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>
      )}

      <div className="globalToast" role="status" aria-live="polite">
        {toast}
      </div>

      {quizOpen && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <section className="quizModal">
            <button className="modalClose" type="button" onClick={() => setQuizOpen(false)}>
              ×
            </button>
            <div>
              <span className="eyebrow">Elo placement</span>
              <h2>Estimate your starting level</h2>
              <p>
                This is a short placement quiz. It gives a transparent starting Elo for the prototype; real production rating changes should come from games.
              </p>
            </div>
            <div className="quizQuestions">
              {quizQuestions.map((item, questionIndex) => (
                <div className="quizQuestion" key={item.question}>
                  <strong>{questionIndex + 1}. {item.question}</strong>
                  <div className="quizOptions">
                    {item.options.map((option) => (
                      <button
                        key={option.label}
                        className={quizAnswers[questionIndex] === option.points ? "chosen" : ""}
                        onClick={() => setQuizAnswers((current) => ({ ...current, [questionIndex]: option.points }))}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button className="primaryButton" onClick={finishQuiz}>
              Save my estimated Elo
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
