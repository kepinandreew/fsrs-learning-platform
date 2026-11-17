import { execSync } from 'child_process';
import { Prisma, PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

// =============================================================================
// Script Kloning Otomatis Database Lokal -> Cloud PostgreSQL (Supabase / Neon)
// Cara pakai:
//   npm run db:sync-cloud -- "postgresql://postgres.[ref]:[pass]@...pooler.supabase.com:5432/postgres"
// =============================================================================

async function main() {
  const localUrl = process.env.DATABASE_URL;
  const cloudUrl = (process.argv[2] || process.env.CLOUD_DATABASE_URL || '').trim();

  if (!localUrl) {
    console.error('❌ DATABASE_URL lokal belum diset di file .env');
    process.exit(1);
  }
  if (!cloudUrl) {
    console.error(
      '❌ Harap masukkan URL Database Cloud (Supabase / Neon).\n' +
        '   Contoh: npm run db:sync-cloud -- "postgresql://postgres:PASS@HOST:5432/postgres"',
    );
    process.exit(1);
  }

  console.log('🚀 1/3 Mendorong skema tabel Prisma ke Database Cloud (Supabase/Neon)...');
  execSync('npx prisma db push --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: cloudUrl },
  });

  const source = new PrismaClient({ datasources: { db: { url: localUrl } } });
  const target = new PrismaClient({ datasources: { db: { url: cloudUrl } } });

  try {
    console.log('\n📦 2/3 Membaca seluruh data dari Database Lokal...');
    const [
      developers,
      apps,
      decks,
      items,
      users,
      progresses,
      cardStates,
      reviewLogs,
      quizAttempts,
    ] = await Promise.all([
      source.developer.findMany(),
      source.app.findMany(),
      source.deck.findMany(),
      source.learningItem.findMany(),
      source.user.findMany(),
      source.progress.findMany(),
      source.cardState.findMany(),
      source.reviewLog.findMany(),
      source.quizAttempt.findMany(),
    ]);

    console.log(
      `   Ditemukan: ${developers.length} developer, ${apps.length} app, ${decks.length} deck, ` +
        `${items.length} soal, ${users.length} siswa, ${cardStates.length} kartu FSRS, ` +
        `${reviewLogs.length} review, ${quizAttempts.length} kuis.`,
    );

    console.log('\n☁️  3/3 Menyalin data ke Database Cloud (createMany skipDuplicates)...');

    await target.developer.createMany({ data: developers, skipDuplicates: true });
    await target.app.createMany({
      data: apps.map((a) => ({
        ...a,
        fsrsParams: a.fsrsParams === null ? Prisma.JsonNull : (a.fsrsParams as Prisma.InputJsonValue),
      })),
      skipDuplicates: true,
    });
    await target.deck.createMany({ data: decks, skipDuplicates: true });

    // Sinkronkan FLASHCARD terlebih dahulu sebelum MULTIPLE_CHOICE (relasi sourceFlashcardId)
    const flashcards = items.filter((i) => i.type === 'FLASHCARD');
    const quizzes = items.filter((i) => i.type !== 'FLASHCARD');
    await target.learningItem.createMany({
      data: flashcards.map((item) => ({
        ...item,
        choices: item.choices === null ? Prisma.JsonNull : (item.choices as Prisma.InputJsonValue),
      })),
      skipDuplicates: true,
    });
    await target.learningItem.createMany({
      data: quizzes.map((item) => ({
        ...item,
        choices: item.choices === null ? Prisma.JsonNull : (item.choices as Prisma.InputJsonValue),
      })),
      skipDuplicates: true,
    });

    await target.user.createMany({ data: users, skipDuplicates: true });
    await target.progress.createMany({
      data: progresses.map((p) => ({
        ...p,
        clientState:
          p.clientState === null ? Prisma.JsonNull : (p.clientState as Prisma.InputJsonValue),
      })),
      skipDuplicates: true,
    });
    await target.cardState.createMany({ data: cardStates, skipDuplicates: true });
    await target.reviewLog.createMany({ data: reviewLogs, skipDuplicates: true });
    await target.quizAttempt.createMany({ data: quizAttempts, skipDuplicates: true });

    console.log('\n✅ Selesai! Seluruh tabel, soal, API Key, dan riwayat siswa telah tersinkron ke Cloud.');
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((err) => {
  console.error('❌ Gagal menyinkronkan database ke Cloud:', err);
  process.exit(1);
});
