import { describe, expect, it } from 'vitest';

import { HEALTH_CONTRACT_VERSION, isHealthy, type HealthResponse } from './index.js';

describe('health contract', () => {
  it('recognizes a healthy service', () => {
    const response: HealthResponse = {
      contractVersion: HEALTH_CONTRACT_VERSION,
      service: 'api',
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: 1,
      version: '0.1.0',
    };

    expect(isHealthy(response)).toBe(true);
  });
});
