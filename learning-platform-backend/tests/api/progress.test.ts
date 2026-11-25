import { describe, expect, it } from 'vitest';
import { mergeClientState, rankLeaderboardUsers } from '../../src/modules/progress/progress.service';

describe('Progress Leaderboard Aggregation & Cross-Game State Merge', () => {
  it('menggabungkan clientState lintas game (Pet Battle & Baking Chef) tanpa saling menimpa', () => {
    const merged = mergeClientState(
      { hasChosenPet: true, speciesId: 'water', petName: 'Aquamon', wins: 3 },
      { game: 'baking-chef-rush', chefRank: 'Head Patissier', completedRecipes: 2 },
    ) as Record<string, unknown>;

    expect(merged.hasChosenPet).toBe(true);
    expect(merged.speciesId).toBe('water');
    expect(merged.petName).toBe('Aquamon');
    expect(merged.wins).toBe(3);
    expect(merged.completedRecipes).toBe(2);
    expect(merged.chefRank).toBe('Head Patissier');
  });

  it('mempertahankan atribut monster Pet Battle dan resep Baking Chef dari dua baris deck berbeda pada leaderboard', () => {
    const res = rankLeaderboardUsers(
      [
        {
          externalId: 'siswa_01',
          displayName: 'Kevin Andrew',
          progresses: [
            {
              points: 990,
              exp: 820,
              level: 3,
              currentStreak: 3,
              longestStreak: 3,
              totalReviews: 6,
              totalQuizzes: 5,
              correctAnswers: 5,
              wrongAnswers: 0,
              clientState: { game: 'baking-chef-rush', chefRank: 'Head Patissier', completedRecipes: 2 },
              updatedAt: new Date('2026-11-25T12:00:00Z'),
            },
            {
              points: 981,
              exp: 755,
              level: 2,
              currentStreak: 2,
              longestStreak: 3,
              totalReviews: 12,
              totalQuizzes: 10,
              correctAnswers: 7,
              wrongAnswers: 3,
              clientState: { hasChosenPet: true, speciesId: 'water', petName: 'Aquamon', wins: 3 },
              updatedAt: new Date('2026-11-24T10:00:00Z'),
            },
          ],
        },
      ],
      10,
    );

    expect(res.leaderboard[0]?.wins).toBe(3);
    const cs = res.leaderboard[0]?.clientState as Record<string, unknown>;
    expect(cs.speciesId).toBe('water');
    expect(cs.petName).toBe('Aquamon');
    expect(cs.completedRecipes).toBe(2);
  });

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
