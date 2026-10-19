import { UserModel } from './user.model.js';
import { IUser, IUserDocument } from './user.types.js';

export class UserRepository {
  // Short-lived bounded in-memory cache for high-frequency token authentication (15s TTL, max 1000 users)
  private userCache = new Map<string, { user: IUserDocument; expiresAt: number }>();
  private readonly CACHE_TTL_MS = 15 * 1000;
  private readonly MAX_CACHE_ENTRIES = 1000;

  public invalidate(userId: string): void {
    this.userCache.delete(userId);
  }

  public clearAllCache(): void {
    this.userCache.clear();
  }

  async findById(userId: string): Promise<IUserDocument | null> {
    const cached = this.userCache.get(userId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.user;
    }

    const user = await UserModel.findById(userId);
    if (user) {
      if (this.userCache.size >= this.MAX_CACHE_ENTRIES) {
        const oldestKey = this.userCache.keys().next().value;
        if (oldestKey) this.userCache.delete(oldestKey);
      }
      this.userCache.set(userId, { user, expiresAt: Date.now() + this.CACHE_TTL_MS });
    }
    return user;
  }

  async findByEmail(email: string): Promise<IUserDocument | null> {
    return UserModel.findOne({ email });
  }

  async findByGoogleId(googleId: string): Promise<IUserDocument | null> {
    return UserModel.findOne({ googleId });
  }

  async findByUsernameOrEmail(identifier: string): Promise<IUserDocument | null> {
    return UserModel.findOne({
      $or: [{ email: identifier }, { username: identifier }],
    }).select('+passwordHash');
  }

  async findByIdWithRefreshToken(userId: string): Promise<IUserDocument | null> {
    return UserModel.findById(userId).select('+refreshTokenHash +refreshTokenFamilies');
  }

  async updateRefreshToken(userId: string, refreshTokenHash: string): Promise<void> {
    this.invalidate(userId);
    await UserModel.findByIdAndUpdate(userId, { refreshTokenHash });
  }

  async clearRefreshToken(userId: string): Promise<void> {
    this.invalidate(userId);
    await UserModel.findByIdAndUpdate(userId, {
      $unset: { refreshTokenHash: 1 },
      $set: { refreshTokenFamilies: [] },
    });
  }

  async clearRefreshTokenFamily(userId: string, familyId: string): Promise<void> {
    this.invalidate(userId);
    await UserModel.findByIdAndUpdate(userId, {
      $pull: { refreshTokenFamilies: { familyId } },
    });
  }

  async updateById(userId: string, updateData: Partial<IUser>): Promise<IUserDocument | null> {
    this.invalidate(userId);
    return UserModel.findByIdAndUpdate(userId, updateData, { new: true });
  }

  async countHigherRankedUsers(criteria: { wins: number; accuracy: number; matchesPlayed: number; username: string }): Promise<number> {
    return UserModel.countDocuments({
      isGuest: false,
      $or: [
        { wins: { $gt: criteria.wins } },
        { wins: criteria.wins, accuracy: { $gt: criteria.accuracy } },
        { wins: criteria.wins, accuracy: criteria.accuracy, matchesPlayed: { $gt: criteria.matchesPlayed } },
        { wins: criteria.wins, accuracy: criteria.accuracy, matchesPlayed: criteria.matchesPlayed, username: { $lt: criteria.username } },
      ],
    });
  }

  async findLeaderboard(options: { skip: number; limit: number }): Promise<{ users: IUserDocument[]; total: number }> {
    const filter = { isGuest: false };
    const [total, users] = await Promise.all([
      UserModel.countDocuments(filter),
      UserModel.find(filter)
        .sort({ wins: -1, accuracy: -1, matchesPlayed: -1, username: 1 })
        .skip(options.skip)
        .limit(options.limit)
        .lean()
        .exec(),
    ]);
    return { users: users as any, total };
  }

  async findByUsername(username: string): Promise<IUserDocument | null> {
    return UserModel.findOne({ username });
  }

  async create(userData: Partial<IUser>): Promise<IUserDocument> {
    const user = new UserModel(userData);
    return user.save();
  }

  async incrementStatsById(
    userId: string,
    stats: { matchesPlayed?: number; wins?: number; losses?: number; draws?: number }
  ): Promise<IUserDocument | null> {
    const update: any = { $inc: {} };
    if (stats.matchesPlayed) update.$inc.matchesPlayed = stats.matchesPlayed;
    if (stats.wins) update.$inc.wins = stats.wins;
    if (stats.losses) update.$inc.losses = stats.losses;
    if (stats.draws) update.$inc.draws = stats.draws;

    return UserModel.findByIdAndUpdate(userId, update, { new: true });
  }

  async recordBattleStatsById(
    userId: any,
    stats: { isWin: boolean; isLoss: boolean; isDraw: boolean; correctCount: number; questionCount: number }
  ): Promise<void> {
    await UserModel.updateOne(
      { _id: userId },
      [
        {
          $set: {
            matchesPlayed: { $add: [{ $ifNull: ['$matchesPlayed', 0] }, 1] },
            wins: { $add: [{ $ifNull: ['$wins', 0] }, stats.isWin ? 1 : 0] },
            losses: { $add: [{ $ifNull: ['$losses', 0] }, stats.isLoss ? 1 : 0] },
            draws: { $add: [{ $ifNull: ['$draws', 0] }, stats.isDraw ? 1 : 0] },
            totalCorrect: { $add: [{ $ifNull: ['$totalCorrect', 0] }, stats.correctCount] },
            totalQuestions: { $add: [{ $ifNull: ['$totalQuestions', 0] }, stats.questionCount] },
            currentStreak: stats.isWin
              ? { $add: [{ $ifNull: ['$currentStreak', 0] }, 1] }
              : 0,
          },
        },
        {
          $set: {
            highestWinStreak: {
              $max: [
                { $ifNull: ['$highestWinStreak', 0] },
                { $ifNull: ['$currentStreak', 0] },
              ],
            },
            accuracy: {
              $cond: [
                { $gt: ['$totalQuestions', 0] },
                {
                  $min: [
                    100,
                    {
                      $max: [
                        0,
                        { $round: [{ $multiply: [{ $divide: ['$totalCorrect', '$totalQuestions'] }, 100] }, 0] },
                      ],
                    },
                  ],
                },
                0,
              ],
            },
          },
        },
      ]
    );
  }
}

export const userRepository = new UserRepository();
