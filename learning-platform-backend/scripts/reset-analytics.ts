import { prisma } from '../src/config/prisma';

// =============================================================================
// Script Reset Riwayat Belajar & Analytics Database PostgreSQL (Tugas Akhir)
// Penggunaan:
//   npm run reset-data                -> Mereset seluruh log & progress (semua user)
//   npm run reset-data siswa_01       -> Mereset log & progress siswa_01 saja
// =============================================================================

async function main() {
  const targetUser = process.argv[2] || 'all';

  if (targetUser === 'all') {
    console.log('🧹 [RESET ALL] Menghapus bersih seluruh ReviewLog, QuizAttempt, CardState, dan Progress di database...');
    const [rl, qa, cs, pr] = await prisma.$transaction([
      prisma.reviewLog.deleteMany(),
      prisma.quizAttempt.deleteMany(),
      prisma.cardState.deleteMany(),
      prisma.progress.deleteMany(),
    ]);

    console.log(`✅ Berhasil mereset database secara menyeluruh:`);
    console.log(`   - ReviewLog terhapus   : ${rl.count}`);
    console.log(`   - QuizAttempt terhapus : ${qa.count}`);
    console.log(`   - CardState terhapus   : ${cs.count}`);
    console.log(`   - Progress terhapus    : ${pr.count}`);
    console.log('✨ Developer Dashboard (Monitoring & Analytics) kini 100% bersih / segar untuk demo baru!');
  } else {
    console.log(`🧹 [RESET USER] Menghapus data riwayat untuk user: "${targetUser}"...`);
    const users = await prisma.user.findMany({
      where: { externalId: targetUser },
      select: { id: true, externalId: true, displayName: true },
    });

    if (users.length === 0) {
      console.log(`⚠️ User dengan ID "${targetUser}" tidak ditemukan di database.`);
      return;
    }

    const userIds = users.map((u) => u.id);

    const [rl, qa, cs, pr] = await prisma.$transaction([
      prisma.reviewLog.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.quizAttempt.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.cardState.deleteMany({ where: { userId: { in: userIds } } }),
      prisma.progress.deleteMany({ where: { userId: { in: userIds } } }),
    ]);

    console.log(`✅ Berhasil mereset data untuk user "${targetUser}":`);
    console.log(`   - ReviewLog terhapus   : ${rl.count}`);
    console.log(`   - QuizAttempt terhapus : ${qa.count}`);
    console.log(`   - CardState terhapus   : ${cs.count}`);
    console.log(`   - Progress terhapus    : ${pr.count}`);
    console.log(`✨ Monitoring dan Analytics untuk "${targetUser}" di Developer Dashboard kini tereset bersih!`);
  }
}

main()
  .catch((err) => {
    console.error('❌ Terjadi kesalahan saat reset data:', err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
