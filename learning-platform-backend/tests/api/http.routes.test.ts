import http from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    developer: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === '00000000-0000-4000-8000-000000000099'
          ? { id: where.id, email: 'dev@test.local', isActive: true }
          : null,
      ),
    },
    app: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
  },
}));

import { createApp } from '../../src/app';
import { env } from '../../src/config/env';

describe('Express HTTP Routes, OpenAPI 3.0 Docs, & Multi-Tenant Auth Middleware', () => {
  let server: http.Server;
  let baseUrl = '';
  let validJwt = '';

  beforeAll(async () => {
    const app = createApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    validJwt = jwt.sign(
      { sub: '00000000-0000-4000-8000-000000000099', email: 'dev@test.local' },
      env.JWT_SECRET,
      { expiresIn: '1h' },
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  it('menyajikan status kesehatan server pada GET /health', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
  });

  it('menyajikan spesifikasi OpenAPI 3.0.3 valid pada GET /api/openapi.json dan UI pada GET /api/docs', async () => {
    const specRes = await fetch(`${baseUrl}/api/openapi.json`);
    expect(specRes.status).toBe(200);
    const spec = await specRes.json();
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.paths['/api/evaluation/due']).toBeDefined();
    expect(spec.paths['/api/dashboard/decks/{id}/import']).toBeDefined();

    const docsRes = await fetch(`${baseUrl}/api/docs`);
    expect(docsRes.status).toBe(200);
    const html = await docsRes.text();
    expect(html).toContain('OpenAPI 3.0.3');
  });

  it('menolak akses endpoint klien tanpa X-API-Key maupun dengan X-API-Key tidak sah (HTTP 401)', async () => {
    const noKey = await fetch(`${baseUrl}/api/items`);
    expect(noKey.status).toBe(401);

    const badKey = await fetch(`${baseUrl}/api/items`, {
      headers: { 'X-API-Key': 'lp_live_invalid_key_test' },
    });
    expect(badKey.status).toBe(401);
  });

  it('menolak akses endpoint dashboard tanpa Bearer JWT atau dengan JWT palsu (HTTP 401)', async () => {
    const noJwt = await fetch(`${baseUrl}/api/dashboard/analytics/summary`);
    expect(noJwt.status).toBe(401);

    const badJwt = await fetch(`${baseUrl}/api/dashboard/analytics/summary`, {
      headers: { Authorization: 'Bearer token.palsu.tidakvalid' },
    });
    expect(badJwt.status).toBe(401);
  });

  it('memvalidasi 19 bobot fsrsParams pada PATCH /api/apps/:id dan menjalankan simulator FSRS via HTTP', async () => {
    const badPatch = await fetch(`${baseUrl}/api/apps/00000000-0000-4000-8000-000000000001`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validJwt}`,
      },
      body: JSON.stringify({ fsrsParams: [0.4, 1.2, 3.1] }), // bukan 19 angka -> harus ditolak 400
    });
    expect(badPatch.status).toBe(400);

    const simRes = await fetch(`${baseUrl}/api/dashboard/analytics/fsrs-simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validJwt}`,
      },
      body: JSON.stringify({
        requestRetention: 0.9,
        steps: [{ rating: 'GOOD' }, { rating: 'EASY' }],
      }),
    });
    expect(simRes.status).toBe(200);
    const simJson = await simRes.json();
    expect(simJson.success).toBe(true);
    expect(simJson.data.trace).toHaveLength(2);
  });
});
