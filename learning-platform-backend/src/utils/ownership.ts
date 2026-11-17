import { prisma } from '../config/prisma';
import { ApiError } from './ApiError';

// Helper kepemilikan: memastikan resource benar-benar milik developer yang sedang login.
// Dengan memfilter lewat relasi app.developerId, developer A tidak bisa menyentuh data developer B.
// Resource milik orang lain sengaja dibalas 404 (bukan 403) agar keberadaannya tidak bocor.

// Aplikasi milik developer.
export async function getOwnedApp(developerId: string, appId: string) {
  const app = await prisma.app.findFirst({ where: { id: appId, developerId } });
  if (!app) throw ApiError.notFound('Aplikasi tidak ditemukan');
  return app;
}

// Deck milik developer (lewat app).
export async function getOwnedDeck(developerId: string, deckId: string) {
  const deck = await prisma.deck.findFirst({ where: { id: deckId, app: { developerId } } });
  if (!deck) throw ApiError.notFound('Deck tidak ditemukan');
  return deck;
}

// Learning item milik developer (lewat app).
export async function getOwnedItem(developerId: string, itemId: string) {
  const item = await prisma.learningItem.findFirst({ where: { id: itemId, app: { developerId } } });
  if (!item) throw ApiError.notFound('Learning item tidak ditemukan');
  return item;
}
