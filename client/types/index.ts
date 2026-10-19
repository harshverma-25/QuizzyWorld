export interface User {
  _id: string;
  id?: string;
  username: string;
  displayName: string;
  email?: string;
  avatar: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  highestWinStreak: number;
  isGuest?: boolean;
  role?: string;
  createdAt: string;
  updatedAt: string;
}


export interface RoomPlayer {
  user: {
    _id: string;
    username: string;
    displayName: string;
    avatar: string;
  } | null;
  isHost: boolean;
  isReady: boolean;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  questionCount: number;
  playedCount?: number;
  availableLengths?: number[];
  isPlayable?: boolean;
}

export interface Subject {
  id: string;
  name: string;
  slug: string;
  description?: string;
  categoryId: string;
  isActive: boolean;
  questionCount: number;
  playedCount?: number;
  availableLengths?: number[];
  isPlayable?: boolean;
  thumbnailUrl?: string;
  rating?: number;
  creator?: string;
  isUserCreated?: boolean;
  shareId?: string;
}

export interface PopularQuiz {
  id: string;
  rank: number;
  title: string;
  description: string;
  categorySlug: string;
  subjectSlug?: string | null;
  isMixedCategory: boolean;
  icon?: string;
  questionCount: number;
  playedCount: number;
  thumbnailUrl?: string;
  rating?: number;
  creator?: string;
}

export interface RoomSettings {
  topic?: string;
  difficulty?: string;
  questionCount?: number;
  categoryId?: string;
  subjectId?: string | null;
  isMixedCategory?: boolean;
  timeLimit?: number;
}

export type RoomStatusType =
  | "WAITING"
  | "READY"
  | "IN_PROGRESS"
  | "FINISHED"
  | "CANCELLED"
  | "waiting"
  | "full"
  | "starting"
  | "active"
  | "finished";

export interface Room {
  roomCode: string;
  host: {
    _id: string;
    username: string;
    displayName: string;
    avatar: string;
  } | null;
  hostId?: string;
  players: RoomPlayer[];
  settings: RoomSettings;
  topic: string;
  difficulty: string;
  questionCount?: number;
  status: RoomStatusType;
}


// ------------------------------
// MCQ Battle Types
// ------------------------------

export interface BattleQuestion {
  _id?: string;
  questionId: string;
  topic: string;
  difficulty: string;
  question: string;
  options: string[]; // exactly 4 options
}

export interface BattlePlayer {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  currentQuestionIndex: number;
  score: number;
  isCompleted: boolean;
  isHost?: boolean;
}

export interface BattleInitPayload {
  battleId: string;
  roomCode: string;
  hostId?: string;
  topic: string;
  difficulty: string;
  questionCount: number;
  timePerQuestion: number;
  currentQuestionIndex: number;
  roundStartedAt?: number;
  questionDeadline: string | Date | null;
  currentQuestion: BattleQuestion | null;
  players: (BattlePlayer & { hasAnswered?: boolean })[];
}

export interface BattleNextQuestionPayload {
  currentQuestionIndex: number;
  totalQuestions: number;
  roundStartedAt?: number;
  questionDeadline: string | Date | null;
  timePerQuestion: number;
  question: BattleQuestion | null;
  completed: boolean;
}

export interface BattleOpponentProgressPayload {
  userId: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  isCompleted: boolean;
  score: number;
}

export interface BattlePlayerSubmittedPayload {
  userId: string;
  roundIndex: number;
  hasAnswered: boolean;
  timeTakenMs: number;
}

export interface BattleAnswerLockedPayload {
  selectedOption: number;
  potentialScore: number;
  timeTakenMs: number;
}

export interface BattleRevealPlayer {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  selectedOption: number;
  isCorrect: boolean;
  earnedScore: number;
  totalScore: number;
  timeTakenMs: number;
}

export interface BattleRevealPayload {
  roundIndex: number;
  questionId: string;
  correctAnswer: number;
  explanation: string;
  accuracyPct: number;
  correctCount: number;
  totalPlayers: number;
  revealDurationSec: number;
  players: BattleRevealPlayer[];
  isLastQuestion: boolean;
}

export interface BattleResultsPlayer {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  score: number;
  totalQuestions: number;
  answers?: Array<{
    questionId: string;
    selectedOption: number;
    isCorrect: boolean;
    timeTakenMs: number;
  }>;
}

export interface BattleResultsPayload {
  battleId: string;
  roomCode: string;
  topic: string;
  difficulty: string;
  status: string;
  winnerId: string | null;
  isDraw: boolean;
  startedAt: string | Date;
  endedAt: string | Date;
  players: BattleResultsPlayer[];
}

export interface BattleResultQuestion {
  questionId: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  selectedOption: number;
  isCorrect: boolean;
  timeTakenMs: number;
  isUnanswered: boolean;
}

export interface BattleResultPlayerDetails {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  score: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  isWinner: boolean;
  isDraw: boolean;
  questions: BattleResultQuestion[];
}

export interface BattleResultDetails {
  battleId: string;
  roomCode: string;
  hostId?: string;
  topic: string;
  difficulty: string;
  questionCount: number;
  timePerQuestion: number;
  status: string;
  winnerId: string | null;
  isDraw: boolean;
  startedAt: string;
  endedAt?: string;
  duration: number; // in seconds
  categoryId?: string;
  subjectId?: string | null;
  isMixedCategory?: boolean;
  rankings?: Array<{
    userId: string;
    username: string;
    displayName: string;
    avatar: string;
    totalScore: number;
    rank: number;
    correctAnswers: number;
    incorrectAnswers: number;
    unanswered: number;
    accuracy: number;
  }>;
  userRank?: number;
  totalPlayers?: number;
  players: BattleResultPlayerDetails[];
  userPlayer: BattleResultPlayerDetails;
  opponentPlayer: BattleResultPlayerDetails | null;
  result: "VICTORY" | "DEFEAT" | "DRAW" | "IN_PROGRESS" | "CANCELLED" | "COMPLETED";
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  wins: number;
  losses: number;
  draws: number;
  battlesPlayed: number;
  totalCorrect: number;
  totalQuestions: number;
  accuracy: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
  currentUserRank?: LeaderboardEntry | null;
}

export interface PublicUserProfile {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  joinedAt: string;
  rank: number;
  battlesPlayed: number;
  quizzesPlayed?: number;
  avgScore?: number;
  bestScore?: number;
  bestRank?: number;
  wins: number;
  losses: number;
  draws: number;
  totalCorrect: number;
  totalQuestions: number;
  accuracy: number;
  isCurrentUser: boolean;
  recentBattles: Array<{
    _id: string;
    roomCode: string;
    topic: string;
    difficulty: string;
    questionCount: number;
    startedAt: string;
    endedAt?: string;
    duration: number;
    userScore: number;
    opponentScore: number;
    userRank?: number;
    totalPlayers?: number;
    userAccuracy?: number;
    result: "VICTORY" | "DEFEAT" | "DRAW" | "COMPLETED";
    players?: Array<{
      userId: string;
      username: string;
      displayName: string;
      avatar: string;
      score: number;
      rank?: number;
    }>;
    opponent: {
      userId: string;
      username: string;
      displayName: string;
      avatar: string;
    } | null;
  }>;
}

// ------------------------------
// Admin Module Types
// ------------------------------

export interface AdminOverviewStats {
  metrics: {
    totalCategories: number;
    activeCategories: number;
    totalSubjects: number;
    activeSubjects: number;
    totalQuestions: number;
    publishedQuestions: number;
    totalUsers: number;
    totalAdmins: number;
    totalImports: number;
  };
  categoryBreakdown: Array<{
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    icon: string;
    subjectCount: number;
    questionCount: number;
  }>;
  recentImports: ImportHistoryItem[];
}

export interface AdminSubjectItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  thumbnailUrl?: string;
  isActive: boolean;
  questionCount: number;
}

export interface AdminCategoryTreeItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  isActive: boolean;
  questionCount: number;
  subjects: AdminSubjectItem[];
}

export interface AdminQuestionItem {
  id: string;
  questionId: string;
  question: string;
  options: string[];
  correctAnswer: number;
  difficulty: string;
  explanation: string;
  isPublished: boolean;
  createdAt?: string;
}

export interface ImportRowError {
  row: number;
  externalId?: string;
  question?: string;
  reason: string;
}

export interface ImportPreviewResponse {
  destination: {
    categoryId: string;
    categoryName: string;
    subjectId: string;
    subjectName: string;
  };
  fileSummary: {
    fileName: string;
    fileSize: number;
    totalQuestionsInFile: number;
    validCount: number;
    invalidCount: number;
    existingDuplicatesCount: number;
    inBatchDuplicatesCount: number;
    difficultyCounts: {
      easy: number;
      medium: number;
      hard: number;
    };
  };
  previewRows: Array<{
    row: number;
    questionId: string;
    question: string;
    options: string[];
    correctAnswer: number;
    difficulty: string;
    isExistingDuplicate: boolean;
  }>;
  errors: ImportRowError[];
}

export interface ImportExecuteResponse {
  importId: string;
  summary: {
    totalInFile: number;
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
    failedCount: number;
    status: 'completed' | 'partial' | 'failed';
  };
  historyId: string;
  errors: ImportRowError[];
}

export interface ImportHistoryItem {
  _id: string;
  importId: string;
  fileName: string;
  fileSize: number;
  categoryId: string;
  categoryName: string;
  subjectId: string;
  subjectName: string;
  adminId: string;
  adminUsername: string;
  totalQuestions: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  failedCount: number;
  duplicateStrategy: 'skip' | 'update';
  status: 'completed' | 'partial' | 'failed';
  validationErrors: ImportRowError[];
  createdAt: string;
  updatedAt: string;
}
