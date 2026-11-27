// =============================================================================
// Definisi Tipe Data Frontend Developer Dashboard (sinkron dengan kontrak REST API Backend)
// =============================================================================

export interface DeveloperProfile {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface AuthResponse {
  developer: DeveloperProfile;
  token: string;
}

// Entitas Aplikasi Client (Multi-client & API Key Isolation).
export interface ClientApp {
  id: string;
  name: string;
  description: string | null;
  apiKeyPrefix: string;
  isActive: boolean;
  requestRetention: number;
  fsrsParams?: number[] | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  _count?: {
    decks: number;
    users: number;
    learningItems: number;
  };
}

export interface CreatedAppKeyResponse {
  app: ClientApp;
  // Ditampilkan satu kali saja saat penerbitan / rotasi.
  apiKey: string;
}

// Entitas Deck Materi.
export interface Deck {
  id: string;
  appId: string;
  title: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: {
    learningItems: number;
  };
}

// Entitas Learning Item (Flashcard & Multiple Choice).
export type ItemType = 'FLASHCARD' | 'MULTIPLE_CHOICE';

export interface LearningItem {
  id: string;
  appId: string;
  deckId: string;
  type: ItemType;
  front: string | null;
  back: string | null;
  question: string | null;
  choices: string[] | null;
  correctIndex: number | null;
  explanation: string | null;
  sourceFlashcardId: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  contentVersion: number;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type PortableDeckItem =
  | {
      type: 'FLASHCARD';
      tempId?: string;
      front: string;
      back: string;
      tags?: string[];
      imageUrl?: string | null;
      audioUrl?: string | null;
    }
  | {
      type: 'MULTIPLE_CHOICE';
      sourceTempId?: string | null;
      sourceFront?: string | null;
      question: string;
      choices: string[];
      correctIndex: number;
      explanation?: string | null;
      tags?: string[];
      imageUrl?: string | null;
      audioUrl?: string | null;
    };

export interface DeckExportPackage {
  version: number;
  exportedAt: string;
  deck: { id: string; title: string; description: string | null };
  counts: { flashcards: number; quizzes: number; total: number };
  items: PortableDeckItem[];
}

// Entitas AI Generator.
export interface AiStatus {
  configured: boolean;
  model: string;
  maxFileMB: number;
  allowedFileTypes: string[];
}

export interface DraftFlashcard {
  tempId: string;
  front: string;
  back: string;
  tags: string[];
}

export interface DraftQuiz {
  sourceTempId: string;
  question: string;
  choices: string[];
  correctIndex: number;
  explanation: string | null;
  tags: string[];
}

export interface AiGenerateResponse {
  saved: boolean;
  verified?: boolean;
  corrections?: string[];
  model: string;
  warnings: string[];
  counts: {
    flashcards: number;
    quizzes: number;
    total: number;
  };
  draft?: {
    deckId: string;
    flashcards: DraftFlashcard[];
    quizzes: DraftQuiz[];
  };
  items?: LearningItem[];
}

export interface AiVerifyDeckChange {
  itemId: string;
  type: 'FLASHCARD' | 'MULTIPLE_CHOICE';
  reason: string;
  before: string;
  after: string;
  applied: boolean;
}

export interface AiVerifyDeckResponse {
  deckId: string;
  deckTitle: string;
  checkedCount: number;
  fixedCount: number;
  changes: AiVerifyDeckChange[];
  model: string;
}

// Entitas Monitoring & Learning Analytics (4 Indikator Analitik Pembelajaran).
export interface AnalyticsMeta {
  deckId: string;
  deckTitle: string;
  scope: 'user' | 'deck';
  totalFlashcards: number;
  generatedAt: string;
}

export interface RetentionMetric {
  averageRetention: number | null;
  activeCards: number;
  distribution: {
    critical: number;
    fading: number;
    strong: number;
  };
  perUser: Array<{
    externalUserId: string;
    displayName?: string | null;
    averageRetention: number;
    activeCards: number;
  }>;
}

export interface MasteryMetric {
  thresholdDays: number;
  totalFlashcards: number;
  masteryRatio: number | null;
  masteredCards: number;
  users: number;
  perUser: Array<{
    externalUserId: string;
    displayName?: string | null;
    masteredCards: number;
    reviewedCards: number;
    masteryRatio: number;
  }>;
}

export interface DifficultCardTopic {
  itemId: string;
  front: string | null;
  back: string | null;
  tags: string[];
  reviews: number;
  againCount: number;
  hardCount: number;
  struggleRate: number | null;
  quizAttempts: number;
  quizErrors: number;
  quizErrorRate: number | null;
  averageDifficulty: number | null;
  score: number;
}

export interface DifficultTagTopic {
  tag: string;
  cards: number;
  struggleEvents: number;
  reviews: number;
  quizErrors: number;
  quizAttempts: number;
  score: number;
}

export type CompletionStatus = 'COMPLETED' | 'ESTIMATED' | 'INSUFFICIENT_DATA';

export interface CompletionMetric {
  status: CompletionStatus;
  remainingCards: number;
  masteredPerDay: number;
  estimatedDays: number | null;
  estimatedCompletionDate: string | null;
  perUser: Array<{
    externalUserId: string;
    displayName?: string | null;
    status: CompletionStatus;
    remainingCards: number;
    masteredPerDay: number;
    estimatedDays: number | null;
    estimatedCompletionDate: string | null;
  }>;
}

export interface AnalyticsSummaryResponse {
  meta: AnalyticsMeta;
  retention: RetentionMetric;
  mastery: MasteryMetric;
  difficultTopics: {
    cards: DifficultCardTopic[];
    tags: DifficultTagTopic[];
  };
  completionTime: CompletionMetric;
}

// Entitas Monitoring Terpadu (Pengguna, Progres Belajar, CardState FSRS, & Riwayat Aktivitas).
export interface MonitoringUser {
  externalUserId: string;
  email?: string | null;
  displayName: string | null;
  points: number;
  experience: number;
  level: number;
  totalReviews: number;
  totalQuizzes: number;
  correctAnswers: number;
  wrongAnswers: number;
  quizAccuracy: number | null;
  currentStreak: number;
  longestStreak: number;
  trackedCards: number;
  dueCards: number;
  lastStudiedAt: string | null;
  lastSeenAt: string;
}

export interface MonitoringCardState {
  id: string;
  externalUserId: string;
  displayName: string | null;
  itemId: string;
  front: string;
  back: string;
  deckId: string;
  deckTitle: string;
  state: 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';
  lastRating?: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY' | null;
  priorityRank?: number;
  stability: number;
  difficulty: number;
  retrievability: number;
  reps: number;
  lapses: number;
  scheduledDays: number;
  scheduledMinutes?: number;
  elapsedDays: number;
  lastReview: string | null;
  due: string;
  isDue: boolean;
}

export interface MonitoringReviewLog {
  id: string;
  externalUserId: string;
  displayName: string | null;
  itemId: string;
  front: string;
  back: string;
  deckTitle: string;
  rating: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
  stateBefore: string;
  stateAfter: string;
  stabilityBefore: number;
  stabilityAfter: number;
  difficultyBefore: number;
  difficultyAfter: number;
  retrievability: number | null;
  scheduledDays: number;
  elapsedDays: number;
  due: string;
  responseTimeMs: number | null;
  reviewedAt: string;
}

export interface MonitoringQuizAttempt {
  id: string;
  externalUserId: string;
  displayName: string | null;
  itemId: string;
  question: string;
  deckTitle: string;
  selectedIndex: number | null;
  selectedText: string | null;
  correctIndex: number | null;
  correctText: string | null;
  isCorrect: boolean;
  score: number;
  responseTimeMs: number | null;
  answeredAt: string;
}

export interface MonitoringForecastBucket {
  dayOffset: number;
  date: string;
  label: string;
  count: number;
  overdueCount: number;
}

export interface MonitoringResponse {
  app: { id: string; name: string; requestRetention: number } | null;
  deck: { id: string; title: string; appId: string } | null;
  overview: {
    totalUsers: number;
    totalFlashcards: number;
    totalMultipleChoice: number;
    activeCardsCount: number;
    dueNowCount: number;
    totalReviews: number;
    totalQuizAttempts: number;
    overallQuizAccuracy: number | null;
  };
  users: MonitoringUser[];
  cardStates: MonitoringCardState[];
  dueForecast14d?: MonitoringForecastBucket[];
  recentReviews: MonitoringReviewLog[];
  recentQuizzes: MonitoringQuizAttempt[];
  generatedAt: string;
}

// Entitas Simulator & Validator FSRS Engine.
export type FsrsRating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';

export interface FsrsSimulateInitialCard {
  label?: string;
  state: 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING';
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  hardCount?: number;
}

export interface FsrsSimulateStepInput {
  rating: FsrsRating;
  elapsedDays?: number;
}

export interface FsrsSimulateTraceRow {
  step: number;
  rating: FsrsRating;
  reviewedAt: string;
  elapsedDays: number;
  stateBefore: string;
  stateAfter: string;
  retrievabilityBefore: number | null;
  difficultyBefore: number;
  difficultyAfter: number;
  stabilityBefore: number;
  stabilityAfter: number;
  scheduledDays: number;
  scheduledMinutes: number;
  due: string;
  reps: number;
  lapses: number;
}

export interface FsrsSimulatePreviewOption {
  state: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  scheduledMinutes: number;
  due: string;
}

export interface FsrsSimulateResponse {
  requestRetention: number;
  initialCard?: FsrsSimulateInitialCard | null;
  finalCard: {
    state: string;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    lastReview: string | null;
    due: string;
  };
  trace: FsrsSimulateTraceRow[];
  nextPreviewAtDue: Record<FsrsRating, FsrsSimulatePreviewOption>;
  forgettingCurve: Array<{ day: number; retrievability: number }>;
}

export interface ShiftDueResponse {
  shiftedDays: number;
  updatedCards: number;
  dueNowCount: number;
  scopeTitle: string;
}
