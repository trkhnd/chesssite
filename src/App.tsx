import { Component, FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Chess, Color, Move, PieceSymbol, Square } from "chess.js";
import {
  BadgeDollarSign,
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import {
  createFriendRoom,
  getHistory,
  getRoom,
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
import { getSocket, setSocketToken } from "./lib/socket";
import { playBoardSound, unlockBoardAudio } from "./lib/sounds";
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
type View = "home" | "play" | "game" | "analysis" | "puzzles" | "learn" | "coach" | "history" | "community" | "leaderboard" | "pro";

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
  uciMoves?: string[];
  pgn: string;
  initialFen?: string;
  finalFen?: string;
  coach: CoachInsight[];
  city: string;
  reviewScore: number | null;
  status?: string;
  timeControl?: string;
  opponent?: string;
  players?: {
    white: string;
    black: string;
  };
};

type AnalysisMoveReview = {
  ply: number;
  san: string;
  quality: "brilliant" | "good" | "inaccuracy" | "mistake" | "blunder";
  bestMove: string;
  evaluation: string;
  explanation: string;
  danger: string;
  principle: string;
  trainingTip: string;
};

type SavedGameAnalysis = {
  gameId: string;
  coachMode: CoachMode;
  moveReviews: AnalysisMoveReview[];
  summary: {
    accuracy: number;
    biggestMistake: string;
    bestMove: string;
    openingAdvice: string;
    middlegameAdvice: string;
    endgameAdvice: string;
    training: string[];
  };
};

type AnalysisReplay = {
  initialFen: string;
  moves: Move[];
  positions: string[];
};

type CoachInsight = {
  tone: "good" | "warning" | "pro";
  title: string;
  text: string;
};

type PuzzleDifficulty = "easy" | "medium" | "hard";

type Puzzle = {
  title: string;
  fen: string;
  theme: string;
  rating: number;
  goal: string;
  difficulty?: PuzzleDifficulty;
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

type PromotionChoice = "q" | "r" | "b" | "n";

type PendingPromotion = {
  from: Square;
  to: Square;
  color: "white" | "black";
};

type RoomConnectionState = "idle" | "joining" | "waiting" | "ready" | "disconnected" | "error";

type GameOutcomeReason =
  | "in-progress"
  | "check"
  | "checkmate"
  | "stalemate"
  | "draw"
  | "resignation"
  | "timeout";

type GamePresentation = {
  finished: boolean;
  headline: string;
  detail: string;
  reason: GameOutcomeReason;
  winner: "white" | "black" | null;
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
    difficulty: "easy",
    goal: "White to move. Find the checkmate on the back rank.",
    solution: { from: "e1", to: "e8", san: "Re8#" },
  },
  {
    title: "Win the queen",
    fen: "6k1/5ppp/8/8/3q4/2N5/5PPP/3Q2K1 w - - 0 1",
    theme: "Fork",
    rating: 1250,
    difficulty: "medium",
    goal: "White to move. Use the knight fork to attack king and queen.",
    solution: { from: "c3", to: "b5", san: "Nb5" },
  },
  {
    title: "Endgame squeeze",
    fen: "8/5pk1/6p1/4P3/4KPPP/8/8/8 w - - 0 1",
    theme: "Endgame",
    rating: 1320,
    difficulty: "hard",
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
    difficulty: "easy",
    goal: "White to move. Use the rook to finish the exposed king.",
    solution: { from: "f1", to: "f8", san: "Rf8#" },
  },
  {
    title: "Royal fork",
    fen: "4k3/8/8/8/3q4/8/4N3/4K3 w - - 0 1",
    theme: "Fork",
    rating: 1180,
    difficulty: "medium",
    goal: "White to move. Find the knight fork that attacks king and queen.",
    solution: { from: "e2", to: "c3", san: "Nc3+" },
  },
  {
    title: "Passed pawn route",
    fen: "8/8/5k2/4p3/4P3/5K2/8/8 w - - 0 1",
    theme: "Endgame",
    rating: 1100,
    difficulty: "hard",
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
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Magnus_Carlsen_in_2023.jpg?width=320",
    message: "Enjoy the fight. The best players stay curious even in quiet positions.",
    action: "Train calculation",
  },
  {
    name: "Judit Polgar",
    role: "Attacking legend",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Judit_Polgar.jpg?width=320",
    message: "Play actively. Initiative can be worth more than comfort.",
    action: "Open tactics",
  },
  {
    name: "Garry Kasparov",
    role: "World Champion",
    image: "https://commons.wikimedia.org/wiki/Special:FilePath/Garry_Kasparov_IMG_0130.JPG?width=320",
    message: "Preparation creates confidence. Review, improve, repeat.",
    action: "Analyze game",
  },
];

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Chess Master UI error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app midnight">
          <section className="welcomeGate">
            <div className="welcomeHero">
              <span className="eyebrow">Temporary recovery</span>
              <h2>The board hit a rendering error, but your session is still safe.</h2>
              <p>Reload the page to restore the board. If this happened during an AI move, Chess Master will fall back to a simpler legal-move reply after reload.</p>
              <div className="heroActions">
                <button className="primaryButton" onClick={() => window.location.reload()} type="button">
                  <RefreshCcw size={18} />
                  Reload board
                </button>
              </div>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

function LegendPortrait({ image, name }: { image: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (failed) {
    return <div className="legendFallback" aria-label={`${name} portrait fallback`}>{initials}</div>;
  }

  return (
    <img
      src={image}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}

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

function findPromotionMove(game: Chess, from: Square, to: Square) {
  const candidate = game
    .moves({ square: from, verbose: true })
    .find((move) => move.to === to && Boolean(move.promotion));

  return candidate ?? null;
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

function getPuzzleDifficulty(puzzle: Puzzle): PuzzleDifficulty {
  if (puzzle.difficulty) return puzzle.difficulty;
  if (puzzle.rating <= 1000) return "easy";
  if (puzzle.rating <= 1250) return "medium";
  return "hard";
}

function getPuzzleDifficultyLabel(difficulty: PuzzleDifficulty) {
  if (difficulty === "easy") return "Easy";
  if (difficulty === "medium") return "Medium";
  return "Hard";
}

function getPuzzlesForDifficulty(puzzleList: Puzzle[], difficulty: PuzzleDifficulty) {
  return puzzleList
    .map((puzzle, index) => ({ puzzle, index }))
    .filter(({ puzzle }) => getPuzzleDifficulty(puzzle) === difficulty);
}

function isSameMove(move: Move, puzzle: Puzzle) {
  return move.from === puzzle.solution.from && move.to === puzzle.solution.to;
}

function getPuzzleHint(puzzle: Puzzle) {
  if (puzzle.theme === "Mate") return "Hint: look for a rook move that gives check along the open file.";
  if (puzzle.theme === "Fork") return "Hint: a knight can attack two important pieces at once.";
  return "Hint: in king and pawn endings, opposition and king activity decide everything.";
}

function getNextUnsolvedPuzzleIndex(params: {
  puzzleList: Puzzle[];
  solved: Record<string, boolean>;
  difficulty: PuzzleDifficulty;
  currentIndex: number;
}) {
  const matching = getPuzzlesForDifficulty(params.puzzleList, params.difficulty);
  if (matching.length === 0) return -1;

  const currentPosition = matching.findIndex(({ index }) => index === params.currentIndex);
  for (let offset = 1; offset <= matching.length; offset += 1) {
    const candidate = matching[(Math.max(currentPosition, 0) + offset) % matching.length];
    if (!params.solved[candidate.puzzle.title]) {
      return candidate.index;
    }
  }

  return -1;
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
  try {
    return game.move({
      from: uci.slice(0, 2) as Square,
      to: uci.slice(2, 4) as Square,
      promotion: (uci[4] || "q") as "q" | "r" | "b" | "n",
    });
  } catch {
    return null;
  }
}

function applyVerboseMove(game: Chess, move: Move | null) {
  if (!move) return null;
  try {
    return game.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });
  } catch {
    return null;
  }
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
  return `${puzzle.title} · ${puzzle.theme} · ${getPuzzleDifficultyLabel(getPuzzleDifficulty(puzzle))} · ${solved[puzzle.title] ? "solved" : "unsolved"}`;
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

function makeGeneratedPuzzle(existingCount: number, difficulty?: PuzzleDifficulty) {
  const matchingBank = difficulty
    ? generatedPuzzleBank.filter((puzzle) => getPuzzleDifficulty(puzzle) === difficulty)
    : generatedPuzzleBank;
  const bank = matchingBank.length > 0 ? matchingBank : generatedPuzzleBank;
  const base = bank[existingCount % bank.length];
  return {
    ...base,
    title: `${base.title} ${Math.floor(existingCount / generatedPuzzleBank.length) + 1}`,
    rating: base.rating + existingCount * 25,
    difficulty: difficulty || base.difficulty,
  };
}

function makeStarterPuzzleSet() {
  return [...puzzles, ...Array.from({ length: 6 }, (_, index) => makeGeneratedPuzzle(puzzles.length + index))];
}

function topUpPuzzlePool(puzzleList: Puzzle[], minimumPerDifficulty = 8) {
  const nextList = [...puzzleList];
  const difficulties: PuzzleDifficulty[] = ["easy", "medium", "hard"];

  for (const difficulty of difficulties) {
    let existingCount = nextList.filter((puzzle) => getPuzzleDifficulty(puzzle) === difficulty).length;
    while (existingCount < minimumPerDifficulty) {
      const nextPuzzle = makeGeneratedPuzzle(nextList.length, difficulty);
      nextList.push(nextPuzzle);
      existingCount += 1;
    }
  }

  return nextList;
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

function getWinnerFromResult(result: string) {
  if (result === "1-0") return "white";
  if (result === "0-1") return "black";
  return null;
}

function findCheckedKingSquare(game: Chess) {
  if (!game.isCheck()) return null;
  const kingColor = game.turn();
  const board = game.board();
  for (let rank = 0; rank < board.length; rank += 1) {
    for (let file = 0; file < board[rank].length; file += 1) {
      const piece = board[rank][file];
      if (piece?.type === "k" && piece.color === kingColor) {
        return `${files[file]}${8 - rank}` as Square;
      }
    }
  }
  return null;
}

function buildGameStatus(params: {
  game: Chess;
  mode: LocalGameMode;
  roomState: RoomState | null;
  resultOverride: string | null;
  statusOverride: string | null;
}): GamePresentation {
  if (params.mode === "friend" && params.roomState) {
    const state = params.roomState;
    if (state.finished) {
      if (state.timeoutWinner) {
        return {
          finished: true,
          headline: "Timeout",
          detail: `${state.timeoutWinner === "white" ? "White" : "Black"} wins on time`,
          reason: "timeout",
          winner: state.timeoutWinner,
        };
      }
      if (/resigned/i.test(state.status)) {
        const winner = getWinnerFromResult(state.result);
        return {
          finished: true,
          headline: "Resignation",
          detail: winner ? `${winner === "white" ? "White" : "Black"} wins by resignation` : state.status,
          reason: "resignation",
          winner,
        };
      }
      if (state.isCheckmate || /checkmate/i.test(state.status)) {
        const winner = getWinnerFromResult(state.result);
        return {
          finished: true,
          headline: "Checkmate",
          detail: winner ? `${winner === "white" ? "White" : "Black"} wins` : state.status,
          reason: "checkmate",
          winner,
        };
      }
      if (state.isDraw) {
        return {
          finished: true,
          headline: /stalemate/i.test(state.status) ? "Stalemate" : "Draw",
          detail: /stalemate/i.test(state.status) ? "Game drawn by stalemate" : "Game drawn",
          reason: /stalemate/i.test(state.status) ? "stalemate" : "draw",
          winner: null,
        };
      }
    }

    if (state.isCheck) {
      return {
        finished: false,
        headline: "Check",
        detail: `${state.turn === "white" ? "White" : "Black"} to move`,
        reason: "check",
        winner: null,
      };
    }

    return {
      finished: false,
      headline: "In progress",
      detail: state.waitingForOpponent ? "Waiting for opponent" : `${state.turn === "white" ? "White" : "Black"} to move`,
      reason: "in-progress",
      winner: null,
    };
  }

  if (params.resultOverride && params.statusOverride) {
    if (/time/i.test(params.statusOverride)) {
      return {
        finished: true,
        headline: "Timeout",
        detail: params.statusOverride,
        reason: "timeout",
        winner: getWinnerFromResult(params.resultOverride),
      };
    }
    if (/resigned/i.test(params.statusOverride)) {
      return {
        finished: true,
        headline: "Resignation",
        detail: getWinnerFromResult(params.resultOverride)
          ? `${getWinnerFromResult(params.resultOverride) === "white" ? "White" : "Black"} wins by resignation`
          : params.statusOverride,
        reason: "resignation",
        winner: getWinnerFromResult(params.resultOverride),
      };
    }
    if (params.resultOverride === "1/2-1/2") {
      return {
        finished: true,
        headline: /stalemate/i.test(params.statusOverride) ? "Stalemate" : "Draw",
        detail: /stalemate/i.test(params.statusOverride) ? "Game drawn by stalemate" : params.statusOverride,
        reason: /stalemate/i.test(params.statusOverride) ? "stalemate" : "draw",
        winner: null,
      };
    }
  }

  if (params.game.isCheckmate()) {
    const winner = params.game.turn() === "w" ? "black" : "white";
    return {
      finished: true,
      headline: "Checkmate",
      detail: `${winner === "white" ? "White" : "Black"} wins`,
      reason: "checkmate",
      winner,
    };
  }
  if (params.game.isStalemate()) {
    return {
      finished: true,
      headline: "Stalemate",
      detail: "Game drawn by stalemate",
      reason: "stalemate",
      winner: null,
    };
  }
  if (params.game.isDraw()) {
    return {
      finished: true,
      headline: "Draw",
      detail: "Game drawn",
      reason: "draw",
      winner: null,
    };
  }
  if (params.game.isCheck()) {
    return {
      finished: false,
      headline: "Check",
      detail: `${params.game.turn() === "w" ? "White" : "Black"} to move`,
      reason: "check",
      winner: null,
    };
  }

  return {
    finished: false,
    headline: "In progress",
    detail: `${params.game.turn() === "w" ? "White" : "Black"} to move`,
    reason: "in-progress",
    winner: null,
  };
}

function replayGameToMove(replay: AnalysisReplay | null, moveIndex: number) {
  if (!replay) return new Chess();
  const safeMoveCount = Math.max(0, Math.min(replay.positions.length - 1, moveIndex));
  const fen = replay.positions[safeMoveCount] || replay.initialFen;
  try {
    return new Chess(fen);
  } catch {
    return new Chess();
  }
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

function normalizeInitialFen(fen?: string) {
  if (!fen?.trim()) return new Chess().fen();
  try {
    return new Chess(fen).fen();
  } catch {
    return new Chess().fen();
  }
}

function tokenizePgnMoves(pgn: string) {
  if (!pgn.trim()) return [];
  return pgn
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\{[^}]*}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token &&
        !/^\d+\.(\.\.)?$/.test(token) &&
        !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token),
    );
}

function buildReplayFromSanMoves(initialFen: string, sanMoves: string[]) {
  const builder = new Chess(initialFen);
  const verboseMoves: Move[] = [];
  const positions = [builder.fen()];

  for (const san of sanMoves) {
    try {
      const applied = builder.move(san);
      if (!applied) break;
      verboseMoves.push(applied);
      positions.push(builder.fen());
    } catch {
      break;
    }
  }

  return {
    initialFen,
    moves: verboseMoves,
    positions,
  };
}

function buildReplayFromUciMoves(initialFen: string, uciMoves: string[]) {
  const builder = new Chess(initialFen);
  const verboseMoves: Move[] = [];
  const positions = [builder.fen()];

  for (const uci of uciMoves) {
    const normalized = String(uci || "").trim().toLowerCase();
    const match = normalized.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (!match) break;

    try {
      const applied = builder.move({
        from: match[1] as Square,
        to: match[2] as Square,
        promotion: (match[3] as PieceSymbol | undefined) || undefined,
      });
      if (!applied) break;
      verboseMoves.push(applied);
      positions.push(builder.fen());
    } catch {
      break;
    }
  }

  return {
    initialFen,
    moves: verboseMoves,
    positions,
  };
}

function parseSavedGameMoves(savedGame: SavedGame): AnalysisReplay {
  const initialFen = normalizeInitialFen(savedGame.initialFen);

  if (savedGame.pgn.trim()) {
    try {
      const replay = new Chess();
      replay.loadPgn(savedGame.pgn);
      const moves = replay.history({ verbose: true });
      const rebuilt = buildReplayFromSanMoves(
        initialFen,
        moves.map((move) => move.san),
      );
      if (rebuilt.moves.length > 0) {
        return rebuilt;
      }
    } catch {
      // Fallbacks below cover older or malformed PGN.
    }
  }

  if (savedGame.uciMoves?.length) {
    const replayFromUci = buildReplayFromUciMoves(initialFen, savedGame.uciMoves);
    if (replayFromUci.moves.length > 0) {
      return replayFromUci;
    }
  }

  if (savedGame.moves.length > 0) {
    const replayFromSan = buildReplayFromSanMoves(initialFen, savedGame.moves);
    if (replayFromSan.moves.length > 0) {
      return replayFromSan;
    }
  }

  if (savedGame.pgn.trim()) {
    const replayFromTokens = buildReplayFromSanMoves(initialFen, tokenizePgnMoves(savedGame.pgn));
    if (replayFromTokens.moves.length > 0) {
      return replayFromTokens;
    }
  }

  return {
    initialFen,
    moves: [],
    positions: [initialFen],
  };
}

function extractMovesFromPgn(pgn: string) {
  if (!pgn.trim()) return [];
  const replay = new Chess();
  try {
    replay.loadPgn(pgn);
    return replay.history();
  } catch {
    return tokenizePgnMoves(pgn);
  }
}

function clampAnalysisIndex(positionsLength: number, nextIndex: number) {
  return Math.max(0, Math.min(Math.max(0, positionsLength - 1), nextIndex));
}

function getMoveQualityLabel(scoreDelta: number, move: Move, bestSan: string) {
  if (move.san === bestSan && (move.san.includes("#") || move.captured || move.san.includes("+"))) return "brilliant";
  if (move.san === bestSan || scoreDelta <= 0.6) return "good";
  if (scoreDelta <= 1.6) return "inaccuracy";
  if (scoreDelta <= 3.2) return "mistake";
  return "blunder";
}

function buildCoachMoveReview(params: {
  gameBefore: Chess;
  move: Move;
  bestMove: Move | null;
  analysis: StockfishAnalysis | null;
  coachMode: CoachMode;
  ply: number;
}): AnalysisMoveReview {
  const actualScore = scoreMove(params.gameBefore, params.move);
  const bestScore = params.bestMove ? scoreMove(params.gameBefore, params.bestMove) : actualScore;
  const scoreDelta = Math.max(0, bestScore - actualScore);
  const bestSan = params.bestMove?.san || params.move.san;
  const quality = getMoveQualityLabel(scoreDelta, params.move, bestSan);
  const evaluation = params.analysis ? formatEvaluation(params.analysis) : `${scoreDelta.toFixed(1)} heuristic`;
  const repeatedPieceMove = params.ply <= 14 && params.move.piece !== "p" && params.gameBefore.history({ verbose: true }).some((item) => item.color === params.move.color && item.piece === params.move.piece && item.to === params.move.from);
  const kingUnsafe = !params.gameBefore.history({ verbose: true }).some((item) => ["O-O", "O-O-O"].includes(item.san)) && params.ply <= 20;
  const explanation = coachCopyByMode(
    params.coachMode,
    params.move.san === bestSan
      ? `Move ${params.ply}: ${params.move.san} was solid. It matched the strongest practical move in this position.`
      : `Move ${params.ply}: ${params.move.san} was ${quality}. A better move was ${bestSan} because it improved development, safety, or tactics more directly.`,
    params.move.san === bestSan
      ? `Move ${params.ply}: ${params.move.san} kept the position under control and respected the main plan.`
      : `Move ${params.ply}: ${params.move.san} was ${quality}. ${bestSan} was stronger because it coordinated pieces better and reduced tactical risk.`,
    params.move.san === bestSan
      ? `Move ${params.ply}: ${params.move.san} aligned with the top engine candidate and kept the strategic balance.`
      : `Move ${params.ply}: ${params.move.san} scored as a ${quality}. ${bestSan} preserved more evaluation and handled the tactical details more accurately.`,
  );
  const danger = repeatedPieceMove
    ? "You spent another tempo on the same piece while other pieces still needed development."
    : kingUnsafe
      ? "Your king safety was still unresolved, so tactical shots against the center could appear quickly."
      : params.move.captured
        ? "After winning material, the main danger was relaxing and missing your opponent's counterplay."
        : "The danger was missing a forcing line: checks, captures, or a loose piece after your move.";
  const principle = params.ply <= 16
    ? "Opening principle: develop pieces, fight for the center, and castle before starting side attacks."
    : params.gameBefore.history({ verbose: true }).length >= 30
      ? "Endgame principle: improve king activity and avoid unnecessary weaknesses."
      : "Middlegame principle: improve the worst piece and compare forcing moves before quiet ones.";
  const trainingTip = quality === "good"
    ? "Replay this position once and explain in your own words why the move worked."
    : `Set this position up again and compare ${params.move.san} with ${bestSan} before making the next decision.`;

  return {
    ply: params.ply,
    san: params.move.san,
    quality,
    bestMove: bestSan,
    evaluation,
    explanation,
    danger,
    principle,
    trainingTip,
  };
}

function explainSavedReview(review: AnalysisMoveReview, mode: CoachMode) {
  return coachCopyByMode(
    mode,
    review.quality === "good" || review.quality === "brilliant"
      ? `Move ${review.ply}: ${review.san} was a strong choice. It kept the position healthy and followed a sound practical idea.`
      : `Move ${review.ply}: ${review.san} was a ${review.quality}. A better move was ${review.bestMove} because it improved safety, development, or tactics more directly.`,
    review.quality === "good" || review.quality === "brilliant"
      ? `Move ${review.ply}: ${review.san} fit the position well and stayed close to the best plan.`
      : `Move ${review.ply}: ${review.san} was a ${review.quality}. ${review.bestMove} would have coordinated pieces better and reduced tactical danger.`,
    review.quality === "good" || review.quality === "brilliant"
      ? `Move ${review.ply}: ${review.san} matched the strongest practical continuation and preserved evaluation.`
      : `Move ${review.ply}: ${review.san} was a ${review.quality}. ${review.bestMove} was superior because it handled the calculation and structural details more accurately.`,
  );
}

function getSavedReviewTrainingTip(review: AnalysisMoveReview, mode: CoachMode) {
  return coachCopyByMode(
    mode,
    review.quality === "good" ? "Replay the position once and explain the move in your own words." : `Replay this moment and compare ${review.san} with ${review.bestMove}.`,
    review.quality === "good" ? "Use this move as a model and identify which piece improved the most." : `Set the position up again and explain why ${review.bestMove} keeps more control.`,
    review.quality === "good" ? "Check whether the move improved your worst piece, king safety, or tactical pressure." : `Measure the evaluation swing and identify the exact tactical or positional detail ${review.san} missed.`,
  );
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

function analysisPath(gameId: string) {
  return `/analysis/${gameId}`;
}

function getAnalysisIdFromLocation() {
  const match = window.location.pathname.match(/^\/analysis\/([^/]+)$/);
  return match?.[1] || "";
}

function isAnalysisPath() {
  return /^\/analysis\/[^/]+$/.test(window.location.pathname);
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

function normalizeAuthMessage(message: string, signedIn: boolean) {
  if (/Authentication required|Please log in/i.test(message)) {
    return signedIn ? "Session expired, please log in again." : "Please sign in to create a room.";
  }
  if (/Network error|Server unavailable/i.test(message)) {
    return "Could not create room, server unavailable.";
  }
  return message;
}

export default function App() {
  const initialRoomId = getRoomIdFromLocation();
  const initialAnalysisId = getAnalysisIdFromLocation();
  const [game, setGame] = useState(() => new Chess());
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [history, setHistory] = useState<Move[]>([]);
  const [theme, setTheme] = useState<ThemeName>(() => normalizeTheme(loadJson("cm-theme", "midnight")));
  const [language, setLanguage] = useState<Language>(() => loadJson("cm-language", "en"));
  const [soundEnabled, setSoundEnabled] = useState(() => loadJson("cm-sound-enabled", true));
  const [view, setView] = useState<View>(initialAnalysisId || isAnalysisPath() ? "analysis" : initialRoomId || isGamePath() ? "game" : "home");
  const [mode, setMode] = useState<LocalGameMode>(initialRoomId ? "friend" : "ai");
  const [aiLevel, setAiLevel] = useState<AiLevel>(() => loadJson("cm-ai-level", "medium"));
  const [selectedTimeControlId, setSelectedTimeControlId] = useState(() => loadJson("cm-time-control-id", defaultTimeControl.id));
  const [customMinutes, setCustomMinutes] = useState(() => loadJson("cm-custom-minutes", 12));
  const [customIncrement, setCustomIncrement] = useState(() => loadJson("cm-custom-increment", 5));
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [socketSessionToken, setSocketSessionTokenState] = useState("");
  const [savedGames, setSavedGames] = useState<SavedGame[]>(() => loadJson("cm-games", []));
  const [analysisCache, setAnalysisCache] = useState<Record<string, SavedGameAnalysis>>(() => loadJson("cm-analysis-cache", {}));
  const [selectedAnalysisGameId, setSelectedAnalysisGameId] = useState(initialAnalysisId);
  const [analysisMoveIndex, setAnalysisMoveIndex] = useState(0);
  const [analysisPending, setAnalysisPending] = useState(false);
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
  const [puzzleSet, setPuzzleSet] = useState<Puzzle[]>(() => loadJson("cm-puzzle-set", topUpPuzzlePool(makeStarterPuzzleSet())));
  const [selectedPuzzleIndex, setSelectedPuzzleIndex] = useState(0);
  const [puzzleGame, setPuzzleGame] = useState(() => loadPuzzleGame(0));
  const [puzzleSelected, setPuzzleSelected] = useState<Square | null>(null);
  const [puzzleTargets, setPuzzleTargets] = useState<Square[]>([]);
  const [puzzleSolved, setPuzzleSolved] = useState<Record<string, boolean>>(() => loadJson("cm-puzzle-solved", {}));
  const [puzzleMessage, setPuzzleMessage] = useState(puzzles[0].goal);
  const [puzzleDifficulty, setPuzzleDifficulty] = useState<PuzzleDifficulty>(() => loadJson("cm-puzzle-difficulty", "easy"));
  const [puzzleHistory, setPuzzleHistory] = useState<number[]>([0]);
  const [puzzleHistoryIndex, setPuzzleHistoryIndex] = useState(0);
  const [communityDetail, setCommunityDetail] = useState<CommunityDetail | null>(null);
  const [coachMode, setCoachMode] = useState<CoachMode>("beginner");
  const [stockfishBusy, setStockfishBusy] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [stockfishAnalysis, setStockfishAnalysis] = useState<StockfishAnalysis | null>(null);
  const [friendColor, setFriendColor] = useState<"white" | "black" | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [roomConnectionState, setRoomConnectionState] = useState<RoomConnectionState>("idle");
  const [roomBusy, setRoomBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [whiteTimeMs, setWhiteTimeMs] = useState(defaultTimeControl.minutes * 60 * 1000);
  const [blackTimeMs, setBlackTimeMs] = useState(defaultTimeControl.minutes * 60 * 1000);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [resultOverride, setResultOverride] = useState<string | null>(null);
  const [autoRotateBoard, setAutoRotateBoard] = useState(true);
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const lastSavedFen = useRef("");
  const authPanelRef = useRef<HTMLDivElement | null>(null);
  const lastRoomStateRef = useRef<RoomState | null>(null);
  const lastSoundSignatureRef = useRef("");

  const board = useMemo(() => createBoard(game), [game]);
  const capturedPieces = useMemo(() => getCapturedPieces(history), [history]);
  const whiteCaptured = capturedPieces.filter((piece) => piece.startsWith("w"));
  const blackCaptured = capturedPieces.filter((piece) => piece.startsWith("b"));
  const coachReport = useMemo(() => analyzeGame(history, game, stockfishAnalysis, coachMode), [history, game, stockfishAnalysis, coachMode]);
  const reviewScore = useMemo(() => estimateReviewScore(history, game), [history, game]);
  const roomUrl = roomId ? `${window.location.origin}${roomPath(roomId)}` : "";
  const puzzleBoard = useMemo(() => makePuzzleBoard(puzzleGame), [puzzleGame]);
  const selectedPuzzle = puzzleSet[selectedPuzzleIndex] ?? puzzleSet[0];
  const filteredPuzzleEntries = useMemo(() => getPuzzlesForDifficulty(puzzleSet, puzzleDifficulty), [puzzleSet, puzzleDifficulty]);
  const filteredPuzzleCount = filteredPuzzleEntries.length;
  const solvedFilteredPuzzleCount = useMemo(
    () => filteredPuzzleEntries.filter(({ puzzle }) => puzzleSolved[puzzle.title]).length,
    [filteredPuzzleEntries, puzzleSolved],
  );
  const dynamicCoachTimeline = useMemo(() => getCoachTimeline(history, game), [history, game]);
  const roomList = useMemo(() => getRoomList(profile), [profile]);
  const courseCompletion = useMemo(() => getCourseCompletion(lessonProgress), [lessonProgress]);
  const selectedTimeControl = useMemo(() => {
    const preset = timeControlGroups.flatMap((group) => group.options).find((option) => option.id === selectedTimeControlId);
    return preset ?? makeTimeControl(customMinutes, customIncrement);
  }, [selectedTimeControlId, customMinutes, customIncrement]);
  const activeTurn = roomState?.turn || (game.turn() === "w" ? "white" : "black");
  const boardOrientation = getBoardOrientation(mode, activeTurn, autoRotateBoard);
  const checkedKingSquare = useMemo(() => findCheckedKingSquare(game), [game]);
  const gamePresentation = useMemo(
    () =>
      buildGameStatus({
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
  const isGameFinished = gamePresentation.finished;
  const showGameAnalysis = view === "game" && isGameFinished && analysisOpen;
  const selectedAnalysisGame = useMemo(
    () => savedGames.find((savedGame) => savedGame.id === selectedAnalysisGameId) || null,
    [savedGames, selectedAnalysisGameId],
  );
  const analysisReplay = useMemo(
    () => (selectedAnalysisGame ? parseSavedGameMoves(selectedAnalysisGame) : null),
    [selectedAnalysisGame],
  );
  const analysisTimelineMoves = analysisReplay?.moves || [];
  const maxAnalysisIndex = analysisTimelineMoves.length;
  const analysisPosition = useMemo(() => {
    return replayGameToMove(analysisReplay, analysisMoveIndex);
  }, [analysisReplay, analysisMoveIndex]);
  const analysisBoard = useMemo(() => createBoard(analysisPosition), [analysisPosition]);
  const selectedAnalysis = selectedAnalysisGameId ? analysisCache[selectedAnalysisGameId] || null : null;
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const currentAnalysisReview =
    selectedAnalysis && analysisMoveIndex > 0
      ? selectedAnalysis.moveReviews[Math.min(selectedAnalysis.moveReviews.length, analysisMoveIndex) - 1] || null
      : null;

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
          puzzleText: `${solvedFilteredPuzzleCount}/${filteredPuzzleCount} решено на уровне ${getPuzzleDifficultyLabel(puzzleDifficulty).toLowerCase()}. После решения загружается новая задача.`,
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
          puzzleText: `${solvedFilteredPuzzleCount}/${filteredPuzzleCount} solved at the ${getPuzzleDifficultyLabel(puzzleDifficulty).toLowerCase()} level. New puzzles load automatically after each success.`,
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
      metric: `${solvedFilteredPuzzleCount}/${filteredPuzzleCount || puzzleSet.length}`,
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
    localStorage.setItem("cm-analysis-cache", JSON.stringify(analysisCache));
  }, [analysisCache]);

  useEffect(() => {
    localStorage.setItem("cm-theme", JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("cm-language", JSON.stringify(language));
  }, [language]);

  useEffect(() => {
    localStorage.setItem("cm-sound-enabled", JSON.stringify(soundEnabled));
  }, [soundEnabled]);

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
    localStorage.setItem("cm-puzzle-difficulty", JSON.stringify(puzzleDifficulty));
  }, [puzzleDifficulty]);

  useEffect(() => {
    const toppedUp = topUpPuzzlePool(puzzleSet);
    if (toppedUp.length === puzzleSet.length) return;
    setPuzzleSet(toppedUp);
  }, [puzzleSet]);

  useEffect(() => {
    const currentPuzzle = puzzleSet[selectedPuzzleIndex];
    if (currentPuzzle && getPuzzleDifficulty(currentPuzzle) === puzzleDifficulty) {
      return;
    }

    const matching = getPuzzlesForDifficulty(puzzleSet, puzzleDifficulty);
    if (matching.length === 0) return;

    const unsolved = matching.find(({ puzzle }) => !puzzleSolved[puzzle.title]) || matching[0];
    setSelectedPuzzleIndex(unsolved.index);
    setPuzzleGame(loadPuzzleGame(unsolved.index, puzzleSet));
    setPuzzleSelected(null);
    setPuzzleTargets([]);
    setPuzzleMessage(getPuzzleResultText(unsolved.puzzle, isPuzzleSolved(puzzleSolved, unsolved.puzzle)));
    setPuzzleHistory([unsolved.index]);
    setPuzzleHistoryIndex(0);
  }, [puzzleDifficulty, puzzleSet, puzzleSolved, selectedPuzzleIndex]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapApp() {
      try {
        const sessionUser = await getSession();
        if (cancelled) return;

        if (sessionUser) {
          setProfile(mapUserToProfile(sessionUser.user));
          const liveToken = sessionUser.socketToken || sessionUser.sessionToken;
          setSocketSessionTokenState(liveToken);
          setSocketToken(liveToken);
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
    setSocketToken(socketSessionToken);
  }, [socketSessionToken]);

  useEffect(() => {
    if (!profile.signedIn) return;

    setHistoryLoading(true);
    getHistory()
      .then((items) => {
        const mapped = items.map((item) => {
          const pgn = String(item.pgn || "");
          const sanMoves = Array.isArray(item.moves)
            ? item.moves.map((move) => String(move))
            : extractMovesFromPgn(pgn);
          const uciMoves = Array.isArray(item.uciMoves)
            ? item.uciMoves.map((move) => String(move))
            : [];
          return {
            id: String(item.id),
            date: String(item.finishedAt || item.createdAt || new Date().toISOString()),
            mode: item.mode === "friend" ? "friend" : "ai",
            result: String(item.result || "*"),
            moves: sanMoves,
            uciMoves,
            pgn,
            initialFen: typeof item.initialFen === "string" ? String(item.initialFen) : new Chess().fen(),
            finalFen:
              typeof item.finalFen === "string"
                ? String(item.finalFen)
                : String(item.fen || ""),
            coach: [],
            city: profile.city,
            reviewScore: null,
            status: String(item.status || ""),
            timeControl:
              typeof item.timeControl === "string"
                ? String(item.timeControl)
                : typeof item.summary === "string" && item.summary.includes("+")
                  ? String(item.summary)
                  : "",
            opponent:
              typeof item.opponent === "string"
                ? String(item.opponent)
                :
              item.mode === "friend"
                ? String(
                    (
                      (item.white as { name?: string } | undefined)?.name === profile.name
                        ? (item.black as { name?: string } | undefined)?.name
                        : (item.white as { name?: string } | undefined)?.name
                    ) || "Friend",
                  )
                : aiProfiles[aiLevel].name,
            players: {
              white: String((item.white as { name?: string } | undefined)?.name || "White"),
              black: String((item.black as { name?: string } | undefined)?.name || "Black"),
            },
          };
        }) as SavedGame[];
        setSavedGames(mapped);
      })
      .catch((error) => setToast(error instanceof Error ? error.message : "Failed to load history."))
      .finally(() => setHistoryLoading(false));
  }, [profile.signedIn, profile.city]);

  useEffect(() => {
    if (!analysisReplay) {
      if (analysisMoveIndex !== 0) {
        setAnalysisMoveIndex(0);
      }
      return;
    }

    const clamped = clampAnalysisIndex(analysisReplay.positions.length, analysisMoveIndex);
    if (clamped !== analysisMoveIndex) {
      setAnalysisMoveIndex(clamped);
    }
  }, [analysisReplay, analysisMoveIndex]);

  useEffect(() => {
    const handlePopState = () => {
      const nextRoomId = getRoomIdFromLocation();
      const nextAnalysisId = getAnalysisIdFromLocation();
      if (nextRoomId) {
        setRoomId(nextRoomId);
        setView("game");
        setMode("friend");
        return;
      }
      if (nextAnalysisId) {
        setSelectedAnalysisGameId(nextAnalysisId);
        setAnalysisMoveIndex(0);
        setView("analysis");
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

    let cancelled = false;
    setRoomConnectionState("joining");
    getRoom(roomId)
      .then((response) => {
        if (cancelled) return;
        if (response.state) {
          setRoomState(response.state);
          setFriendColor(response.color);
          setMode("friend");
          setView("game");
          syncGame(new Chess(response.state.fen));
          setRoomConnectionState(response.state.waitingForOpponent ? "waiting" : "ready");
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setRoomConnectionState("error");
        setToast(normalizeAuthMessage(error instanceof Error ? error.message : "Unable to load room.", profile.signedIn));
      });

    return () => {
      cancelled = true;
    };
  }, [profile.signedIn, roomId]);

  useEffect(() => {
    if (!profile.signedIn || !roomId || !socketSessionToken) return;

    const socket = getSocket();
    socket.auth = { token: socketSessionToken };

    const handleRoomState = (nextState: RoomState) => {
      setRoomState(nextState);
      syncGame(new Chess(nextState.fen));
      setRoomConnectionState(nextState.waitingForOpponent ? "waiting" : nextState.status === "opponent disconnected" ? "disconnected" : "ready");
    };

    const handleConnectError = (error: Error) => {
      setRoomConnectionState("error");
      setToast(normalizeAuthMessage(error?.message || "Live room connection failed.", profile.signedIn));
    };
    const handleRoomError = (payload: { error?: string }) => {
      setRoomConnectionState("error");
      setToast(normalizeAuthMessage(payload?.error || "Live room connection failed.", profile.signedIn));
    };
    const handlePlayerJoined = (payload: { player?: { name?: string } | null }) => {
      setRoomConnectionState("ready");
      if (payload?.player?.name) {
        setToast(`${payload.player.name} joined the room as Black.`);
      }
    };
    const handleMoveMade = (payload: { move?: { san?: string; color?: "white" | "black" } }) => {
      if (!payload?.move?.san) return;
      setToast(`${payload.move.color === "white" ? "White" : "Black"} played ${payload.move.san}.`);
    };
    const handleOpponentDisconnected = () => {
      setRoomConnectionState("disconnected");
      setToast("Opponent disconnected. The room will stay open if they come back.");
    };

    socket.on("room:state", handleRoomState);
    socket.on("gameState", handleRoomState);
    socket.on("connect_error", handleConnectError);
    socket.on("room:error", handleRoomError);
    socket.on("playerJoined", handlePlayerJoined);
    socket.on("moveMade", handleMoveMade);
    socket.on("opponentDisconnected", handleOpponentDisconnected);

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit(
      "room:join",
      { roomId },
        (response: { ok: boolean; error?: string; color?: "white" | "black"; state?: RoomState }) => {
          if (!response?.ok || !response.state) {
            setRoomConnectionState("error");
            setToast(normalizeAuthMessage(response?.error || "Unable to join room.", profile.signedIn));
            return;
          }

        setFriendColor(response.color || null);
        setMode("friend");
        setView("game");
        setRoomState(response.state);
        syncGame(new Chess(response.state.fen));
        setRoomConnectionState(response.state.waitingForOpponent ? "waiting" : "ready");
        setToast(response.state.waitingForOpponent ? "Room created. Waiting for opponent." : "Friend room connected.");
      },
    );

    const syncInterval = window.setInterval(() => {
      socket.emit("room:sync", { roomId }, () => undefined);
    }, 1000);

    return () => {
      window.clearInterval(syncInterval);
      socket.off("room:state", handleRoomState);
      socket.off("gameState", handleRoomState);
      socket.off("connect_error", handleConnectError);
      socket.off("room:error", handleRoomError);
      socket.off("playerJoined", handlePlayerJoined);
      socket.off("moveMade", handleMoveMade);
      socket.off("opponentDisconnected", handleOpponentDisconnected);
      socket.disconnect();
      setRoomConnectionState("idle");
    };
  }, [profile.signedIn, roomId, socketSessionToken]);

  useEffect(() => {
    if (!sessionChecked || !roomId || profile.signedIn) return;
    setAuthMode("login");
    setAuthNotice({
      tone: "info",
      text: "Please log in first. Chess Master will return you to the friend room automatically.",
    });
    setToast("Please sign in to join this friend room.");
  }, [sessionChecked, roomId, profile.signedIn]);

  useEffect(() => {
    if (!roomState) {
      lastRoomStateRef.current = null;
      return;
    }

    const previous = lastRoomStateRef.current;
    if (previous?.waitingForOpponent && !roomState.waitingForOpponent) {
      setToast("Opponent joined. Game on.");
    } else if (previous?.status !== "opponent disconnected" && roomState.status === "opponent disconnected") {
      setToast("Opponent disconnected. The room will stay open if they come back.");
    }

    lastRoomStateRef.current = roomState;
  }, [roomState]);

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
    if (view !== "game") {
      lastSoundSignatureRef.current = "";
      return;
    }

    const signature = `${mode}:${roomId || "local"}:${game.fen()}:${history.length}:${gamePresentation.reason}:${roomState?.status || ""}`;
    if (signature === lastSoundSignatureRef.current) return;
    lastSoundSignatureRef.current = signature;

    if (history.length === 0) return;
    const latestMove = history[history.length - 1];
    if (!latestMove) return;

    if (isGameFinished && (gamePresentation.reason === "timeout" || gamePresentation.reason === "resignation")) {
      playBoardSound("gameover", soundEnabled);
      return;
    }

    queueMoveSounds(latestMove, game);
  }, [view, mode, roomId, game, history, roomState?.status, gamePresentation.reason, soundEnabled]);

  useEffect(() => {
    if (view !== "game" || mode === "friend") return;
    if (isGameFinished) return;

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
  }, [view, mode, game, isGameFinished]);

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

  function toggleSound() {
    setSoundEnabled((current) => {
      const next = !current;
      setToast(next ? "Chess sounds enabled." : "Chess sounds muted.");
      return next;
    });
  }

  function queueMoveSounds(move: Move, nextGame: Chess) {
    const soundQueue: Array<{ kind: Parameters<typeof playBoardSound>[0]; delay?: number }> = [];

    if (move.promotion) {
      soundQueue.push({ kind: "promotion" });
    } else if (move.san === "O-O" || move.san === "O-O-O") {
      soundQueue.push({ kind: "castle" });
    } else if (move.captured) {
      soundQueue.push({ kind: "capture" });
    } else {
      soundQueue.push({ kind: "move" });
    }

    if (nextGame.isCheckmate()) {
      soundQueue.push({ kind: "gameover", delay: 110 });
    } else if (nextGame.isCheck()) {
      soundQueue.push({ kind: "check", delay: 90 });
    } else if (nextGame.isDraw()) {
      soundQueue.push({ kind: "gameover", delay: 90 });
    }

    soundQueue.forEach(({ kind, delay }) => playBoardSound(kind, soundEnabled, delay ?? 0));
  }

  function openGameView(path = gamePath()) {
    setView("game");
    setAnalysisOpen(false);
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
    setPendingPromotion(null);
    setAiThinking(false);
    setAnalysisOpen(false);
    resetLocalClock(selectedTimeControl);
    syncGame(nextGame);
    openGameView();
    setToast(`${getModeLabel(nextMode)} started · ${getTimeControlTitle(selectedTimeControl)}.`);
  }

  function makeAiMove(nextGame: Chess) {
    setAiThinking(true);
    setStockfishAnalysis(null);
    window.setTimeout(async () => {
      if (nextGame.isGameOver() || mode !== "ai" || view !== "game") {
        setAiThinking(false);
        return;
      }

      try {
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
          if (!fallback) {
            setToast("AI could not find a legal move, but the board is still stable.");
            setAiThinking(false);
            return;
          }
          aiMove = applyVerboseMove(nextGame, fallback);
        }

        if (!aiMove) {
          setToast("AI move failed. Try Analyze or Restart.");
          setAiThinking(false);
          return;
        }

        syncGame(nextGame);
        applyIncrement("black");
        setToast(`AI played ${aiMove.san}.`);
      } catch (error) {
        setToast(error instanceof Error ? error.message : "AI move failed, but your game is still safe.");
      } finally {
        setStockfishBusy(false);
        setAiThinking(false);
      }
    }, aiLevel === "pro" ? 260 : 420);
  }

  function completeMove(from: Square, to: Square, promotion: PromotionChoice = "q") {
    if (isGameFinished) return;
    const nextGame = new Chess(game.fen());
    let move: Move | null = null;

    try {
      move = nextGame.move({ from, to, promotion });
    } catch {
      move = null;
    }

    setPendingPromotion(null);
    setSelected(null);
    setLegalTargets([]);

    if (!move) {
      playBoardSound("illegal", soundEnabled);
      setToast("Move could not be completed.");
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
          promotion,
        },
        (response: { ok: boolean; error?: string; state?: RoomState }) => {
          if (!response?.ok) {
            playBoardSound("illegal", soundEnabled);
            setToast(normalizeAuthMessage(response?.error || "Move rejected.", profile.signedIn));
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
    setToast(`${move.san} played.`);
    if (mode === "ai") {
      makeAiMove(nextGame);
    }
  }

  function handleSquareClick(square: Square) {
    if (isGameFinished || pendingPromotion) return;
    if (mode === "ai" && (game.turn() !== "w" || aiThinking)) return;
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
    const friendlyColor =
      mode === "friend"
        ? friendColor === "white"
          ? "w"
          : "b"
        : mode === "local"
          ? game.turn()
          : "w";
    if (!selected) {
      if (piece && piece.color === friendlyColor) {
        setSelected(square);
        setLegalTargets(game.moves({ square, verbose: true }).map((move) => move.to));
      }
      return;
    }

    const promotionCandidate = findPromotionMove(game, selected, square);
    if (promotionCandidate) {
      setPendingPromotion({
        from: selected,
        to: square,
        color: promotionCandidate.color === "w" ? "white" : "black",
      });
      return;
    }

    const movePreview = safeMove(new Chess(game.fen()), selected, square);
    if (!movePreview) {
      setSelected(null);
      setLegalTargets([]);
      playBoardSound("illegal", soundEnabled);
      if (piece && piece.color === friendlyColor) {
        setSelected(square);
        setLegalTargets(game.moves({ square, verbose: true }).map((target) => target.to));
      }
      return;
    }
    completeMove(selected, square);
  }

  function resetGame(nextMode = mode) {
    if (nextMode === "friend") {
      void createRoom();
      return;
    }

    startGame(nextMode);
  }

  function buildSavedGameSnapshot(): SavedGame {
    const now = new Date().toISOString();
    const opponentName =
      mode === "friend"
        ? roomState?.players.black?.name || roomState?.players.white.name || "Friend"
        : mode === "ai"
          ? aiProfiles[aiLevel].name
          : "Local board";

    return {
      id: crypto.randomUUID(),
      date: now,
      mode,
      result: resultOverride || getResult(game),
      moves: history.map((move) => move.san),
      uciMoves: history.map((move) => `${move.from}${move.to}${move.promotion || ""}`),
      pgn: game.pgn(),
      initialFen: new Chess().fen(),
      finalFen: game.fen(),
      coach: coachReport,
      city: profile.city,
      reviewScore,
      status: `${gamePresentation.headline} — ${gamePresentation.detail}`,
      timeControl: getTimeControlTitle(mode === "friend" && roomState ? roomState.timeControl : selectedTimeControl),
      opponent: opponentName,
      players: {
        white: mode === "friend" ? roomState?.players.white.name || "White" : "White",
        black: mode === "friend" ? roomState?.players.black?.name || "Black" : opponentName,
      },
    };
  }

  function saveGame(source: "auto" | "manual", options?: { silent?: boolean }) {
    const saved = buildSavedGameSnapshot();
    setSavedGames((current) => [saved, ...current].slice(0, 20));
    if (profile.signedIn && mode !== "friend") {
      void saveHistory({
        mode,
        result: saved.result,
        status: saved.status || (isGameFinished ? `${gamePresentation.headline} — ${gamePresentation.detail}` : "saved"),
        pgn: saved.pgn,
        fen: game.fen(),
        summary: `${getReviewLabel(reviewScore)} review saved from the ${mode} board.`,
        moves: saved.moves,
        uciMoves: saved.uciMoves,
        initialFen: saved.initialFen,
        finalFen: saved.finalFen,
        timeControl: saved.timeControl,
        opponent: saved.opponent,
        players: saved.players,
      }).catch(() => undefined);
    }
    if (source === "manual" && !options?.silent) setToast("Game saved to your local history.");
    return saved;
  }

  async function createRoom() {
    if (!profile.signedIn) {
      openAuth("login");
      setToast("Please sign in to create a room.");
      return;
    }

    try {
      setRoomBusy(true);
      const room = await createFriendRoom({ timeControl: selectedTimeControl });
      setRoomId(room.roomId);
      setMode("friend");
      setFriendColor("white");
      setInviteEmail("");
      setRoomState(room.state);
      setRoomConnectionState("waiting");
      resetLocalClock(selectedTimeControl);
      openGameView(roomPath(room.roomId));
      syncGame(new Chess(room.state.fen));
      setToast(`Friend room created · ${getTimeControlTitle(selectedTimeControl)}. Share the link and wait for black to join.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? normalizeAuthMessage(error.message, profile.signedIn)
          : "Could not create room, server unavailable.";
      setToast(message);
    } finally {
      setRoomBusy(false);
    }
  }

  async function copyRoomLink() {
    if (!roomUrl) return;
    try {
      await navigator.clipboard.writeText(roomUrl);
      setToast("Room link copied.");
    } catch {
      setToast("Could not copy automatically. Copy the invite link from the room panel.");
    }
  }

  function backToLobby() {
    getSocket().disconnect();
    setView("play");
    setAnalysisOpen(false);
    setRoomId("");
    setRoomState(null);
    setRoomConnectionState("idle");
    setFriendColor(null);
    setSelected(null);
    setLegalTargets([]);
    setPendingPromotion(null);
    window.history.replaceState(null, "", "/");
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
          playBoardSound("illegal", soundEnabled);
          setToast(normalizeAuthMessage(response?.error || "Draw request failed.", profile.signedIn));
          return;
        }
        if (response.state) {
          setRoomState(response.state);
          syncGame(new Chess(response.state.fen));
        }
        playBoardSound("gameover", soundEnabled);
        setToast("Draw agreed.");
      });
      return;
    }

    setResultOverride("1/2-1/2");
    setStatusOverride("Draw agreed");
    playBoardSound("gameover", soundEnabled);
    setToast("Draw agreed.");
  }

  function resignGame() {
    if (mode === "friend" && roomId) {
      const socket = getSocket();
      socket.emit("room:resign", { roomId }, (response: { ok: boolean; error?: string; state?: RoomState }) => {
        if (!response?.ok) {
          playBoardSound("illegal", soundEnabled);
          setToast(normalizeAuthMessage(response?.error || "Resign failed.", profile.signedIn));
          return;
        }
        if (response.state) {
          setRoomState(response.state);
          syncGame(new Chess(response.state.fen));
        }
        playBoardSound("gameover", soundEnabled);
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
    playBoardSound("gameover", soundEnabled);
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
      const session =
        authMode === "signup"
          ? await registerUser({ name, email, password, city })
          : await loginUser({ email, password });
      setProfile(mapUserToProfile(session.user));
      const liveToken = session.socketToken || session.sessionToken;
      setSocketSessionTokenState(liveToken);
      setSocketToken(liveToken);
      setView(roomId ? "game" : "home");
      setAuthErrors({});
      setAuthNotice({
        tone: "success",
        text: authMode === "signup" ? "Account created successfully. Opening your dashboard." : "Signed in successfully. Opening your dashboard.",
      });
      setToast(authMode === "signup" ? `Account created for ${session.user.name}.` : `Welcome back, ${session.user.name}.`);
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

    getSocket().disconnect();
    setView("home");
    setRoomId("");
    setRoomState(null);
    setRoomConnectionState("idle");
    setFriendColor(null);
    setSocketSessionTokenState("");
    setSocketToken("");
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

  function loadPuzzleIndex(index: number, options?: { pushHistory?: boolean; message?: string }) {
    const puzzle = puzzleSet[index];
    if (!puzzle) return;

    setSelectedPuzzleIndex(index);
    setPuzzleGame(loadPuzzleGame(index, puzzleSet));
    setPuzzleSelected(null);
    setPuzzleTargets([]);
    setPuzzleMessage(options?.message || getPuzzleResultText(puzzle, isPuzzleSolved(puzzleSolved, puzzle)));

    if (options?.pushHistory) {
      setPuzzleHistory((current) => {
        const nextHistory = [...current.slice(0, puzzleHistoryIndex + 1), index];
        setPuzzleHistoryIndex(nextHistory.length - 1);
        return nextHistory;
      });
    }
  }

  function selectPuzzle(index: number) {
    loadPuzzleIndex(index, { pushHistory: true });
  }

  function goToPuzzleHistory(nextHistoryIndex: number) {
    const clamped = Math.max(0, Math.min(puzzleHistory.length - 1, nextHistoryIndex));
    const nextPuzzleIndex = puzzleHistory[clamped];
    if (typeof nextPuzzleIndex !== "number") return;
    setPuzzleHistoryIndex(clamped);
    loadPuzzleIndex(nextPuzzleIndex);
  }

  function moveToNextPuzzle(options?: { solvedNow?: boolean }) {
    if (puzzleHistoryIndex < puzzleHistory.length - 1) {
      goToPuzzleHistory(puzzleHistoryIndex + 1);
      return;
    }

    const nextIndex = getNextUnsolvedPuzzleIndex({
      puzzleList: puzzleSet,
      solved: puzzleSolved,
      difficulty: puzzleDifficulty,
      currentIndex: selectedPuzzleIndex,
    });

    if (nextIndex >= 0) {
      loadPuzzleIndex(nextIndex, {
        pushHistory: true,
        message: options?.solvedNow ? `${puzzleSet[nextIndex].goal}` : undefined,
      });
      return;
    }

    const nextPuzzle = makeGeneratedPuzzle(puzzleSet.length, puzzleDifficulty);
    setPuzzleSet((current) => [...current, nextPuzzle]);
    const generatedIndex = puzzleSet.length;
    setPuzzleSelected(null);
    setPuzzleTargets([]);
    setSelectedPuzzleIndex(generatedIndex);
    setPuzzleGame(new Chess(nextPuzzle.fen));
    setPuzzleMessage(`Fresh ${getPuzzleDifficultyLabel(getPuzzleDifficulty(nextPuzzle)).toLowerCase()} puzzle generated: ${nextPuzzle.goal}`);
    setPuzzleHistory((current) => {
      const nextHistory = [...current.slice(0, puzzleHistoryIndex + 1), generatedIndex];
      setPuzzleHistoryIndex(nextHistory.length - 1);
      return nextHistory;
    });
    setToast("All current puzzles at this level are solved. Chess Master generated a fresh challenge.");
  }

  function moveToPreviousPuzzle() {
    if (puzzleHistoryIndex === 0) {
      setToast("You are already at the first puzzle in this review path.");
      return;
    }
    goToPuzzleHistory(puzzleHistoryIndex - 1);
  }

  function requestPuzzleHint() {
    setPuzzleMessage(getPuzzleHint(selectedPuzzle));
  }

  function resetPuzzle() {
    loadPuzzleIndex(selectedPuzzleIndex, { message: selectedPuzzle.goal });
  }

  function replayPuzzleSolution() {
    const replay = new Chess(selectedPuzzle.fen);
    try {
      replay.move({
        from: selectedPuzzle.solution.from,
        to: selectedPuzzle.solution.to,
        promotion: "q",
      });
      finishPuzzleReply(replay);
      setPuzzleGame(new Chess(replay.fen()));
      setPuzzleSelected(null);
      setPuzzleTargets([]);
      setPuzzleMessage(`Solution replay: ${selectedPuzzle.solution.san}. Review the final position, then try the next puzzle.`);
      setToast("Solution replay loaded.");
    } catch {
      setToast("Solution replay is unavailable for this puzzle.");
    }
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
      window.setTimeout(() => {
        moveToNextPuzzle({ solvedNow: true });
      }, 900);
    } else {
      setPuzzleGame(loadPuzzleGame(selectedPuzzleIndex, puzzleSet));
      setPuzzleMessage(`Not quite. ${getPuzzleHint(selectedPuzzle)}`);
      playBoardSound("illegal", soundEnabled);
      setToast("Puzzle reset. Try again with the hint.");
    }
  }

  async function analyzeNow() {
    if (view === "game" && !isGameFinished) {
      setToast("Finish the game first, then open analysis with Coach.");
      return;
    }

    if (view === "game") {
      setAnalysisOpen(true);
      const savedGame = saveGame("auto", { silent: true });
      await analyzeSavedGame(savedGame);
      return;
    }

    setView("coach");

    try {
      if (!canUseStockfish()) {
        setStockfishAnalysis(null);
        setToast(`${getCoachPositionLine(game, history)} Engine unavailable, so Chess Master is using the built-in positional coach instead.`);
        return;
      }

      setStockfishBusy(true);
      const analysis = await analyzeFen(game.fen(), 12);
      setStockfishAnalysis(analysis);

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
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Analysis failed.");
    } finally {
      setStockfishBusy(false);
    }
  }

  function openSavedGameView(savedGame: SavedGame) {
    const replayData = parseSavedGameMoves(savedGame);
    const replay = replayGameToMove(replayData, replayData.moves.length);
    if (replayData.moves.length === 0 && savedGame.finalFen) {
      try {
        replay.load(savedGame.finalFen);
      } catch {
        // Keep the default board if the saved final FEN is invalid.
      }
    }

    setMode(savedGame.mode === "ai" ? "ai" : "local");
    setRoomId("");
    setRoomState(null);
    setFriendColor(null);
    syncGame(replay);
    setResultOverride(savedGame.result === "In progress" ? null : savedGame.result);
    setStatusOverride(savedGame.status || null);
    setView("game");
    setAnalysisOpen(false);
    setAnalysisMoveIndex(0);
    window.history.replaceState(null, "", gamePath());
    setToast(
      replayData.moves.length > 0
        ? `Loaded ${savedGame.mode} game from ${formatDate(savedGame.date)}.`
        : "This saved game has incomplete move data, so Chess Master loaded the last stable position.",
    );
  }

  async function analyzeSavedGame(savedGame: SavedGame, options?: { preserveSelection?: boolean }) {
    setSelectedAnalysisGameId(savedGame.id);
    if (!options?.preserveSelection) {
      setAnalysisMoveIndex(0);
    }
    setView("analysis");
    setAnalysisError(null);
    window.history.replaceState(null, "", analysisPath(savedGame.id));

    if (analysisCache[savedGame.id]?.coachMode === coachMode) {
      setToast("Saved analysis opened.");
      return;
    }

    const replayData = parseSavedGameMoves(savedGame);
    if (replayData.moves.length === 0) {
      setToast("This saved game has no moves to analyze yet.");
      return;
    }

    const buildAnalysisResult = (moveReviews: AnalysisMoveReview[]): SavedGameAnalysis => {
      if (moveReviews.length === 0) {
        return {
          gameId: savedGame.id,
          coachMode,
          moveReviews: [],
          summary: {
            accuracy: 0,
            biggestMistake: "No replayable moves were found for this game.",
            bestMove: "No moves available.",
            openingAdvice: "Replay data is incomplete, so the opening could not be reviewed yet.",
            middlegameAdvice: "Save another completed game to get a full move-by-move review.",
            endgameAdvice: "Once the move list is available, Chess Master can highlight the endgame turning point.",
            training: [
              "Save one full game from start to finish",
              "Review the move list before opening Coach",
              "Try another fresh game if this record is incomplete",
            ],
          },
        };
      }

      const biggestMistake = [...moveReviews]
        .reverse()
        .find((item) => item.quality === "blunder" || item.quality === "mistake") || moveReviews[moveReviews.length - 1];
      const bestReviewedMove =
        moveReviews.find((item) => item.quality === "brilliant" || item.quality === "good") || moveReviews[0];
      const accuracy = Math.max(
        42,
        Math.min(
          97,
          Math.round(
            moveReviews.reduce((score, item) => {
              if (item.quality === "brilliant") return score + 1;
              if (item.quality === "good") return score + 0.86;
              if (item.quality === "inaccuracy") return score + 0.62;
              if (item.quality === "mistake") return score + 0.38;
              return score + 0.18;
            }, 0) /
              moveReviews.length *
              100,
          ),
        ),
      );

      return {
        gameId: savedGame.id,
        coachMode,
        moveReviews,
        summary: {
          accuracy,
          biggestMistake: `Move ${biggestMistake.ply}: ${biggestMistake.explanation}`,
          bestMove: `Move ${bestReviewedMove.ply}: ${bestReviewedMove.bestMove}`,
          openingAdvice: moveReviews.slice(0, Math.min(10, moveReviews.length)).some((item) => /Opening principle/.test(item.principle))
            ? "Castle earlier, develop more pieces before repeat moves, and keep the queen flexible."
            : "Your opening was stable. Keep comparing development speed with king safety.",
          middlegameAdvice: "Before each attacking move, compare checks, captures, and the safety of your least protected piece.",
          endgameAdvice: "When material comes off, centralize the king faster and avoid creating new pawn weaknesses.",
          training: [
            "10 minutes of tactics with checks and loose-piece motifs",
            "One saved game review with move-by-move comparison",
            "One short endgame drill focusing on king activity",
          ],
        },
      };
    };

    const buildFallbackReviews = () => {
      const fallbackWalker = new Chess(replayData.initialFen);
      const moveReviews: AnalysisMoveReview[] = [];

      for (let index = 0; index < replayData.moves.length; index += 1) {
        const move = replayData.moves[index];
        const before = new Chess(fallbackWalker.fen());
        const bestMove = findBestMove(before);

        moveReviews.push(
          buildCoachMoveReview({
            gameBefore: before,
            move,
            bestMove,
            analysis: null,
            coachMode,
            ply: index + 1,
          }),
        );

        try {
          fallbackWalker.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || "q",
          });
        } catch {
          break;
        }
      }

      return moveReviews;
    };

    const fallbackAnalysis = buildAnalysisResult(buildFallbackReviews());
    setAnalysisCache((current) => ({ ...current, [savedGame.id]: fallbackAnalysis }));
    setToast("Quick coach review ready.");

    if (!canUseStockfish()) {
      return;
    }

    setAnalysisPending(true);

    try {
      const moveReviews: AnalysisMoveReview[] = [];
      const walker = new Chess(replayData.initialFen);

      for (let index = 0; index < replayData.moves.length; index += 1) {
        const move = replayData.moves[index];
        const before = new Chess(walker.fen());
        let engineAnalysis: StockfishAnalysis | null = null;

        if (canUseStockfish()) {
          try {
            engineAnalysis = await analyzeFen(before.fen(), 10);
          } catch {
            engineAnalysis = null;
          }
        }

        const bestMove =
          engineAnalysis?.bestMove ? playUciMove(new Chess(before.fen()), engineAnalysis.bestMove) : findBestMove(before);

        moveReviews.push(
          buildCoachMoveReview({
            gameBefore: before,
            move,
            bestMove,
            analysis: engineAnalysis,
            coachMode,
            ply: index + 1,
          }),
        );

        try {
          walker.move({
            from: move.from,
            to: move.to,
            promotion: move.promotion || "q",
          });
        } catch {
          break;
        }
      }
      setAnalysisCache((current) => ({ ...current, [savedGame.id]: buildAnalysisResult(moveReviews) }));
      setToast("Deep coach analysis completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Coach analysis failed.";
      setAnalysisError(message);
      setToast(message);
    } finally {
      setAnalysisPending(false);
    }
  }

  useEffect(() => {
    if (view !== "analysis" || !selectedAnalysisGame || analysisPending) return;
    const cached = analysisCache[selectedAnalysisGame.id];
    if (cached?.coachMode === coachMode) return;
    void analyzeSavedGame(selectedAnalysisGame, { preserveSelection: true });
  }, [analysisCache, analysisPending, coachMode, selectedAnalysisGame, view]);

  async function joinCommunityRoom(label: string) {
    setMode("friend");
    setToast(`${label} selected. Creating a live room for this community game.`);
    await createRoom();
  }

  function moveAnalysisTo(target: number) {
    if (!analysisReplay) return;
    setAnalysisMoveIndex(clampAnalysisIndex(analysisReplay.positions.length, target));
  }

  function stepAnalysis(offset: number) {
    if (!analysisReplay) return;
    setAnalysisMoveIndex((current) => clampAnalysisIndex(analysisReplay.positions.length, current + offset));
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
    <AppErrorBoundary>
      <main className={`app ${theme}`} onPointerDownCapture={unlockBoardAudio} onKeyDownCapture={unlockBoardAudio}>
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
          <button className="iconButton" onClick={toggleSound} aria-label={soundEnabled ? "Mute chess sounds" : "Enable chess sounds"}>
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
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
            {profile.pro ? "Pro Preview" : "Upgrade Pro"}
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
      <section className={`productShell ${mobileNavOpen ? "navOpen" : ""} ${view === "game" || view === "analysis" ? "gameShell" : ""}`}>
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
                    {profile.pro ? "Pro preview enabled" : "Starter path"}
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
                  <p className="sectionLead">Pick a mode, choose a time control, and launch into a focused game page with clocks, move list, and clean controls. Coach analysis opens only after the result.</p>
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
                  <p>Train against an easy, club, or master-strength bot, then open post-game analysis when the result is in.</p>
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
            <>
              <div className="gamePage">
                <section className="gameBoardShell">
                  <div className="gameHeader">
                    <div className="gameStatusPanel">
                      <span className="eyebrow">{getModeLabel(mode)} · {getTimeControlTitle(mode === "friend" && roomState ? roomState.timeControl : selectedTimeControl)}</span>
                      <div className={gamePresentation.reason === "check" ? "statusBadge warningStatusBadge" : gamePresentation.finished ? "statusBadge finishedStatusBadge" : "statusBadge"}>
                        {aiThinking ? "AI is thinking..." : gamePresentation.headline}
                      </div>
                      <h2>{aiThinking ? "Waiting for the engine reply" : gamePresentation.detail}</h2>
                      {mode === "friend" && roomConnectionState === "joining" && (
                        <p className="gameSubstatus">Connecting the live room and restoring the latest board state.</p>
                      )}
                      {mode === "friend" && roomConnectionState === "waiting" && (
                        <p className="gameSubstatus">Share the invite link. White is ready and Black can join straight from the room URL.</p>
                      )}
                      {mode === "friend" && roomConnectionState === "disconnected" && (
                        <p className="gameSubstatus">Your opponent disconnected. The room stays active, so they can reconnect from the same link.</p>
                      )}
                      {mode === "friend" && roomConnectionState === "error" && (
                        <p className="gameSubstatus">The room connection needs attention. Refresh or rejoin once your session is stable.</p>
                      )}
                      {mode === "friend" && roomConnectionState === "ready" && !gamePresentation.finished && (
                        <p className="gameSubstatus">Live room connected. Moves, clocks, and status will stay in sync for both players.</p>
                      )}
                      {mode !== "friend" && !aiThinking && !gamePresentation.finished && gamePresentation.reason !== "check" && (
                        <p className="gameSubstatus">Use the board, clocks, and move list without the layout shifting when the position gets sharp.</p>
                      )}
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
                    {board.map(({ square, piece }, index) => {
                      const isLight = (Math.floor(index / 8) + index) % 2 === 0;
                      const isSelected = selected === square;
                      const isTarget = legalTargets.includes(square);
                      const isCheckedKing = checkedKingSquare === square;
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
                            isCheckedKing ? "checkedKing" : "",
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
                    <button className="ghostButton" onClick={restartCurrentGame} disabled={roomBusy}>{mode === "friend" ? "Rematch room" : "Rematch"}</button>
                    {isGameFinished && (
                      <button className="primaryButton" onClick={analyzeNow} disabled={stockfishBusy}>
                        <Brain size={16} />
                        {analysisPending || stockfishBusy ? "Opening analysis..." : "Analyze with Coach"}
                      </button>
                    )}
                  </div>

                  {isGameFinished && (
                    <div className="gameResultCard">
                      <span className="eyebrow">{gamePresentation.reason === "checkmate" ? "Game Over" : gamePresentation.headline}</span>
                      <h3>{gamePresentation.reason === "checkmate" ? `Checkmate — ${gamePresentation.winner === "white" ? "White" : "Black"} wins` : `${gamePresentation.headline} — ${gamePresentation.detail}`}</h3>
                      <p>The board is now locked, the clocks are stopped, and you can either review the game or start a fresh one.</p>
                      <div className="gameResultActions">
                        <button className="primaryButton" onClick={analyzeNow} disabled={analysisPending || stockfishBusy}>
                          <Brain size={16} />
                          {analysisPending || stockfishBusy ? "Analyzing..." : "Analyze with Coach"}
                        </button>
                        <button className="ghostButton" onClick={restartCurrentGame} disabled={roomBusy}>
                          <RefreshCcw size={16} />
                          Rematch
                        </button>
                        <button className="ghostButton" onClick={backToLobby}>
                          <Menu size={16} />
                          Back to lobby
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <aside className="gameSideRail">
                  <div className="roomCard">
                    <div className="panelTitle">
                      <Users size={19} />
                      <h3>Game info</h3>
                    </div>
                    <p>{getModeLabel(mode)} · {getTimeControlTitle(mode === "friend" && roomState ? roomState.timeControl : selectedTimeControl)}</p>
                    <div className="gameMeta">
                      <span>Status</span>
                      <strong>{gamePresentation.headline} · {gamePresentation.detail}</strong>
                    </div>
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
                    {!roomId && isGameFinished && (
                      <button className="wideButton" onClick={analyzeNow} disabled={stockfishBusy}>
                        <Brain size={16} />
                        {stockfishBusy ? "Preparing analysis..." : "Analyze with Coach"}
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

                  {showGameAnalysis && (
                    <div className="coachCard gameCoachCard">
                      <div className="panelTitle">
                        <Brain size={19} />
                        <h3>Post-game analysis</h3>
                      </div>
                      <p>{stockfishBusy ? "Analyzing the finished game..." : "Coach feedback is available only after the result."}</p>
                      <div className="coachActions">
                        <button className="ghostButton" onClick={analyzeNow}>{stockfishBusy ? "Analyzing..." : "Analyze again"}</button>
                        <button className="ghostButton" onClick={() => setCoachMode("beginner")}>Explain simpler</button>
                        <button className="ghostButton" onClick={() => setToast(coachReport[0]?.text || getCoachEmptyText(history))}>Training tip</button>
                      </div>
                      <div className="coachBulletPanel">
                        <div>
                          <span>Best move</span>
                          <strong>{stockfishAnalysis?.bestMove || (findBestMove(game)?.san ?? "Fallback review ready")}</strong>
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
                          <p>{coachReport.find((item) => item.tone === "warning")?.text || "No immediate tactical warning. Review checks, captures, and king safety in the critical moment."}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </aside>
              </div>

              {isGameFinished && (
                <div className="gameResources">
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
                  <div className="roomCard">
                    <div className="panelTitle">
                      <History size={18} />
                      <h3>What to do next</h3>
                    </div>
                    <p>Save the game, open Coach analysis, and compare the critical moment with one recommended book chapter before your next session.</p>
                    <div className="recentGames">
                      {savedGames.slice(0, 2).map((savedGame) => (
                        <div key={`post-${savedGame.id}`} className="recentGameRow">
                          <strong>{savedGame.result}</strong>
                          <span>{savedGame.mode} · {savedGame.moves.length} moves</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {view === "analysis" && (
            <section className="dashboardView analysisPage">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">Game analysis</span>
                  <h2>{selectedAnalysisGame ? `Review ${selectedAnalysisGame.result}` : "Saved game review"}</h2>
                  <p className="sectionLead">
                    Step through a finished game move by move. Coach comments update per move and never interrupt live play.
                  </p>
                </div>
                <div className="headerActions">
                  <button className="ghostButton" onClick={() => setView("history")}>
                    <History size={16} />
                    Back to history
                  </button>
                  {selectedAnalysisGame && (
                    <button className="ghostButton" onClick={() => openSavedGameView(selectedAnalysisGame)}>
                      <Play size={16} />
                      View board
                    </button>
                  )}
                </div>
              </div>

              {!selectedAnalysisGame || !analysisReplay ? (
                <div className="emptyState">Choose a saved game from History to open analysis.</div>
              ) : (
                <>
                  <div className="analysisLayout">
                    <section className="analysisBoardShell">
                      <div className="analysisStatusBar">
                        <div>
                          <span className="eyebrow">{selectedAnalysisGame.mode} · {selectedAnalysisGame.timeControl || "Saved game"}</span>
                          <strong>{selectedAnalysisGame.opponent || "Training opponent"}</strong>
                        </div>
                        <div className="analysisMiniStats">
                          <span>Move {Math.min(clampAnalysisIndex(analysisReplay.positions.length, analysisMoveIndex), analysisTimelineMoves.length)} / {analysisTimelineMoves.length}</span>
                          <span>{selectedAnalysis?.summary.accuracy ? `${selectedAnalysis.summary.accuracy}% accuracy` : analysisPending ? "Analyzing..." : "Review pending"}</span>
                        </div>
                      </div>

                      <div className="analysisBoardStage">
                        <div className="board" aria-label="Analysis chess board">
                          {analysisBoard.map(({ square, piece }, index) => {
                            const isLight = (Math.floor(index / 8) + index) % 2 === 0;
                            const currentMove = analysisMoveIndex > 0 ? analysisTimelineMoves[analysisMoveIndex - 1] : null;
                            const isHighlighted = currentMove ? currentMove.from === square || currentMove.to === square : false;
                            return (
                              <div
                                key={`analysis-${square}`}
                                className={[
                                  "square",
                                  isLight ? "lightSquare" : "darkSquare",
                                  isHighlighted ? "analysisHighlight" : "",
                                ].join(" ")}
                              >
                                <span className={piece ? `piece ${piece.color}` : "piece"}>
                                  {piece ? pieceIcons[`${piece.color}${piece.type}`] : ""}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="analysisControls">
                        <button type="button" className="ghostButton" onClick={() => moveAnalysisTo(0)} disabled={analysisMoveIndex === 0}>
                          Jump to start
                        </button>
                        <button type="button" className="ghostButton" onClick={() => stepAnalysis(-1)} disabled={analysisMoveIndex === 0}>
                          <ChevronLeft size={16} />
                          Previous
                        </button>
                        <button type="button" className="ghostButton" onClick={() => stepAnalysis(1)} disabled={analysisMoveIndex >= maxAnalysisIndex}>
                          Next
                          <ChevronRight size={16} />
                        </button>
                        <button type="button" className="ghostButton" onClick={() => moveAnalysisTo(maxAnalysisIndex)} disabled={analysisMoveIndex >= maxAnalysisIndex}>
                          Jump to end
                        </button>
                      </div>
                    </section>

                    <aside className="analysisSideRail">
                      <div className="movesCard">
                        <div className="panelTitle">
                          <History size={19} />
                          <h3>Move list</h3>
                        </div>
                        <div className="analysisMoveList">
                          {analysisTimelineMoves.length === 0 ? (
                            <div className="emptyState compactEmpty">No replayable moves were found for this saved game yet.</div>
                          ) : analysisTimelineMoves.map((move, index) => (
                            <button
                              type="button"
                              key={`analysis-move-${index}-${move.san}`}
                              className={analysisMoveIndex === index + 1 ? "analysisMoveButton activeAnalysisMove" : "analysisMoveButton"}
                              onClick={() => moveAnalysisTo(index + 1)}
                            >
                              <span>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}.` : "..."}</span>
                              <strong>{move.san}</strong>
                              <small>{selectedAnalysis?.moveReviews[index]?.quality || "pending"}</small>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="coachCard analysisCoachCard">
                        <div className="panelTitle">
                          <Brain size={19} />
                          <h3>Coach review</h3>
                        </div>
                        <div className="coachModes">
                          {(["beginner", "intermediate", "advanced"] as CoachMode[]).map((modeName) => (
                            <button
                              key={`analysis-${modeName}`}
                              className={coachMode === modeName ? "activeCoachMode" : ""}
                              onClick={() => setCoachMode(modeName)}
                            >
                              {modeName}
                            </button>
                          ))}
                        </div>
                        {analysisPending ? (
                          <p>Analyzing the saved game move by move...</p>
                        ) : analysisError ? (
                          <div className="coachErrorCard">
                            <p>{analysisError}</p>
                            <button className="ghostButton" onClick={() => void analyzeSavedGame(selectedAnalysisGame)}>
                              Analyze again
                            </button>
                          </div>
                        ) : currentAnalysisReview ? (
                          <div className="coachBulletPanel">
                            <div>
                              <span>Move review</span>
                              <strong>{currentAnalysisReview.quality} · {currentAnalysisReview.san}</strong>
                            </div>
                            <div>
                              <span>Best move</span>
                              <strong>{currentAnalysisReview.bestMove}</strong>
                            </div>
                            <div>
                              <span>Evaluation</span>
                              <strong>{currentAnalysisReview.evaluation}</strong>
                            </div>
                            <div>
                              <span>Why it matters</span>
                              <p>{explainSavedReview(currentAnalysisReview, coachMode)}</p>
                            </div>
                            <div>
                              <span>Danger missed</span>
                              <p>{currentAnalysisReview.danger}</p>
                            </div>
                            <div>
                              <span>Principle</span>
                              <p>{currentAnalysisReview.principle}</p>
                            </div>
                            <div>
                              <span>Training tip</span>
                              <p>{getSavedReviewTrainingTip(currentAnalysisReview, coachMode)}</p>
                            </div>
                          </div>
                        ) : (
                          <p>Step to a move to see the coach comment for that moment.</p>
                        )}
                      </div>
                    </aside>
                  </div>

                  {selectedAnalysis && (
                    <section className="trainingPlan compactTrainingPlan">
                      <div className="trainingHeader">
                        <div>
                          <span className="eyebrow">Final summary</span>
                          <h3>{selectedAnalysis.summary.accuracy}% accuracy estimate</h3>
                          <p>{selectedAnalysis.summary.biggestMistake}</p>
                        </div>
                        <div className="planBadge">
                          <Brain size={18} />
                          {selectedAnalysis.summary.bestMove}
                        </div>
                      </div>
                      <div className="insightGrid">
                        <article className="insightCard warning">
                          <h3>Opening advice</h3>
                          <p>{selectedAnalysis.summary.openingAdvice}</p>
                        </article>
                        <article className="insightCard pro">
                          <h3>Middlegame advice</h3>
                          <p>{selectedAnalysis.summary.middlegameAdvice}</p>
                        </article>
                        <article className="insightCard good">
                          <h3>Endgame advice</h3>
                          <p>{selectedAnalysis.summary.endgameAdvice}</p>
                        </article>
                        <article className="insightCard pro">
                          <h3>Training recommendations</h3>
                          <p>{selectedAnalysis.summary.training.join(" · ")}</p>
                        </article>
                      </div>
                    </section>
                  )}

                  <div className="gameResources">
                    <div className="booksGrid compactBooksGrid">
                      {chessBooks.slice(0, 3).map((book) => (
                        <article className="bookCard" key={`analysis-${book.title}`}>
                          <span>{book.tag}</span>
                          <h3>{book.title}</h3>
                          <strong>{book.author}</strong>
                          <p>{book.reason}</p>
                          <small>{book.level}</small>
                        </article>
                      ))}
                    </div>
                    <div className="roomCard">
                      <div className="panelTitle">
                        <BookOpen size={18} />
                        <h3>Recommended study plan</h3>
                      </div>
                      <p>10 min tactics · 10 min endgames · 15 min saved-game analysis · 1 rapid game with review.</p>
                      <div className="recentGames">
                        <div className="recentGameRow"><strong>Opening</strong><span>Review development and early queen moves</span></div>
                        <div className="recentGameRow"><strong>Middlegame</strong><span>Scan checks, captures, and loose pieces before each decision</span></div>
                        <div className="recentGameRow"><strong>Endgame</strong><span>Centralize the king and simplify only when it helps conversion</span></div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          {view === "puzzles" && (
            <section className="dashboardView">
              <div className="sectionHeader">
                <div>
                  <span className="eyebrow">Tactics gym</span>
                  <h2>Daily puzzle set</h2>
                  <p className="sectionLead">
                    {solvedFilteredPuzzleCount}/{filteredPuzzleCount || puzzleSet.length} {getPuzzleDifficultyLabel(puzzleDifficulty).toLowerCase()} puzzles solved. Pick a puzzle, solve it on the board, and Chess Master will queue the next one automatically.
                  </p>
                </div>
                <div className="headerActions">
                  <button className="ghostButton" onClick={moveToPreviousPuzzle} disabled={puzzleHistoryIndex === 0}>
                    <ChevronLeft size={16} />
                    Previous
                  </button>
                  <button className="primaryButton" onClick={() => moveToNextPuzzle()}>
                    <Zap size={16} />
                    Next puzzle
                  </button>
                </div>
              </div>
              <div className="puzzleControlBar">
                <div className="difficultyTabs" role="tablist" aria-label="Puzzle difficulty">
                  {(["easy", "medium", "hard"] as PuzzleDifficulty[]).map((difficulty) => (
                    <button
                      key={difficulty}
                      className={puzzleDifficulty === difficulty ? "difficultyTab activeDifficultyTab" : "difficultyTab"}
                      onClick={() => setPuzzleDifficulty(difficulty)}
                      type="button"
                    >
                      {getPuzzleDifficultyLabel(difficulty)}
                    </button>
                  ))}
                </div>
                <div className="puzzleMeta">
                  <span>{selectedPuzzle.theme}</span>
                  <span>{selectedPuzzle.rating}</span>
                  <span>{getPuzzleDifficultyLabel(getPuzzleDifficulty(selectedPuzzle))}</span>
                </div>
              </div>
              <div className="puzzleTrainer">
                <div>
                  <span className="eyebrow">{getSelectedPuzzleHeader(selectedPuzzleIndex, puzzleSolved, puzzleSet)}</span>
                  <h3>{getPuzzleStatus(puzzleGame, isPuzzleSolved(puzzleSolved, selectedPuzzle))}</h3>
                  <p>{puzzleMessage}</p>
                  <div className="puzzleActions">
                    <button className="ghostButton" onClick={requestPuzzleHint}>Hint</button>
                    <button className="ghostButton" onClick={resetPuzzle}>Reset puzzle</button>
                    <button className="ghostButton" onClick={replayPuzzleSolution}>Solution replay</button>
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
                {filteredPuzzleEntries.map(({ puzzle, index }) => (
                  <article className={selectedPuzzleIndex === index ? "puzzleCard selectedPuzzleCard" : "puzzleCard"} key={puzzle.title}>
                    <div className="puzzleBoard">
                      {fenPreview(puzzle.fen).map((piece, index) => (
                        <span key={`${puzzle.title}-${index}`} className={(Math.floor(index / 8) + index) % 2 === 0 ? "previewLight" : "previewDark"}>
                          {piece}
                        </span>
                      ))}
                    </div>
                    <div>
                      <span>{puzzle.theme} · {puzzle.rating} · {getPuzzleDifficultyLabel(getPuzzleDifficulty(puzzle))}</span>
                      <h3>{puzzle.title}</h3>
                      <p>{puzzle.goal}</p>
                    </div>
                    <button className="wideButton" onClick={() => selectPuzzle(index)}>
                      {getPuzzleButtonLabel(selectedPuzzleIndex === index, isPuzzleSolved(puzzleSolved, puzzle))}
                    </button>
                  </article>
                ))}
              </div>
              <div className="booksGrid">
                {chessBooks.slice(0, 3).map((book) => (
                  <article className="bookCard" key={`puzzle-${book.title}`}>
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
                  <p className="sectionLead">Open a saved game, step through it, and launch a full coach review without interrupting live play.</p>
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
                      <div className="savedGameMain">
                        <strong>{savedGame.result}</strong>
                        <span>{formatDate(savedGame.date)} · {savedGame.mode === "ai" ? "AI game" : savedGame.mode === "friend" ? "Friend room" : "One-device"} · {savedGame.city}</span>
                        <small>{savedGame.opponent || "Training opponent"} · {savedGame.timeControl || "Saved game"} · {savedGame.moves.length} moves</small>
                      </div>
                      <div className="savedMeta savedMetaStack">
                        <span>{getHistoryScoreLabel(savedGame.reviewScore)}</span>
                        <span>{savedGame.status || "Saved"}</span>
                      </div>
                      <div className="savedActions">
                        <button className="ghostButton" onClick={() => openSavedGameView(savedGame)}>
                          View game
                        </button>
                        <button className="primaryButton" onClick={() => void analyzeSavedGame(savedGame)}>
                          <Brain size={16} />
                          Analyze with Coach
                        </button>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <section className="trainingPlan compactTrainingPlan">
                <div className="trainingHeader">
                  <div>
                    <span className="eyebrow">Recommended study plan</span>
                    <h3>Turn every saved game into the next lesson</h3>
                    <p>Use your archive as the center of improvement: tactics, endgames, one review block, and one practical game.</p>
                  </div>
                </div>
                <div className="missionGrid">
                  {[
                    { title: "10 min tactics", text: "Solve checks, forks, and hanging-piece puzzles before opening your saved game." },
                    { title: "10 min endgames", text: "Practice king activity and simple pawn endings after your tactical warm-up." },
                    { title: "15 min analysis", text: "Open one saved game and compare your move with the best practical continuation." },
                    { title: "1 rapid game", text: "Play one fresh rapid game and save it for the next review cycle." },
                  ].map((item) => (
                    <article className="missionCard" key={item.title}>
                      <div className="missionIcon">
                        <BookOpen size={22} />
                      </div>
                      <div>
                        <h4>{item.title}</h4>
                        <p>{item.text}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
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

        {view !== "game" && view !== "analysis" && <aside className="rightRail">
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
                  <LegendPortrait image={legend.image} name={legend.name} />
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
        </aside>}
      </section>
      )}

      <div className="globalToast" role="status" aria-live="polite">
        {toast}
      </div>

      {pendingPromotion && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <section className="quizModal promotionModal">
            <div>
              <span className="eyebrow">Promotion</span>
              <h2>Choose a piece</h2>
              <p>{pendingPromotion.color === "white" ? "White" : "Black"} reached the last rank. Pick the piece before the move is completed.</p>
            </div>
            <div className="promotionGrid">
              {([
                { id: "q", label: "Queen", icon: pendingPromotion.color === "white" ? "♕" : "♛" },
                { id: "r", label: "Rook", icon: pendingPromotion.color === "white" ? "♖" : "♜" },
                { id: "b", label: "Bishop", icon: pendingPromotion.color === "white" ? "♗" : "♝" },
                { id: "n", label: "Knight", icon: pendingPromotion.color === "white" ? "♘" : "♞" },
              ] as Array<{ id: PromotionChoice; label: string; icon: string }>).map((option) => (
                <button
                  key={option.id}
                  className="promotionOption"
                  type="button"
                  onClick={() => completeMove(pendingPromotion.from, pendingPromotion.to, option.id)}
                >
                  <span>{option.icon}</span>
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </section>
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
    </AppErrorBoundary>
  );
}
