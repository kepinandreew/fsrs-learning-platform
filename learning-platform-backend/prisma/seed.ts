import { ItemType, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../src/config/env';
import { API_KEY_PREFIX, hashApiKey } from '../src/utils/apiKey';
import { sha256 } from '../src/utils/hash';

// =============================================================================
// Database Seeder (prisma/seed.ts)
// Mengisi data contoh: 1 Developer (+ JWT), 1 App (+ API Key), serta Deck materi
// utama "English Food & Baking Vocabulary" untuk game Baking Chef beserta
// pasangan Flashcard dan Multiple Choice yang terikat via sourceFlashcardId.
// =============================================================================

const prisma = new PrismaClient();

const SEED_DEV = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Developer Uji Coba TA',
  email: 'developer@fsrs-platform.local',
  password: 'Password123!',
};

const SEED_APP = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Baking Chef — English Food Vocabulary Game',
  description: 'Aplikasi game edukasi 2D berbasis Phaser.js untuk validasi REST API & algoritma FSRS.',
  plainApiKey: `${API_KEY_PREFIX}demo_pet_battle_sd_2026_secret_key`,
  requestRetention: 0.9,
};

const SEED_ASSET_BASE = (
  process.env.PUBLIC_API_BASE_URL || 'https://fsrs-learning-platform.vercel.app'
).replace(/\/+$/, '');
const cardArtUrl = (slug: string) => `${SEED_ASSET_BASE}/api/assets/illustration/${slug}.svg`;

interface SeedVocabItem {
  flashcardId: string;
  quizId: string;
  front: string;
  back: string;
  tags: string[];
  imageUrl: string | null;
  audioUrl: string | null;
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
}

// =============================================================================
// DECK 1 (UTAMA UNTUK GAME "BAKING CHEF"): ENGLISH FOOD & BAKING VOCABULARY
// =============================================================================
const SEED_BAKING_DECK = {
  id: '00000000-0000-4000-8000-000000000005',
  title: 'English Food & Baking Vocabulary',
  description:
    'Kosakata bahan makanan & kue dalam Bahasa Inggris (Flour, Sugar, Butter, Eggs, Milk, Vanilla, Chocolate, Cinnamon, Strawberry, Honey, Cheese, Salt) untuk game edukasi Baking Chef.',
};

const BAKING_ITEMS: SeedVocabItem[] = [
  {
    flashcardId: '00000000-0000-4000-8000-000000000501',
    quizId: '00000000-0000-4000-8000-000000000601',
    front: 'Flour',
    back: 'Tepung Terigu',
    tags: ['ingredient', 'vocabulary'],
    imageUrl: cardArtUrl('flour'),
    audioUrl: null,
    question: 'Step: "Add Flour into the mixing bowl!" — Apa arti dari kata "Flour"?',
    choices: ['Tepung Terigu', 'Garam Dapur', 'Air Putih', 'Keju Parut'],
    correctIndex: 0,
    explanation: '"Flour" dalam Bahasa Indonesia berarti Tepung Terigu, bahan dasar utama pembuat adonan kue.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000502',
    quizId: '00000000-0000-4000-8000-000000000602',
    front: 'Sugar',
    back: 'Gula Pasir',
    tags: ['ingredient', 'vocabulary'],
    imageUrl: cardArtUrl('sugar'),
    audioUrl: null,
    question: 'Step: "Add Sugar to make the batter sweet!" — Apa arti dari kata "Sugar"?',
    choices: ['Lada Hitam', 'Gula Pasir', 'Mentega', 'Tepung Terigu'],
    correctIndex: 1,
    explanation: '"Sugar" artinya Gula Pasir yang berfungsi memberi rasa manis dan kelembapan pada kue.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000503',
    quizId: '00000000-0000-4000-8000-000000000603',
    front: 'Butter',
    back: 'Mentega',
    tags: ['ingredient', 'vocabulary'],
    imageUrl: cardArtUrl('butter'),
    audioUrl: null,
    question: 'Step: "Add melted Butter into the bowl!" — Apa arti dari kata "Butter"?',
    choices: ['Mentega', 'Telur', 'Susu', 'Gula Pasir'],
    correctIndex: 0,
    explanation: '"Butter" berarti Mentega, lemak susu yang membuat tekstur kue lembut dan harum.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000504',
    quizId: '00000000-0000-4000-8000-000000000604',
    front: 'Eggs',
    back: 'Telur',
    tags: ['ingredient', 'vocabulary'],
    imageUrl: cardArtUrl('eggs'),
    audioUrl: null,
    question: 'Step: "Crack and add two Eggs!" — Bahan makanan apakah "Eggs" itu?',
    choices: ['Tepung Terigu', 'Telur', 'Mentega', 'Kayu Manis'],
    correctIndex: 1,
    explanation: '"Eggs" artinya Telur, bahan pengikat dan pengembang alami dalam adonan kue.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000505',
    quizId: '00000000-0000-4000-8000-000000000605',
    front: 'Milk',
    back: 'Susu Segar',
    tags: ['ingredient', 'liquid'],
    imageUrl: cardArtUrl('milk'),
    audioUrl: null,
    question: 'Step: "Pour fresh Milk into the batter!" — Apa arti kata "Milk"?',
    choices: ['Susu Segar', 'Minyak Goreng', 'Air Hangat', 'Madu'],
    correctIndex: 0,
    explanation: '"Milk" dalam Bahasa Indonesia berarti Susu Segar.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000506',
    quizId: '00000000-0000-4000-8000-000000000606',
    front: 'Vanilla',
    back: 'Ekstrak Vanila',
    tags: ['ingredient', 'aroma'],
    imageUrl: cardArtUrl('vanilla'),
    audioUrl: null,
    question: 'Step: "Add a drop of Vanilla for aroma!" — Bahan apakah "Vanilla" itu?',
    choices: ['Ekstrak Vanila', 'Garam Dapur', 'Tepung Jagung', 'Keju Parut'],
    correctIndex: 0,
    explanation: '"Vanilla" adalah Ekstrak Vanila untuk memberikan aroma harum pada kue.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000507',
    quizId: '00000000-0000-4000-8000-000000000607',
    front: 'Chocolate',
    back: 'Cokelat',
    tags: ['ingredient', 'sweet'],
    imageUrl: cardArtUrl('chocolate'),
    audioUrl: null,
    question: 'Step: "Add Chocolate chips into the bowl!" — Apa arti dari "Chocolate"?',
    choices: ['Cokelat', 'Stroberi', 'Keju', 'Kacang'],
    correctIndex: 0,
    explanation: '"Chocolate" dalam Bahasa Indonesia berarti Cokelat.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000508',
    quizId: '00000000-0000-4000-8000-000000000608',
    front: 'Cinnamon',
    back: 'Bubuk Kayu Manis',
    tags: ['ingredient', 'spice'],
    imageUrl: cardArtUrl('cinnamon'),
    audioUrl: null,
    question: 'Step: "Sprinkle Cinnamon powder!" — Rempah kue apakah "Cinnamon" itu?',
    choices: ['Bubuk Kayu Manis', 'Lada Hitam', 'Garam Laut', 'Gula Halus'],
    correctIndex: 0,
    explanation: '"Cinnamon" berarti Bubuk Kayu Manis yang sering dipadukan dengan apel atau roti.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000509',
    quizId: '00000000-0000-4000-8000-000000000609',
    front: 'Strawberry',
    back: 'Buah Stroberi',
    tags: ['ingredient', 'fruit'],
    imageUrl: cardArtUrl('strawberry'),
    audioUrl: null,
    question: 'Step: "Top the cake with fresh Strawberry!" — Apa arti dari kata "Strawberry"?',
    choices: ['Buah Stroberi', 'Buah Anggur', 'Cokelat', 'Mentega'],
    correctIndex: 0,
    explanation: '"Strawberry" dalam Bahasa Indonesia berarti Buah Stroberi.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000510',
    quizId: '00000000-0000-4000-8000-000000000610',
    front: 'Honey',
    back: 'Madu Murni',
    tags: ['ingredient', 'sweet'],
    imageUrl: cardArtUrl('honey'),
    audioUrl: null,
    question: 'Step: "Drizzle sweet Honey on the pancake!" — Bahan apakah "Honey" itu?',
    choices: ['Garam Dapur', 'Madu Murni', 'Tepung Terigu', 'Keju Parut'],
    correctIndex: 1,
    explanation: '"Honey" dalam Bahasa Indonesia berarti Madu Murni.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000511',
    quizId: '00000000-0000-4000-8000-000000000611',
    front: 'Cheese',
    back: 'Keju Parut',
    tags: ['ingredient', 'dairy'],
    imageUrl: cardArtUrl('cheese'),
    audioUrl: null,
    question: 'Step: "Sprinkle grated Cheese on top!" — Apa arti kata "Cheese"?',
    choices: ['Gula Pasir', 'Susu Segar', 'Keju Parut', 'Telur'],
    correctIndex: 2,
    explanation: '"Cheese" dalam Bahasa Indonesia berarti Keju (Keju Parut).',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000512',
    quizId: '00000000-0000-4000-8000-000000000612',
    front: 'Salt',
    back: 'Garam Dapur',
    tags: ['ingredient', 'seasoning'],
    imageUrl: cardArtUrl('salt'),
    audioUrl: null,
    question: 'Step: "Add a pinch of Salt into the dough!" — Bahan apakah "Salt" itu?',
    choices: ['Mentega', 'Cokelat', 'Ekstrak Vanila', 'Garam Dapur'],
    correctIndex: 3,
    explanation: '"Salt" dalam Bahasa Indonesia berarti Garam Dapur.',
  },
];

// =============================================================================
// DECK 2 & 3 (TAMBAHAN CONTOH MULTIDECK DI DASHBOARD)
// =============================================================================
const SEED_DECK = {
  id: '00000000-0000-4000-8000-000000000003',
  title: 'Kosakata Bahasa Inggris SD',
  description: 'Deck kosakata tematik (Buah, Hewan, dan Benda Sekitar) untuk siswa Sekolah Dasar.',
};

const VOCAB_ITEMS: SeedVocabItem[] = [
  {
    flashcardId: '00000000-0000-4000-8000-000000000101',
    quizId: '00000000-0000-4000-8000-000000000201',
    front: 'Apple',
    back: 'Apel',
    tags: ['fruit', 'food'],
    imageUrl: cardArtUrl('apple'),
    audioUrl: null,
    question: 'Apa arti kata "Apple" dalam bahasa Indonesia?',
    choices: ['Apel', 'Jeruk', 'Pisang', 'Mangga'],
    correctIndex: 0,
    explanation: '"Apple" dalam bahasa Indonesia berarti buah apel.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000102',
    quizId: '00000000-0000-4000-8000-000000000202',
    front: 'Banana',
    back: 'Pisang',
    tags: ['fruit', 'food'],
    imageUrl: cardArtUrl('banana'),
    audioUrl: null,
    question: 'Buah berwarna kuning yang dalam bahasa Inggris disebut "Banana" adalah...',
    choices: ['Semangka', 'Pisang', 'Anggur', 'Pepaya'],
    correctIndex: 1,
    explanation: '"Banana" artinya pisang.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000103',
    quizId: '00000000-0000-4000-8000-000000000203',
    front: 'Cat',
    back: 'Kucing',
    tags: ['animal', 'pet'],
    imageUrl: cardArtUrl('cat'),
    audioUrl: null,
    question: 'Hewan peliharaan yang suka mengeong dalam bahasa Inggris disebut...',
    choices: ['Dog', 'Bird', 'Cat', 'Fish'],
    correctIndex: 2,
    explanation: '"Cat" adalah bahasa Inggris untuk kucing.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000104',
    quizId: '00000000-0000-4000-8000-000000000204',
    front: 'Dog',
    back: 'Anjing',
    tags: ['animal', 'pet'],
    imageUrl: cardArtUrl('dog'),
    audioUrl: null,
    question: 'Apa arti kata "Dog" dalam bahasa Indonesia?',
    choices: ['Kelinci', 'Kucing', 'Ayam', 'Anjing'],
    correctIndex: 3,
    explanation: '"Dog" berarti anjing.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000105',
    quizId: '00000000-0000-4000-8000-000000000205',
    front: 'Book',
    back: 'Buku',
    tags: ['school', 'object'],
    imageUrl: cardArtUrl('book'),
    audioUrl: null,
    question: 'Benda yang kita baca di sekolah dalam bahasa Inggris disebut "Book", yang artinya...',
    choices: ['Buku', 'Pensil', 'Meja', 'Tas'],
    correctIndex: 0,
    explanation: '"Book" dalam bahasa Indonesia artinya buku.',
  },
];

const SEED_SCIENCE_DECK = {
  id: '00000000-0000-4000-8000-000000000004',
  title: 'Kosakata Sains SD',
  description: 'Deck kosakata sains dasar (Alam, Cuaca, dan Benda Langit) untuk siswa Sekolah Dasar.',
};

const SCIENCE_ITEMS: SeedVocabItem[] = [
  {
    flashcardId: '00000000-0000-4000-8000-000000000301',
    quizId: '00000000-0000-4000-8000-000000000401',
    front: 'Sun',
    back: 'Matahari',
    tags: ['space', 'nature'],
    imageUrl: cardArtUrl('sun'),
    audioUrl: null,
    question: 'Bintang yang memberi cahaya dan panas bagi Bumi dalam bahasa Inggris disebut...',
    choices: ['Moon', 'Sun', 'Star', 'Cloud'],
    correctIndex: 1,
    explanation: '"Sun" artinya matahari.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000302',
    quizId: '00000000-0000-4000-8000-000000000402',
    front: 'Moon',
    back: 'Bulan',
    tags: ['space', 'nature'],
    imageUrl: cardArtUrl('moon'),
    audioUrl: null,
    question: 'Apa arti kata "Moon" dalam bahasa Indonesia?',
    choices: ['Bintang', 'Bumi', 'Bulan', 'Awan'],
    correctIndex: 2,
    explanation: '"Moon" berarti bulan.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000303',
    quizId: '00000000-0000-4000-8000-000000000403',
    front: 'Water',
    back: 'Air',
    tags: ['nature', 'matter'],
    imageUrl: cardArtUrl('water'),
    audioUrl: null,
    question: 'Cairan bening yang kita minum dalam bahasa Inggris disebut...',
    choices: ['Fire', 'Water', 'Wind', 'Soil'],
    correctIndex: 1,
    explanation: '"Water" artinya air.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000304',
    quizId: '00000000-0000-4000-8000-000000000404',
    front: 'Plant',
    back: 'Tumbuhan',
    tags: ['nature', 'living-things'],
    imageUrl: cardArtUrl('plant'),
    audioUrl: null,
    question: 'Apa arti kata "Plant" dalam bahasa Indonesia?',
    choices: ['Hewan', 'Batu', 'Tumbuhan', 'Tanah'],
    correctIndex: 2,
    explanation: '"Plant" berarti tumbuhan.',
  },
  {
    flashcardId: '00000000-0000-4000-8000-000000000305',
    quizId: '00000000-0000-4000-8000-000000000405',
    front: 'Rain',
    back: 'Hujan',
    tags: ['weather', 'nature'],
    imageUrl: cardArtUrl('rain'),
    audioUrl: null,
    question: 'Air yang jatuh dari awan dalam bahasa Inggris disebut...',
    choices: ['Snow', 'Wind', 'Rain', 'Storm'],
    correctIndex: 2,
    explanation: '"Rain" artinya hujan.',
  },
];

interface SeedDeckDef {
  id: string;
  title: string;
  description: string;
  items: SeedVocabItem[];
}

const SEED_DECKS: SeedDeckDef[] = [
  { ...SEED_BAKING_DECK, items: BAKING_ITEMS },
  { ...SEED_DECK, items: VOCAB_ITEMS },
  { ...SEED_SCIENCE_DECK, items: SCIENCE_ITEMS },
];

function computeContentHash(params: {
  type: ItemType;
  front?: string | null;
  back?: string | null;
  question?: string | null;
  choices?: unknown;
  correctIndex?: number | null;
  imageUrl?: string | null;
  audioUrl?: string | null;
}): string {
  return sha256(
    JSON.stringify([
      params.type,
      params.front,
      params.back,
      params.question,
      params.choices,
      params.correctIndex,
      params.imageUrl,
      params.audioUrl,
    ]),
  );
}

async function seedDeck(appId: string, def: SeedDeckDef) {
  const deck = await prisma.deck.upsert({
    where: { id: def.id },
    update: { appId, title: def.title, description: def.description, isActive: true },
    create: { id: def.id, appId, title: def.title, description: def.description, isActive: true },
  });

  for (const item of def.items) {
    const fcData = {
      appId,
      deckId: deck.id,
      type: ItemType.FLASHCARD,
      front: item.front,
      back: item.back,
      tags: item.tags,
      imageUrl: item.imageUrl,
      audioUrl: item.audioUrl,
      contentHash: computeContentHash({
        type: ItemType.FLASHCARD,
        front: item.front,
        back: item.back,
        imageUrl: item.imageUrl,
        audioUrl: item.audioUrl,
      }),
      isActive: true,
    };
    const flashcard = await prisma.learningItem.upsert({
      where: { id: item.flashcardId },
      update: fcData,
      create: { id: item.flashcardId, ...fcData },
    });

    const mcData = {
      appId,
      deckId: deck.id,
      type: ItemType.MULTIPLE_CHOICE,
      question: item.question,
      choices: item.choices,
      correctIndex: item.correctIndex,
      explanation: item.explanation,
      sourceFlashcardId: flashcard.id,
      tags: item.tags,
      imageUrl: item.imageUrl,
      audioUrl: item.audioUrl,
      contentHash: computeContentHash({
        type: ItemType.MULTIPLE_CHOICE,
        question: item.question,
        choices: item.choices,
        correctIndex: item.correctIndex,
        imageUrl: item.imageUrl,
        audioUrl: item.audioUrl,
      }),
      isActive: true,
    };
    await prisma.learningItem.upsert({
      where: { id: item.quizId },
      update: mcData,
      create: { id: item.quizId, ...mcData },
    });
  }
  return deck;
}

async function main() {
  console.log('Memulai proses seeding database Learning Platform...\n');

  const passwordHash = await bcrypt.hash(SEED_DEV.password, 12);
  const developer = await prisma.developer.upsert({
    where: { email: SEED_DEV.email },
    update: {
      name: SEED_DEV.name,
      passwordHash,
      isActive: true,
    },
    create: {
      id: SEED_DEV.id,
      name: SEED_DEV.name,
      email: SEED_DEV.email,
      passwordHash,
      isActive: true,
    },
  });

  const devJwtToken = jwt.sign({ email: developer.email }, env.JWT_SECRET, {
    subject: developer.id,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });

  const apiKeyHash = hashApiKey(SEED_APP.plainApiKey);
  const apiKeyPrefix = SEED_APP.plainApiKey.slice(0, API_KEY_PREFIX.length + 4);

  const app = await prisma.app.upsert({
    where: { id: SEED_APP.id },
    update: {
      name: SEED_APP.name,
      description: SEED_APP.description,
      apiKeyHash,
      apiKeyPrefix,
      requestRetention: SEED_APP.requestRetention,
      isActive: true,
      revokedAt: null,
    },
    create: {
      id: SEED_APP.id,
      developerId: developer.id,
      name: SEED_APP.name,
      description: SEED_APP.description,
      apiKeyHash,
      apiKeyPrefix,
      requestRetention: SEED_APP.requestRetention,
      isActive: true,
    },
  });

  const seededDecks: Array<{ id: string; title: string; items: number }> = [];
  for (const def of SEED_DECKS) {
    const deck = await seedDeck(app.id, def);
    seededDecks.push({ id: deck.id, title: deck.title, items: def.items.length });
  }

  console.log('================================================================');
  console.log('SEEDING SELESAI!');
  console.log('================================================================');
  console.log(`Developer Email    : ${developer.email}`);
  console.log(`Developer Password : ${SEED_DEV.password}`);
  console.log(`Developer JWT      : Bearer ${devJwtToken}`);
  console.log('----------------------------------------------------------------');
  console.log(`App ID             : ${app.id}`);
  console.log(`App Name           : ${app.name}`);
  console.log(`Client X-API-Key   : ${SEED_APP.plainApiKey}`);
  console.log('----------------------------------------------------------------');
  for (const d of seededDecks) {
    console.log(`Deck "${d.title}"`);
    console.log(`  ID               : ${d.id}`);
    console.log(`  Isi              : ${d.items} Flashcard + ${d.items} Multiple Choice (terikat sourceFlashcardId)`);
  }
  console.log('================================================================');
}

main()
  .catch((err) => {
    console.error('Gagal menjalankan seeder:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
