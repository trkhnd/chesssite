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
  cloud,
  loadCloudProfile,
  loginCloud,
  logoutCloud,
  observeCloudUser,
  saveCloudProfile,
  signUpCloud,
  updateCloudRoom,
  upsertCloudRoom,
  watchCloudRoom,
} from "./lib/firebase";
import { analyzeFen, canUseStockfish, type StockfishAnalysis } from "./lib/stockfish";

type BoardSquare = {
  square: Square;
  piece: {
    color: Color;
    type: PieceSymbol;
  } | null;
};

type GameMode = "ai" | "friend";
type AiLevel = "easy" | "medium" | "pro";
type ThemeName = "classic" | "midnight" | "royal";
type Language = "en" | "ru";
type View = "home" | "play" | "puzzles" | "learn" | "coach" | "history" | "community" | "leaderboard" | "pro";

type Profile = {
  name: string;
  city: string;
  rating: number | null;
  pro: boolean;
  email: string;
  signedIn: boolean;
};

type Account = {
  name: string;
  city: string;
  rating: number | null;
  pro: boolean;
  email: string;
  password: string;
};

type SavedGame = {
  id: string;
  date: string;
  mode: GameMode;
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

type RoomMessage = {
  sender: string;
  type: "state";
  fen: string;
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
const clientId = crypto.randomUUID();

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
];

function normalizeTheme(value: unknown): ThemeName {
  if (value === "light") return "classic";
  if (value === "dark") return "midnight";
  if (value === "classic" || value === "midnight" || value === "royal") return value;
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

const coachTimeline = [
  { label: "Opening", score: 74, text: "Develop minor pieces and avoid moving the queen too early." },
  { label: "Middlegame", score: 68, text: "Before attacking, identify loose pieces and forcing moves." },
  { label: "Endgame", score: 62, text: "Centralize your king and create outside passed pawns." },
];

const cityStats = [
  { city: "Almaty", players: 2480, avg: 1320, active: 312 },
  { city: "Astana", players: 1910, avg: 1295, active: 224 },
  { city: "Shymkent", players: 1080, avg: 1210, active: 146 },
];

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
    : explainMove(new Chess(), []);
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

function analyzeGame(history: Move[], game: Chess): CoachInsight[] {
  const whiteCaptures = history.filter((move) => move.color === "w" && move.captured);
  const blackCaptures = history.filter((move) => move.color === "b" && move.captured);
  const checks = history.filter((move) => move.san.includes("+") || move.san.includes("#"));
  const queenEarly = history.slice(0, 8).some((move) => move.color === "w" && move.piece === "q");
  const castle = history.some((move) => move.color === "w" && (move.san === "O-O" || move.san === "O-O-O"));
  const insights: CoachInsight[] = [];

  if (whiteCaptures.length >= blackCaptures.length) {
    insights.push({
      tone: "good",
      title: "Material discipline",
      text: `You kept the material balance healthy with ${whiteCaptures.length} capture opportunities converted.`,
    });
  } else {
    insights.push({
      tone: "warning",
      title: "Loose pieces",
      text: "The AI won more material. Before every move, scan which pieces are undefended.",
    });
  }

  insights.push({
    tone: checks.length > 1 ? "good" : "pro",
    title: "Initiative",
    text:
      checks.length > 1
        ? `You created ${checks.length} forcing check moments. Keep converting initiative into concrete threats.`
        : "You played quietly. Add candidate moves that create checks, captures, or threats.",
  });

  if (queenEarly) {
    insights.push({
      tone: "warning",
      title: "Opening habit",
      text: "Your queen moved early. In most openings, develop minor pieces and secure your king first.",
    });
  } else if (castle) {
    insights.push({
      tone: "good",
      title: "King safety",
      text: "You castled and reduced tactical risk. That is the habit of players who improve fast.",
    });
  } else {
    insights.push({
      tone: "pro",
      title: "King safety",
      text: "Look for a castling window earlier. A safe king makes attacking easier.",
    });
  }

  if (game.isCheckmate()) {
    insights.unshift({
      tone: game.turn() === "b" ? "good" : "warning",
      title: game.turn() === "b" ? "Finish found" : "Tactical miss",
      text: game.turn() === "b" ? "You delivered checkmate. Save this game and replay the final pattern." : "You were checkmated. Review the last 5 moves and find the first defensive resource.",
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

export default function App() {
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [history, setHistory] = useState<Move[]>([]);
  const [theme, setTheme] = useState<ThemeName>(() => normalizeTheme(loadJson("cm-theme", "midnight")));
  const [language, setLanguage] = useState<Language>(() => loadJson("cm-language", "en"));
  const [view, setView] = useState<View>("home");
  const [mode, setMode] = useState<GameMode>("ai");
  const [aiLevel, setAiLevel] = useState<AiLevel>(() => loadJson("cm-ai-level", "medium"));
  const [profile, setProfile] = useState<Profile>(() => loadJson("cm-profile", defaultProfile));
  const [accounts, setAccounts] = useState<Account[]>(() => loadJson("cm-accounts", []));
  const [cloudUserId, setCloudUserId] = useState("");
  const [savedGames, setSavedGames] = useState<SavedGame[]>(() => loadJson("cm-games", []));
  const [roomId, setRoomId] = useState(() => new URLSearchParams(location.search).get("room") || "");
  const [toast, setToast] = useState("Take the Elo quiz first. Chess Master will not invent your level.");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", city: "Almaty" });
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
  const [joinedRoom, setJoinedRoom] = useState("");
  const [communityDetail, setCommunityDetail] = useState<CommunityDetail | null>(null);
  const [stockfishBusy, setStockfishBusy] = useState(false);
  const [stockfishAnalysis, setStockfishAnalysis] = useState<StockfishAnalysis | null>(null);
  const [cloudRoomLive, setCloudRoomLive] = useState(false);
  const lastSavedFen = useRef("");
  const roomChannel = useRef<BroadcastChannel | null>(null);

  const board = useMemo(() => createBoard(game), [game]);
  const capturedPieces = useMemo(() => getCapturedPieces(history), [history]);
  const whiteCaptured = capturedPieces.filter((piece) => piece.startsWith("w"));
  const blackCaptured = capturedPieces.filter((piece) => piece.startsWith("b"));
  const coachReport = useMemo(() => analyzeGame(history, game), [history, game]);
  const reviewScore = useMemo(() => estimateReviewScore(history, game), [history, game]);
  const roomUrl = roomId ? `${location.origin}${location.pathname}?room=${roomId}` : "";
  const puzzleBoard = useMemo(() => makePuzzleBoard(puzzleGame), [puzzleGame]);
  const selectedPuzzle = puzzleSet[selectedPuzzleIndex] ?? puzzleSet[0];
  const dynamicCoachTimeline = useMemo(() => getCoachTimeline(history, game), [history, game]);
  const roomList = useMemo(() => getRoomList(profile), [profile]);
  const courseCompletion = useMemo(() => getCourseCompletion(lessonProgress), [lessonProgress]);
  const t = (key: keyof typeof copy.en) => copy[language][key] ?? copy.en[key];

  const leaderboard = useMemo(() => {
    const userStreak = savedGames.filter((savedGame) => savedGame.result === "1-0").length;
    return [...starterLeaderboard, { name: profile.name, city: profile.city, rating: profile.rating ?? 400, streak: userStreak, winRate: 50, title: "You" }]
      .sort((a, b) => b.rating - a.rating)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }, [profile, savedGames]);

  useEffect(() => {
    localStorage.setItem("cm-profile", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem("cm-accounts", JSON.stringify(accounts));
  }, [accounts]);

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
    localStorage.setItem("cm-lesson-progress", JSON.stringify(lessonProgress));
  }, [lessonProgress]);

  useEffect(() => {
    localStorage.setItem("cm-puzzle-solved", JSON.stringify(puzzleSolved));
  }, [puzzleSolved]);

  useEffect(() => {
    localStorage.setItem("cm-puzzle-set", JSON.stringify(puzzleSet));
  }, [puzzleSet]);

  useEffect(() => {
    if (!cloud.enabled) return;
    return observeCloudUser(async (user) => {
      if (!user) {
        setCloudUserId("");
        return;
      }

      setCloudUserId(user.uid);
      const cloudProfile = await loadCloudProfile(user.uid);
      if (cloudProfile) {
        setProfile({
          ...cloudProfile,
          signedIn: true,
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!cloudUserId) return;
    saveCloudProfile(cloudUserId, {
      name: profile.name,
      city: profile.city,
      rating: profile.rating,
      pro: profile.pro,
      email: profile.email,
    }).catch(() => setToast("Cloud profile save failed. Local fallback is still active."));
  }, [cloudUserId, profile.name, profile.city, profile.rating, profile.pro, profile.email]);

  useEffect(() => {
    if (!roomId) return;
    roomChannel.current?.close();
    const channel = new BroadcastChannel(`chess-master-${roomId}`);
    roomChannel.current = channel;
    channel.onmessage = (event: MessageEvent<RoomMessage>) => {
      if (event.data.sender === clientId || event.data.type !== "state") return;
      const nextGame = new Chess(event.data.fen);
      syncGame(nextGame);
      setToast("Friend move received through the live room.");
    };

    return () => channel.close();
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !cloud.enabled) {
      setCloudRoomLive(false);
      return;
    }

    setCloudRoomLive(true);
    return watchCloudRoom(roomId, (data) => {
      if (!data || data.sender === clientId || typeof data.fen !== "string") return;
      const nextGame = new Chess(data.fen);
      syncGame(nextGame);
      setToast("Cloud room move received. This link works across browsers after deployment.");
    });
  }, [roomId]);

  useEffect(() => {
    if (!game.isGameOver() || lastSavedFen.current === game.fen()) return;
    lastSavedFen.current = game.fen();
    saveGame("auto");
  }, [game]);

  function syncGame(nextGame: Chess) {
    setGame(new Chess(nextGame.fen()));
    setHistory(nextGame.history({ verbose: true }));
  }

  function broadcastGame(nextGame: Chess) {
    if (!roomId || mode !== "friend") return;
    roomChannel.current?.postMessage({ sender: clientId, type: "state", fen: nextGame.fen() } satisfies RoomMessage);
    updateCloudRoom(roomId, {
      sender: clientId,
      fen: nextGame.fen(),
      pgn: nextGame.pgn(),
      players: {
        lastMover: profile.name,
        city: profile.city,
      },
    }).catch(() => setToast("Local room synced. Add Firebase keys to sync across public browsers."));
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
      setToast(makeAiThinkingText(aiLevel, aiMove));
    }, aiLevel === "pro" ? 260 : 420);
  }

  function handleSquareClick(square: Square) {
    if (game.isGameOver()) return;
    if (mode === "ai" && game.turn() !== "w") return;

    const piece = game.get(square);
    if (!selected) {
      if (piece && (mode === "friend" || piece.color === "w")) {
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
      if (piece && (mode === "friend" || piece.color === "w")) {
        setSelected(square);
        setLegalTargets(game.moves({ square, verbose: true }).map((target) => target.to));
      }
      return;
    }

    syncGame(nextGame);
    broadcastGame(nextGame);
    setToast(move.captured ? `${move.san}: material won. Great tactical signal.` : `${move.san}: now check the opponent's threat.`);
    if (mode === "ai") makeAiMove(nextGame);
  }

  function resetGame(nextMode = mode) {
    const nextGame = new Chess();
    lastSavedFen.current = "";
    setMode(nextMode);
    setSelected(null);
    setLegalTargets([]);
    setToast(nextMode === "ai" ? `New game vs ${getAiLabel(aiLevel)} started.` : "Friend room board reset.");
    syncGame(nextGame);
    if (nextMode === "friend") broadcastGame(nextGame);
  }

  function saveGame(source: "auto" | "manual") {
    const now = new Date().toISOString();
    const saved: SavedGame = {
      id: crypto.randomUUID(),
      date: now,
      mode,
      result: getResult(game),
      moves: history.map((move) => move.san),
      pgn: game.pgn(),
      coach: coachReport,
      city: profile.city,
      reviewScore,
    };
    setSavedGames((current) => [saved, ...current].slice(0, 20));
    if (source === "manual") setToast("Game saved to your local history.");
  }

  function createRoom() {
    const nextRoom = Math.random().toString(36).slice(2, 8).toUpperCase();
    setRoomId(nextRoom);
    setMode("friend");
    window.history.replaceState(null, "", `?room=${nextRoom}`);
    upsertCloudRoom(nextRoom, {
      sender: clientId,
      fen: game.fen(),
      pgn: game.pgn(),
      host: profile.name,
      city: profile.city,
    }).catch(() => undefined);
    setToast(
      cloud.enabled
        ? "Cloud room created. Deploy the app and this link works across browsers."
        : "Local room created. Add Firebase env keys and deploy for public friend links.",
    );
  }

  async function copyRoomLink() {
    if (!roomUrl) return;
    await navigator.clipboard.writeText(roomUrl);
    setToast("Room link copied.");
  }

  function upgradeToPro() {
    if (openProCheckout()) {
      setToast("Opening Stripe payment link.");
      return;
    }
    setProfile((current) => ({ ...current, pro: true }));
    setToast("Pro unlocked locally. Add VITE_STRIPE_PAYMENT_LINK to use a real Stripe checkout.");
  }

  function openAuth(modeName: "login" | "signup") {
    setAuthMode(modeName);
    setAuthOpen(true);
    setAuthForm({
      name: profile.name === "Guest Player" ? "" : profile.name,
      email: profile.email,
      password: "",
      city: profile.city,
    });
  }

  function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = authForm.email.trim().toLowerCase();
    const existing = accounts.find((account) => account.email === email);

    if (authMode === "signup") {
      if (existing) {
        setToast("This email is already registered. Use Log in instead.");
        return;
      }
      const displayName = authForm.name.trim() || email.split("@")[0] || "Chess Master Player";
      const account: Account = {
        name: displayName,
        email,
        password: authForm.password,
        city: authForm.city || "Almaty",
        rating: profile.rating,
        pro: profile.pro,
      };
      if (cloud.enabled) {
        signUpCloud(email, authForm.password, displayName, {
          name: displayName,
          city: account.city,
          rating: account.rating,
          pro: account.pro,
          email,
        })
          .then((user) => {
            setCloudUserId(user.uid);
            setProfile({ ...account, signedIn: true });
            setToast(`Cloud account created for ${displayName}.`);
            setAuthOpen(false);
          })
          .catch((error: Error) => setToast(error.message));
        return;
      }
      setAccounts((current) => [...current, account]);
      setProfile({ ...account, signedIn: true });
      setToast(`Local account created for ${displayName}. Add Firebase keys for public auth.`);
    } else {
      if (cloud.enabled) {
        loginCloud(email, authForm.password)
          .then((credential) => {
            setCloudUserId(credential.user.uid);
            setToast(`Welcome back, ${credential.user.displayName || email}.`);
            setAuthOpen(false);
          })
          .catch((error: Error) => setToast(error.message));
        return;
      }
      if (!existing || existing.password !== authForm.password) {
        setToast("Wrong email or password. This prototype now checks saved accounts.");
        return;
      }
      setProfile({ ...existing, signedIn: true });
      setToast(`Welcome back, ${existing.name}.`);
    }

    setAuthOpen(false);
  }

  function signOut() {
    if (cloud.enabled) {
      logoutCloud().catch(() => setToast("Cloud sign out failed."));
    }
    setCloudUserId("");
    setProfile({ ...defaultProfile, city: profile.city, rating: profile.rating });
    setToast("Signed out. Log in again with a registered email and password.");
  }

  function finishQuiz() {
    if (Object.keys(quizAnswers).length !== quizQuestions.length) {
      setToast("Answer all quiz questions to estimate your starting Elo.");
      return;
    }
    const rating = estimateQuizElo(quizAnswers);
    setProfile((current) => ({ ...current, rating }));
    if (profile.signedIn) {
      setAccounts((current) =>
        current.map((account) => (account.email === profile.email ? { ...account, rating } : account)),
      );
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
    setView("coach");
    if (!canUseStockfish()) {
      setToast(`${getCoachPositionLine(game, history)} Stockfish worker is not available in this browser.`);
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
    setToast(
      best
        ? `Stockfish recommends ${best.san} (${scoreText}).`
        : "Stockfish analysis finished, but no best move was returned.",
    );
  }

  function joinCommunityRoom(label: string) {
    const code = makeRoomCode(label);
    setJoinedRoom(label);
    setRoomId(code);
    setMode("friend");
    window.history.replaceState(null, "", `?room=${code}`);
    upsertCloudRoom(code, {
      sender: clientId,
      fen: game.fen(),
      pgn: game.pgn(),
      host: profile.name,
      label,
      city: profile.city,
    }).catch(() => undefined);
    setToast(getRoomToast(label, code));
  }

  function selectCity(city: string) {
    setProfile((current) => ({ ...current, city }));
    setToast(makeCityUpdate(city));
  }

  function cycleTheme() {
    const order: ThemeName[] = ["classic", "midnight", "royal"];
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

  function openCommunityDetail(detail: CommunityDetail) {
    setCommunityDetail(detail);
    setToast(`${detail.title} opened.`);
  }

  function joinCommunityDetail(detail: CommunityDetail) {
    joinCommunityRoom(detail.title);
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
            {theme === "classic" ? <Sun size={18} /> : theme === "midnight" ? <Moon size={18} /> : <Crown size={18} />}
          </button>
          {profile.signedIn ? (
            <button className="authButton" onClick={signOut}>
              <LogOut size={18} />
              Sign out
            </button>
          ) : (
            <>
              <button className="authButton" onClick={() => openAuth("login")}>
                <LogIn size={18} />
                Log in
              </button>
              <button className="signupButton" onClick={() => openAuth("signup")}>
                Start free
              </button>
            </>
          )}
          <button className="proButton" onClick={() => setView("pro")}>
            <Crown size={18} />
            {profile.pro ? "Pro Active" : "Upgrade Pro"}
          </button>
        </div>
      </section>

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
            </section>
          )}

          {view === "play" && (
            <div className="playGrid">
              <section className="boardStage">
                <div className="gameHeader">
                  <div>
                    <span className="eyebrow">{mode === "ai" ? "Human vs AI" : `Friend room ${roomId || "not created"}`}</span>
                    <h2>{getStatus(game)}</h2>
                  </div>
                  <div className="headerActions">
                    <button className="ghostButton" onClick={() => saveGame("manual")}>
                      <Save size={16} />
                      Save
                    </button>
                    <button className="ghostButton" onClick={() => resetGame()}>
                      <RefreshCcw size={16} />
                      New
                    </button>
                  </div>
                </div>

                <div className="captured topCaptured">
                  {whiteCaptured.map((piece, index) => (
                    <span key={`${piece}-${index}`}>{pieceIcons[piece]}</span>
                  ))}
                </div>

                <div className="board" aria-label="Chess board">
                  {board.map(({ square, piece }, index) => {
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
                        {file === "a" && <span className="coord rankCoord">{rank}</span>}
                        {rank === "1" && <span className="coord fileCoord">{file}</span>}
                      </button>
                    );
                  })}
                </div>

                <div className="captured bottomCaptured">
                  {blackCaptured.map((piece, index) => (
                    <span key={`${piece}-${index}`}>{pieceIcons[piece]}</span>
                  ))}
                </div>
              </section>

              <aside className="sidePanel">
                <div className="modeSwitch">
                  <button className={mode === "ai" ? "selectedMode" : ""} onClick={() => resetGame("ai")}>
                    <Brain size={17} />
                    AI
                  </button>
                  <button className={mode === "friend" ? "selectedMode" : ""} onClick={() => (roomId ? resetGame("friend") : createRoom())}>
                    <Users size={17} />
                    Friend
                  </button>
                </div>

                <div className="aiChooser">
                  <div className="panelTitle">
                    <Sparkles size={18} />
                    <h3>Choose AI</h3>
                  </div>
                  {(Object.keys(aiProfiles) as AiLevel[]).map((level) => (
                    <button
                      key={level}
                      className={aiLevel === level ? "aiLevel activeAi" : "aiLevel"}
                      onClick={() => selectAiLevel(level)}
                    >
                      <span className={getBotClass(level)}>{getBotAvatar(level)}</span>
                      <span>
                        <strong>{aiProfiles[level].name}</strong>
                        <small>{aiProfiles[level].rating} Elo · {aiProfiles[level].depth}</small>
                      </span>
                    </button>
                  ))}
                  <button className="ghostButton aiRecommend" onClick={autoPickAiLevel}>Use recommended AI</button>
                </div>

                <div className="coachCard">
                  <div className="panelTitle">
                    <Brain size={19} />
                    <h3>Live Coach</h3>
                  </div>
                  <p>{toast}</p>
                  <button className="ghostButton analyzeButton" onClick={analyzeNow}>{getPrimaryCoachAction(history)}</button>
                </div>

                <div className="roomCard">
                  <div className="panelTitle">
                    <Users size={19} />
                    <h3>Play by link</h3>
                  </div>
                  {roomId ? (
                    <>
                      <code>{roomUrl}</code>
                      <button className="wideButton" onClick={copyRoomLink}>
                        <Copy size={16} />
                        {getRoomActionLabel(roomId)}
                      </button>
                    </>
                  ) : (
                    <button className="wideButton" onClick={createRoom}>
                      <Zap size={16} />
                      Create live room
                    </button>
                  )}
                </div>

                <div className="movesCard">
                  <div className="panelTitle">
                    <History size={19} />
                    <h3>Move history</h3>
                  </div>
                  <div className="moveList">
                    {history.length === 0 ? (
                      <span className="empty">Your moves will appear here.</span>
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
                    : "Click Analyze with Stockfish to calculate the current position."}
                </span>
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
                {savedGames.length === 0 ? (
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
            </section>
          )}

          {view === "community" && (
            <section className="dashboardView">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">{t("clubhouse")}</span>
                  <h2>{t("communityHub")}</h2>
                  <p className="sectionLead">
                    {getCommunityHeadline(profile)} {joinedRoom ? `${t("currentRoom")}: ${joinedRoom}.` : ""}
                  </p>
                </div>
                <button className="primaryButton" onClick={createRoom}>
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
                </div>
              ) : (
                <>
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
                <span>{cloud.enabled ? "Firebase Auth + Firestore active" : "Firebase Auth + Firestore ready"}</span>
              </div>
              <div>
                <Shield size={16} />
                <span>{cloud.enabled ? "Cloud progress sync enabled" : "Local fallback protects demo flow"}</span>
              </div>
              <div>
                <Users size={16} />
                <span>{cloudRoomLive ? "Public friend room live" : "Friend rooms become public after deploy"}</span>
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
              <span>{cloud.enabled ? "Firebase active" : "Firebase ready"}</span>
              <span>Mobile board</span>
              <span>{cloudRoomLive ? "Live cloud rooms" : "Friend links ready"}</span>
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
          </div>
        </aside>
      </section>

      {authOpen && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <form className="authModal" onSubmit={submitAuth}>
            <button className="modalClose" type="button" onClick={() => setAuthOpen(false)}>
              ×
            </button>
            <div>
              <span className="eyebrow">{authMode === "login" ? "Welcome back" : "Join Chess Master"}</span>
              <h2>{authMode === "login" ? "Log in to continue training" : "Create your chess account"}</h2>
              <p>
                {cloud.enabled
                  ? "Firebase Auth is enabled. Accounts work across browsers after deployment."
                  : "Local auth is active. Add Firebase env keys for professional public accounts."}
              </p>
            </div>
            <div className="authModeSwitch">
              <button type="button" className={authMode === "login" ? "activeAuthMode" : ""} onClick={() => setAuthMode("login")}>Log in</button>
              <button type="button" className={authMode === "signup" ? "activeAuthMode" : ""} onClick={() => setAuthMode("signup")}>Create account</button>
            </div>
            <div className="authProof">
              <span><CheckCircle2 size={15} /> Saved progress</span>
              <span><CheckCircle2 size={15} /> Cloud rooms</span>
              <span><CheckCircle2 size={15} /> Coach history</span>
            </div>
            {authMode === "signup" && (
              <label>
                Name
                <input required value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} />
              </label>
            )}
            <label>
              Email
              <input required type="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} />
            </label>
            <label>
              Password
              <input required type="password" minLength={6} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
            </label>
            <label>
              City
              <input value={authForm.city} onChange={(event) => setAuthForm({ ...authForm, city: event.target.value })} />
            </label>
            <button className="primaryButton" type="submit">
              {authMode === "login" ? "Log in" : "Create account"}
            </button>
            <button className="textButton" type="button" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>
              {authMode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
            </button>
          </form>
        </div>
      )}

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
