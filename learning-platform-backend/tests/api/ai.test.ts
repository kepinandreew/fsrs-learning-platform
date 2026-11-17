import { describe, expect, it } from 'vitest';
import { applyVerifiedDraft, buildQuizzes, sanitizeFlashcards } from '../../src/modules/ai/ai.draft';
import { commitSchema, generateSchema, verifyDeckSchema } from '../../src/modules/ai/ai.schema';

// Unit test logika murni & skema validasi modul AI Generator (tanpa jaringan/database).
const deckId = '11111111-1111-4111-8111-111111111111';

describe('sanitizeFlashcards', () => {
  it('membersihkan spasi, membuang duplikat & item kosong, serta memberi tempId berurutan', () => {
    const raw = {
      flashcards: [
        { front: '  Apple ', back: ' Apel ', tags: ['Fruit', 'FRUIT', 'food'] },
        { front: 'apple', back: 'Duplikat huruf kecil' }, // harus dibuang karena duplikat
        { front: '   ', back: 'Kosong' }, // harus dibuang
        { front: 'Banana', back: 'Pisang', tags: ['fruit'] },
      ],
    };

    const res = sanitizeFlashcards(raw, 10);
    expect(res.flashcards).toHaveLength(2);
    expect(res.flashcards[0]).toEqual({
      tempId: 'f1',
      front: 'Apple',
      back: 'Apel',
      tags: ['fruit', 'food'],
    });
    expect(res.flashcards[1]!.tempId).toBe('f2');
    expect(res.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe('buildQuizzes', () => {
  const flashcards = [
    { tempId: 'f1', front: 'Apple', back: 'Apel', tags: ['fruit'] },
    { tempId: 'f2', front: 'Cat', back: 'Kucing', tags: ['animal'] },
  ];

  it('menyusun pilihan ganda beserta distractor unik, mengikat sourceTempId, dan menghitung correctIndex', () => {
    const raw = {
      quizzes: [
        {
          sourceTempId: 'f1',
          question: 'Apa bahasa Indonesia dari Apple?',
          correctAnswer: 'Apel',
          distractors: ['Jeruk', 'Mangga', 'Pisang', 'Apel'], // duplikat jawaban benar otomatis dibuang
          explanation: 'Apple berarti apel.',
        },
        {
          sourceTempId: 'f999', // tidak ada di flashcards -> harus dibuang
          question: 'Halusinasi?',
          correctAnswer: 'A',
          distractors: ['B', 'C'],
        },
      ],
    };

    // Gunakan fungsi rand deterministik agar urutan shuffle dapat diprediksi.
    const { quizzes, warnings } = buildQuizzes(raw, flashcards, 4, () => 0);
    expect(quizzes).toHaveLength(1);
    const q = quizzes[0]!;
    expect(q.sourceTempId).toBe('f1');
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.correctIndex]).toBe('Apel');
    expect(warnings.some((w) => w.includes('f999'))).toBe(true);
  });
});

describe('generateSchema & commitSchema', () => {
  it('generateSchema menyetel save=true secara default', () => {
    const parsed = generateSchema.parse({ deckId, text: 'Materi kosakata bahasa Inggris dasar.' });
    expect(parsed.save).toBe(true);
    expect(parsed.includeQuiz).toBe(true);
    expect(parsed.choicesCount).toBe(4);
  });

  it('commitSchema memvalidasi kecocokan sourceTempId ke daftar flashcards', () => {
    const valid = commitSchema.safeParse({
      deckId,
      flashcards: [{ tempId: 'f1', front: 'Dog', back: 'Anjing', tags: ['animal'] }],
      quizzes: [
        {
          sourceTempId: 'f1',
          question: 'Dog artinya?',
          choices: ['Anjing', 'Kucing', 'Burung'],
          correctIndex: 0,
        },
      ],
    });
    expect(valid.success).toBe(true);

    const invalidRef = commitSchema.safeParse({
      deckId,
      flashcards: [{ tempId: 'f1', front: 'Dog', back: 'Anjing' }],
      quizzes: [
        {
          sourceTempId: 'f2', // tidak ada di flashcards
          question: 'Dog artinya?',
          choices: ['Anjing', 'Kucing'],
          correctIndex: 0,
        },
      ],
    });
    expect(invalidRef.success).toBe(false);
  });

  it('applyVerifiedDraft menerapkan koreksi ejaan bahasa Prancis & verifyDeckSchema valid', () => {
    const orig = [{ tempId: 'f1', front: 'Le kanguru', back: 'Kangguru', tags: ['hewan'] }];
    const verified = applyVerifiedDraft(
      {
        flashcards: [{ tempId: 'f1', front: 'Le kangourou', back: 'Kanguru', tags: ['hewan'] }],
        quizzes: [
          {
            sourceTempId: 'f1',
            question: 'Apa arti kata Bahasa Prancis "Le kangourou"?',
            correctAnswer: 'Kanguru',
            distractors: ['Singa', 'Beruang', 'Serigala'],
            explanation: '"Le kangourou" berarti kanguru.',
          },
        ],
        corrections: ['Memperbaiki ejaan Prancis "Le kanguru" menjadi "Le kangourou" dan KBBI "Kanguru".'],
      },
      orig,
      4,
      () => 0,
    );

    expect(verified.flashcards[0]!.front).toBe('Le kangourou');
    expect(verified.flashcards[0]!.back).toBe('Kanguru');
    expect(verified.quizzes[0]!.question).toContain('Bahasa Prancis');
    expect(verified.corrections).toHaveLength(1);

    const parsedVerify = verifyDeckSchema.parse({ deckId });
    expect(parsedVerify.autoFix).toBe(true);
  });
});
