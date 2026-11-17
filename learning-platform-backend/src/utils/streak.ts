// Utilitas streak (hari belajar berturut-turut). Murni (tanpa DB) sehingga mudah diuji.

// Default zona waktu WIB (UTC+7) karena target pengguna adalah siswa SD di Indonesia.
export const DEFAULT_TZ_OFFSET_MIN = 420;
const MS_MINUTE = 60_000;
const MS_DAY = 86_400_000;

// Ubah waktu menjadi nomor hari (bilangan bulat) pada zona waktu tertentu.
// Dua waktu pada hari kalender yang sama menghasilkan nomor yang sama.
export function dayIndex(date: Date, tzOffsetMin: number = DEFAULT_TZ_OFFSET_MIN): number {
  return Math.floor((date.getTime() + tzOffsetMin * MS_MINUTE) / MS_DAY);
}

// Hitung streak baru berdasarkan hari belajar terakhir.
export function computeStreak(
  lastStudiedAt: Date | null,
  now: Date,
  currentStreak: number,
  longestStreak: number,
  tzOffsetMin: number = DEFAULT_TZ_OFFSET_MIN,
): { currentStreak: number; longestStreak: number } {
  // Belum pernah belajar: streak dimulai dari 1.
  if (!lastStudiedAt) return { currentStreak: 1, longestStreak: Math.max(longestStreak, 1) };

  const gap = dayIndex(now, tzOffsetMin) - dayIndex(lastStudiedAt, tzOffsetMin);

  // Hari yang sama: streak tidak berubah (minimal 1).
  // Kemarin: streak bertambah. Lebih lama dari itu: streak putus dan mulai lagi dari 1.
  const next = gap <= 0 ? Math.max(currentStreak, 1) : gap === 1 ? currentStreak + 1 : 1;
  return { currentStreak: next, longestStreak: Math.max(longestStreak, next) };
}
