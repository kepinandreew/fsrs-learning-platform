import { describe, expect, it } from 'vitest';
import { rankLeaderboardUsers } from '../../src/modules/progress/progress.service';

describe('Progress Leaderboard Aggregation', () => {
  it('mengurutkan pemain berdasarkan poin tertinggi dan mencegah duplikasi poin lintas deck', () => {
    const res = rankLeaderboardUsers(
      [
        {
          externalId: 'siswa_01',
          displayName: 'Siswa 01',
          progresses: [
            {
              points: 650,
              exp: 500,
              level: 2,
              currentStreak: 2,
              longestStreak: 3,
              totalReviews: 10,
              totalQuizzes: 5,
              correctAnswers: 4,
              wrongAnswers: 1,
              clientState: { wins: 4, petName: 'Pyromon' },
              updatedAt: new Date('2026-11-05T10:00:00Z'),
            },
            {
              points: 300,
              exp: 220,
              level: 1,
              currentStreak: 1,
              longestStreak: 1,
              totalReviews: 8,
              totalQuizzes: 5,
              correctAnswers: 4,
              wrongAnswers: 1,
              clientState: { wins: 2, petName: 'Pyromon' },
              updatedAt: new Date('2026-11-04T10:00:00Z'),
            },
          ],
        },
        {
          externalId: 'siswa_02',
          displayName: 'Siswa 02',
          progresses: [
            {
              points: 920,
              exp: 840,
              level: 3,
              currentStreak: 4,
              longestStreak: 4,
              totalReviews: 20,
              totalQuizzes: 10,
              correctAnswers: 9,
              wrongAnswers: 1,
              clientState: { wins: 6, petName: 'Voltamon' },
              updatedAt: new Date('2026-11-05T11:00:00Z'),
            },
          ],
        },
        { externalId: 'siswa_kosong', displayName: null, progresses: [] },
      ],
      10,
    );

    expect(res.totalPlayers).toBe(2);
    expect(res.leaderboard[0]?.externalUserId).toBe('siswa_02');
    expect(res.leaderboard[0]?.rank).toBe(1);
    expect(res.leaderboard[1]?.externalUserId).toBe('siswa_01');
    expect(res.leaderboard[1]?.points).toBe(650);
    expect(res.leaderboard[1]?.wins).toBe(4);
    expect(res.leaderboard[1]?.totalReviews).toBe(18);
    expect(res.leaderboard[1]?.quizAccuracy).toBe(0.8);
  });
});
