import { describe, expect, it } from 'vitest';
import { checkChoices, createItemSchema, updateItemSchema } from '../../src/modules/items/items.schema';

// Tes validasi skema item (tidak butuh database).
const deckId = '11111111-1111-4111-8111-111111111111';

describe('createItemSchema', () => {
  it('menerima flashcard valid', () => {
    const r = createItemSchema.safeParse({ type: 'FLASHCARD', deckId, front: 'Apple', back: 'Apel' });
    expect(r.success).toBe(true);
  });

  it('menerima MC valid', () => {
    const r = createItemSchema.safeParse({
      type: 'MULTIPLE_CHOICE', deckId, question: 'Apple = ?', choices: ['Apel', 'Jeruk', 'Pisang'], correctIndex: 0,
    });
    expect(r.success).toBe(true);
  });

  it('menolak correctIndex di luar rentang', () => {
    const r = createItemSchema.safeParse({
      type: 'MULTIPLE_CHOICE', deckId, question: 'Q', choices: ['a', 'b'], correctIndex: 2,
    });
    expect(r.success).toBe(false);
  });

  it('menolak pilihan duplikat dan URL non-http', () => {
    expect(checkChoices(['A', 'a'], 0)).not.toBeNull();
    const r = createItemSchema.safeParse({ type: 'FLASHCARD', deckId, front: 'x', back: 'y', imageUrl: 'javascript:alert(1)' });
    expect(r.success).toBe(false);
  });
});

describe('updateItemSchema', () => {
  it('menolak body kosong dan field tak dikenal', () => {
    expect(updateItemSchema.safeParse({}).success).toBe(false);
    expect(updateItemSchema.safeParse({ type: 'FLASHCARD' }).success).toBe(false);
  });
});
