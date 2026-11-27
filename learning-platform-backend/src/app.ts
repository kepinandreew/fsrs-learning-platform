/**
 * @file app.ts
 * @description Konfigurasi utama aplikasi Express.js: keamanan HTTP (Helmet & CORS),
 * pembatasan laju request (rate limiting), pemisahan rute Developer Dashboard (JWT)
 * dan rute Aplikasi Klien (X-API-Key), serta penanganan galat terpusat.
 */
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { buildOpenApiSpec, renderApiDocsHtml } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { apiLimiter } from './middlewares/rateLimit';
import aiRoutes from './modules/ai/ai.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import appsRoutes from './modules/apps/apps.routes';
import assetsRoutes from './modules/assets/assets.routes';
import authRoutes from './modules/auth/auth.routes';
import decksClientRoutes from './modules/decks/decks.client.routes';
import decksRoutes from './modules/decks/decks.routes';
import evaluationRoutes from './modules/evaluation/evaluation.routes';
import quizRoutes from './modules/evaluation/quiz.routes';
import reviewRoutes from './modules/evaluation/review.routes';
import progressRoutes from './modules/progress/progress.routes';
import itemsClientRoutes from './modules/items/items.client.routes';
import itemsRoutes from './modules/items/items.routes';

export function createApp() {
  const app = express();

  // Wajib untuk deployment di balik reverse-proxy Cloud (Vercel, Render, Railway, Cloudflare).
  app.set('trust proxy', 1);

  const allowedOrigins = env.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: allowedOrigins.includes('*') ? true : allowedOrigins,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'If-None-Match'],
      exposedHeaders: ['ETag'],
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  if (env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/', (_req, res) => {
    res.json({
      success: true,
      data: {
        service: 'FSRS-5 Learning Platform Backend API',
        status: 'ok',
        endpoints: ['/health', '/api/docs', '/api/openapi.json', '/api/decks', '/api/dashboard/analytics/summary'],
      },
    });
  });

  app.get('/health', (_req, res) => {
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
  });

  app.get('/api', (_req, res) => {
    res.json({ success: true, data: { service: 'FSRS-5 Learning Platform API', status: 'ok', docs: '/api/docs' } });
  });

  app.get('/api/openapi.json', (req, res) => {
    const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    res.json(buildOpenApiSpec(`${proto}://${host}`));
  });

  app.get('/api/docs', (_req, res) => {
    res.type('html').send(renderApiDocsHtml('/api/openapi.json'));
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/apps', appsRoutes);

  // --- Developer Dashboard (JWT) ---
  app.use('/api/dashboard/decks', decksRoutes);
  app.use('/api/dashboard/items', itemsRoutes);
  app.use('/api/dashboard/analytics', analyticsRoutes);
  app.use('/api/dashboard/ai', aiRoutes);

  // --- Aplikasi client (API Key) ---
  app.use('/api/decks', decksClientRoutes);
  app.use('/api/items', itemsClientRoutes);
  app.use('/api/assets', assetsRoutes);
  app.use('/api/review', reviewRoutes);
  app.use('/api/quiz', quizRoutes);
  app.use('/api/evaluation', evaluationRoutes);
  app.use('/api/progress', progressRoutes);

  // Mode Single-Server Production: sajikan build frontend + game (jika folder dist tersedia & bukan di Vercel Serverless API-only).
  const dashboardDist = path.resolve(__dirname, '../../learning-platform-dashboard/dist');
  if (!process.env.VERCEL && fs.existsSync(path.join(dashboardDist, 'index.html'))) {
    app.use(express.static(dashboardDist));
    app.get(/^(?!\/api(?:\/|$)|\/health$).*/, (_req, res) => {
      res.sendFile(path.join(dashboardDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
