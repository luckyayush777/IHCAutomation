import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('API health endpoint', () => {
  it('reports a healthy API without exposing framework headers', async () => {
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      contractVersion: 1,
      service: 'api',
      status: 'ok',
      version: '0.1.0',
    });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
