import { Document } from 'mongoose';

export interface IRefreshTokenFamily {
  familyId: string;
  tokenHash: string;
  usedHashes: string[];
  expiresAt: Date;
  createdAt: Date;
}

export interface IUser {
  email?: string;
  passwordHash?: string;
  refreshTokenHash?: string;
  refreshTokenFamilies?: IRefreshTokenFamily[];
  username: string;
  displayName: string;
  avatar: string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  totalCorrect: number;
  totalQuestions: number;
  accuracy: number;
  currentStreak?: number;
  highestWinStreak?: number;
  isGuest?: boolean;
  role?: 'user' | 'guest' | 'admin';
  googleId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type IUserDocument = IUser & Document;

export interface ILeaderboardEntry {
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

export interface ILeaderboardResponse {
  leaderboard: ILeaderboardEntry[];
  total: number;
  page: number;
  limit: number;
  currentUserRank?: ILeaderboardEntry | null;
}

export interface IPublicUserProfile {
  userId: string;
  username: string;
  displayName: string;
  avatar: string;
  joinedAt: Date | string;
  rank: number;
  quizzesPlayed: number;
  avgScore: number;
  bestScore: number;
  bestRank: number;
  totalCorrect: number;
  totalQuestions: number;
  accuracy: number;
  // Legacy fields for backward compatibility
  battlesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak?: number;
  highestWinStreak?: number;
  isCurrentUser: boolean;
  recentBattles: Array<{
    _id: string;
    roomCode: string;
    topic: string;
    difficulty: string;
    questionCount: number;
    startedAt: Date | string;
    endedAt?: Date | string;
    duration: number;
    userRank?: number;
    totalPlayers?: number;
    userAccuracy?: number;
    userScore: number;
    opponentScore: number;
    result: 'VICTORY' | 'DEFEAT' | 'DRAW' | 'COMPLETED';
    opponent: {
      userId: string;
      username: string;
      displayName: string;
      avatar: string;
    } | null;
    players?: Array<{
      userId: string;
      username: string;
      displayName: string;
      avatar: string;
      score: number;
      rank: number;
    }>;
  }>;
}
