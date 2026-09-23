import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/utils/jwt';

const app = createApp();

describe('API — DB-free security surface', () => {
  it('GET /health → 200 success envelope', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('unknown route → 404 error envelope', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('login with invalid body → 400 validation', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('protected route without a token → 401', async () => {
    const res = await request(app).get('/api/v1/trust/proof-summary');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('payments webhook without a signature → 401', async () => {
    const res = await request(app).post('/api/v1/payments/webhook').send({ event: 'payment.captured' });
    expect(res.status).toBe(401);
  });

  it('create payment order without auth → 401', async () => {
    const res = await request(app).post('/api/v1/payments/orders').send({});
    expect(res.status).toBe(401);
  });

  it('create payment order WITH a valid token but no gateway keys → 503 (fail closed)', async () => {
    const { token } = signAccessToken({
      sub: '11111111-1111-1111-1111-111111111111',
      email: 'buyer@example.com',
      role: 'job_seeker',
    });
    const res = await request(app)
      .post('/api/v1/payments/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ serviceId: 'referral-session', referrerId: '22222222-2222-2222-2222-222222222222' });
    expect(res.status).toBe(503);
    expect(String(res.body.error)).toContain('not configured');
  });
});
