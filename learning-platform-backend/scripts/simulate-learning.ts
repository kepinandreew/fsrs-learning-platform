import 'dotenv/config';
import { CardStateType, Prisma, PrismaClient, Rating } from '@prisma/client';
import { FSRS, Grade, State, createEmptyCard, type Card } from '../src/fsrs';
import { computeQuizScore } from '../src/modules/evaluation/scoring';
import { computeStreak } from '../src/utils/streak';

// =============================================================================
// Skrip Simulasi Sesi Belajar Siswa (untuk demo sidang)
//
// Mengisi ReviewLog, QuizAttempt, CardState, dan Progress dengan riwayat belajar
// beberapa hari ke belakang, sehingga halaman Analytics langsung terisi.
// Perhitungan jadwal memakai FSRS Engine yang SAMA dengan backend (src/fsrs),
// dan data ditulis langsung lewat Prisma (tanpa melalui HTTP).
//
// Pemakaian:
//   npm run simulate
//   npm run simulate -- --deck "Kosakata Sains SD" --days 21 --seed 7
//   npm run simulate -- --deck all
// =============================================================================

const prisma = new PrismaClient();

// ---- Parameter CLI ----------------------------------------------------------

// Ambil nilai argumen `--nama nilai`; pakai default bila tidak ada.
function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : def;
}

const DECK_ARG = arg('deck', 'Kosakata Bahasa Inggris SD'); // judul, id, atau "all"
const DAYS = Math.min(Math.max(Number(arg('days', '14')) || 14, 1), 60); // jumlah hari ke belakang
const SEED = Number(arg('seed', '2026')) || 2026; // seed PRNG agar hasil dapat diulang

// ---- PRNG deterministik (mulberry32) ----------------------------------------

// Pembangkit acak ber-seed: hasil simulasi sama setiap kali dijalankan dengan seed yang sama.
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

// ---- Profil siswa simulasi --------------------------------------------------

interface Student {
  externalId: string;
  name: string;
  // Kemampuan dasar mengingat (0..1): makin tinggi makin sering berhasil.
  ability: number;
  // Peluang tidak belajar pada suatu hari.
  skipDayProb: number;
  // Rata-rata waktu tanggap dasar (ms).
  baseResponseMs: number;
  // Jumlah kartu baru yang dipelajari per sesi.
  newPerSession: number;
}

const STUDENTS: Student[] = [
  { externalId: 'siswa_01', name: 'Budi (Cepat & Rajin)', ability: 0.95, skipDayProb: 0.1, baseResponseMs: 2500, newPerSession: 3 },
  { externalId: 'siswa_02', name: 'Sari (Perlu Pendampingan)', ability: 0.7, skipDayProb: 0.3, baseResponseMs: 6500, newPerSession: 2 },
  { externalId: 'siswa_03', name: 'Dimas (Menengah)', ability: 0.85, skipDayProb: 0.2, baseResponseMs: 4000, newPerSession: 3 },
];

// Ambang waktu tanggap (ms) dan batas soal kuis pada game client.
const QUIZ_LIMIT_MS = 15_000;
const MS_MIN = 60_000;
const MS_DAY = 86_400_000;

// ---- Tipe data internal simulasi --------------------------------------------

interface CardRuntime {
  card: Card;
  firstAt: Date; // waktu review pertama -> menjadi createdAt CardState (dipakai Completion Time)
  elapsedDays: number;
  scheduledDays: number;
  difficultyPenalty: number;
  lastGrade: Grade;
}

const GRADE_TO_RATING: Record<Grade, Rating> = {
  [Grade.Again]: Rating.AGAIN,
  [Grade.Hard]: Rating.HARD,
  [Grade.Good]: Rating.GOOD,
  [Grade.Easy]: Rating.EASY,
};

// Enum state engine -> enum state database (nilai string identik).
const toDbState = (s: State): CardStateType => s as string as CardStateType;

// =============================================================================
// Simulasi satu siswa pada satu deck
// =============================================================================

async function simulateStudent(
  student: Student,
  deck: { id: string; appId: string; title: string },
  fsrs: FSRS,
  rng: () => number,
  now: Date,
) {
  // Muat flashcard dan soal MC aktif pada deck (urut tetap agar deterministik).
  const items = await prisma.learningItem.findMany({
    where: { deckId: deck.id, isActive: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const flashcards = items.filter((i) => i.type === 'FLASHCARD');
  const quizBySource = new Map(
    items.filter((i) => i.type === 'MULTIPLE_CHOICE' && i.sourceFlashcardId).map((q) => [q.sourceFlashcardId!, q]),
  );
  if (flashcards.length === 0) throw new Error(`Deck "${deck.title}" tidak memiliki flashcard`);

  // Tingkat kesulitan bawaan tiap kartu (0..0.4): sebagian kartu sengaja lebih sulit
  // agar daftar Difficult Topics bervariasi. Dibangkitkan deterministik dari seed.
  const hardness = new Map(flashcards.map((f) => [f.id, rng() * 0.4]));

  // Pastikan user ada (dibuat bila belum ada) pada aplikasi pemilik deck.
  const user = await prisma.user.upsert({
    where: { appId_externalId: { appId: deck.appId, externalId: student.externalId } },
    create: { appId: deck.appId, externalId: student.externalId, displayName: student.name },
    update: { displayName: student.name },
  });

  // State simulasi + penampung baris yang akan ditulis massal.
  const cards = new Map<string, CardRuntime>();
  const quizHistory = new Map<string, boolean[]>(); // flashcardId -> hasil kuis (terlama -> terbaru)
  const reviewRows: Prisma.ReviewLogCreateManyInput[] = [];
  const quizRows: Prisma.QuizAttemptCreateManyInput[] = [];
  let eventSeq = 0;
  const eventId = (kind: string) => `sim:${deck.id.slice(-6)}:${student.externalId}:${kind}:${++eventSeq}`;

  // Statistik progress.
  let totalReviews = 0;
  let totalQuizzes = 0;
  let correct = 0;
  let wrong = 0;
  let points = 0;
  let currentStreak = 0;
  let longestStreak = 0;
  let lastStudiedAt: Date | null = null;

  // Akurasi kuis terkini per flashcard (5 jawaban terakhir) - sama seperti perilaku server.
  const recentAccuracy = (flashcardId: string): number | null => {
    const h = quizHistory.get(flashcardId)?.slice(-5);
    return h && h.length ? h.filter(Boolean).length / h.length : null;
  };

  // ---- Loop hari: dari DAYS hari lalu sampai hari ini ----
  const today = new Date(now);
  for (let k = DAYS; k >= 0; k--) {
    // Siswa kadang tidak belajar pada suatu hari.
    if (rng() < student.skipDayProb) continue;

    // Sesi dimulai ±15:00 WIB (08:00 UTC) + jitter 0-90 menit.
    const sessionStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - k, 8, Math.floor(rng() * 90)),
    );
    // Jangan membuat sesi di masa depan.
    if (sessionStart.getTime() + 15 * MS_MIN > now.getTime()) continue;

    let clock = new Date(sessionStart);

    // Antrean: kartu jatuh tempo (paling lama menunggu dulu) lalu kartu baru.
    const dueIds = [...cards.entries()]
      .filter(([, c]) => c.card.state !== State.New && c.card.due.getTime() <= sessionStart.getTime())
      .sort((a, b) => a[1].card.due.getTime() - b[1].card.due.getTime())
      .map(([id]) => id);
    const newIds = flashcards.filter((f) => !cards.has(f.id)).slice(0, student.newPerSession).map((f) => f.id);
    const queue = [...dueIds, ...newIds];
    const repsThisSession = new Map<string, number>();
    const studied: string[] = [];

    // ---- Fase Flashcard (review FSRS) ----
    while (queue.length > 0) {
      const id = queue.shift()!;
      const runtime = cards.get(id);
      const card = runtime?.card ?? createEmptyCard(clock);
      const h = hardness.get(id) ?? 0;

      // Peluang berhasil mengingat: dipengaruhi R saat ini, kemampuan siswa, dan kesulitan kartu.
      // Kartu baru diberi R perkiraan 0.6 (tebakan awal).
      const R = card.state === State.New ? 0.6 : fsrs.getRetrievability(card, clock);
      const pRecall = clamp(R * student.ability - h, 0.05, 0.98);

      // Tentukan rating: gagal -> AGAIN; berhasil tapi ragu -> HARD; lancar -> GOOD/EASY.
      let grade: Grade;
      if (rng() > pRecall) grade = Grade.Again;
      else if (rng() < (1 - pRecall) * 1.2) grade = Grade.Hard;
      else if (pRecall > 0.9 && rng() < 0.4) grade = Grade.Easy;
      else grade = Grade.Good;

      // Waktu tanggap: lebih lama untuk kartu sulit dan saat ragu/gagal.
      const gradeFactor = grade === Grade.Again ? 1.8 : grade === Grade.Hard ? 1.4 : 1;
      const responseTimeMs = Math.round(
        clamp(student.baseResponseMs * (1 + h * 2) * gradeFactor * (0.7 + rng() * 0.6), 800, 20_000),
      );

      // Hitung jadwal baru dengan FSRS Engine murni sesuai Proposal TA Rev 3.
      const quizAccuracy = recentAccuracy(id);
      const { card: next, log } = fsrs.review(card, grade, clock);

      reviewRows.push({
        userId: user.id,
        itemId: id,
        rating: GRADE_TO_RATING[grade],
        stateBefore: toDbState(log.stateBefore),
        stabilityBefore: log.stabilityBefore,
        difficultyBefore: log.difficultyBefore,
        retrievability: log.retrievability,
        stateAfter: toDbState(log.stateAfter),
        stabilityAfter: log.stabilityAfter,
        difficultyAfter: log.difficultyAfter,
        scheduledDays: log.scheduledDays,
        elapsedDays: log.elapsedDays,
        due: log.due,
        responseTimeMs,
        quizAccuracy,
        difficultyPenalty: log.difficultyPenalty,
        clientEventId: eventId('rev'),
        reviewedAt: new Date(clock),
      });

      cards.set(id, {
        card: next,
        firstAt: runtime?.firstAt ?? new Date(clock),
        elapsedDays: log.elapsedDays,
        scheduledDays: log.scheduledDays,
        difficultyPenalty: log.difficultyPenalty,
        lastGrade: grade,
      });
      totalReviews++;
      points += 5; // poin dasar per kartu selesai
      if (!studied.includes(id)) studied.push(id);

      // Waktu berjalan: lama menjawab + jeda menekan tombol rating.
      clock = new Date(clock.getTime() + responseTimeMs + 3000 + Math.floor(rng() * 3000));

      // Kartu yang jatuh tempo dalam 10 menit (learning step) diulang dalam sesi yang sama, maksimum 3 kali.
      const reps = (repsThisSession.get(id) ?? 0) + 1;
      repsThisSession.set(id, reps);
      if (next.due.getTime() - clock.getTime() <= 10 * MS_MIN && reps < 3) queue.push(id);
    }

    // ---- Fase Kuis Multiple Choice (evaluasi) ----
    for (const flashcardId of studied) {
      const quiz = quizBySource.get(flashcardId);
      // Tidak semua kartu diuji setiap sesi.
      if (!quiz || quiz.correctIndex === null || rng() > 0.85) continue;

      const choiceCount = Array.isArray(quiz.choices) ? quiz.choices.length : 0;
      if (choiceCount < 2) continue;

      // Peluang menjawab benar: kemampuan siswa, kesulitan kartu, dan hasil rating terakhir (gagal -> lebih sering salah).
      const h = hardness.get(flashcardId) ?? 0;
      const lastGrade = cards.get(flashcardId)?.lastGrade ?? Grade.Good;
      const pCorrect = clamp((0.3 + 0.65 * student.ability - h * 0.8) * (lastGrade === Grade.Again ? 0.6 : 1), 0.1, 0.97);
      const isCorrect = rng() < pCorrect;

      // Pilihan salah dipilih acak dari opsi selain kunci.
      let selectedIndex = quiz.correctIndex;
      if (!isCorrect) {
        const wrongOptions = Array.from({ length: choiceCount }, (_, i) => i).filter((i) => i !== quiz.correctIndex);
        selectedIndex = wrongOptions[Math.floor(rng() * wrongOptions.length)]!;
      }

      // Waktu tanggap kuis; jawaban salah kadang habis waktu (15 detik).
      const quizRt = Math.round(
        clamp(student.baseResponseMs * (1 + h) * (isCorrect ? 0.6 + rng() * 0.8 : 1 + rng() * 1.2), 1000, QUIZ_LIMIT_MS),
      );
      const score = computeQuizScore(isCorrect, quizRt);

      quizRows.push({
        userId: user.id,
        itemId: quiz.id,
        selectedIndex,
        isCorrect,
        responseTimeMs: quizRt,
        score,
        sessionId: `sim-session-${DAYS - k}`,
        clientEventId: eventId('quiz'),
        answeredAt: new Date(clock),
      });

      const hist = quizHistory.get(flashcardId) ?? [];
      hist.push(isCorrect);
      quizHistory.set(flashcardId, hist);

      totalQuizzes++;
      if (isCorrect) correct++;
      else wrong++;
      points += score;
      clock = new Date(clock.getTime() + quizRt + 2000);
    }

    // Perbarui streak harian (zona waktu WIB) menggunakan util yang sama dengan backend.
    const streak = computeStreak(lastStudiedAt, sessionStart, currentStreak, longestStreak);
    currentStreak = streak.currentStreak;
    longestStreak = streak.longestStreak;
    lastStudiedAt = clock;
  }

  // ---- Tulis ke database dalam satu transaksi ----
  const exp = points;
  await prisma.$transaction(
    async (tx) => {
      // Reset hanya data siswa ini pada deck ini, agar skrip aman dijalankan berulang.
      const scope = { userId: user.id, item: { deckId: deck.id } };
      await tx.reviewLog.deleteMany({ where: scope });
      await tx.quizAttempt.deleteMany({ where: scope });
      await tx.cardState.deleteMany({ where: scope });
      await tx.progress.deleteMany({ where: { userId: user.id, deckId: deck.id } });

      // State kartu akhir hasil simulasi (createdAt = waktu review pertama).
      await tx.cardState.createMany({
        data: [...cards.entries()].map(([itemId, c]) => ({
          userId: user.id,
          itemId,
          state: toDbState(c.card.state),
          difficulty: c.card.difficulty,
          stability: c.card.stability,
          due: c.card.due,
          lastReview: c.card.lastReview,
          reps: c.card.reps,
          lapses: c.card.lapses,
          hardCount: c.card.hardCount,
          elapsedDays: c.elapsedDays,
          scheduledDays: c.scheduledDays,
          difficultyPenalty: c.difficultyPenalty,
          createdAt: c.firstAt,
        })),
      });

      if (reviewRows.length) await tx.reviewLog.createMany({ data: reviewRows });
      if (quizRows.length) await tx.quizAttempt.createMany({ data: quizRows });

      // Agregat progress & gamifikasi.
      await tx.progress.create({
        data: {
          userId: user.id,
          deckId: deck.id,
          points,
          exp,
          level: 1 + Math.floor(exp / 300),
          totalReviews,
          totalQuizzes,
          correctAnswers: correct,
          wrongAnswers: wrong,
          currentStreak,
          longestStreak,
          lastStudiedAt,
          clientState: { petStage: exp > 600 ? 'adult_dragon' : exp > 250 ? 'young_dragon' : 'baby_dragon', simulated: true },
        },
      });
    },
    { timeout: 60_000 },
  );

  // Ringkasan siswa untuk ditampilkan di terminal.
  const mastered = [...cards.values()].filter((c) => c.card.stability >= 7).length;
  return {
    student: student.externalId,
    reviews: totalReviews,
    quizzes: totalQuizzes,
    accuracy: totalQuizzes ? `${((correct / totalQuizzes) * 100).toFixed(0)}%` : '-',
    mastered: `${mastered}/${flashcards.length}`,
    streak: currentStreak,
  };
}

// =============================================================================
// Program utama
// =============================================================================

async function main() {
  const now = new Date();

  // Pilih deck: "all" = semua deck aktif; selain itu cocokkan id atau judul.
  const decks =
    DECK_ARG.toLowerCase() === 'all'
      ? await prisma.deck.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } })
      : await prisma.deck.findMany({
          where: { isActive: true, OR: [{ id: DECK_ARG }, { title: DECK_ARG }] },
          orderBy: { createdAt: 'asc' },
        });

  if (decks.length === 0) {
    throw new Error(`Deck "${DECK_ARG}" tidak ditemukan. Jalankan "npm run prisma:seed" terlebih dahulu.`);
  }

  console.log(`Simulasi ${DAYS} hari ke belakang, seed=${SEED}, ${STUDENTS.length} siswa, ${decks.length} deck\n`);

  for (const deck of decks) {
    // Retensi target mengikuti pengaturan aplikasi pemilik deck (sama seperti perilaku backend).
    const app = await prisma.app.findUnique({ where: { id: deck.appId }, select: { requestRetention: true } });
    const fsrs = new FSRS({ requestRetention: app?.requestRetention ?? 0.9 });

    // Satu PRNG per deck; tiap siswa memakai turunan seed berbeda agar perilakunya berlainan.
    console.log(`Deck: ${deck.title}`);
    const rows: Awaited<ReturnType<typeof simulateStudent>>[] = [];
    for (const [idx, student] of STUDENTS.entries()) {
      const rng = mulberry32(SEED * 1000 + idx * 97 + deck.id.charCodeAt(deck.id.length - 1));
      rows.push(await simulateStudent(student, deck, fsrs, rng, now));
    }
    console.table(rows);
  }

  console.log('Selesai. Buka Developer Dashboard > Monitoring & Analytics, pilih deck, lalu klik "Segarkan".');
}

main()
  .catch((err) => {
    console.error('Simulasi gagal:', err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
