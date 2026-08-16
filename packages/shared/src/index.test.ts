import { describe, expect, it } from 'vitest';

import {
  HEALTH_CONTRACT_VERSION,
  INGESTION_CONTRACT_VERSION,
  isHealthy,
  validateReadingIngestionRequest,
  type HealthResponse,
} from './index.js';

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

describe('reading ingestion contract', () => {
  const now = new Date('2026-08-16T09:30:00.000Z');

  it('accepts a valid telemetry batch', () => {
    const result = validateReadingIngestionRequest(
      {
        contractVersion: INGESTION_CONTRACT_VERSION,
        deviceCode: 'fridge_male_ward',
        readings: [
          {
            metric: 'temperature',
            value: 4.2,
            unit: 'celsius',
            recordedAt: '2026-08-16T09:29:30.000Z',
          },
        ],
      },
      now,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        deviceCode: 'fridge_male_ward',
        readings: [{ quality: 'good' }],
      },
    });
  });

  it('rejects mismatched metric units and impossible values', () => {
    const result = validateReadingIngestionRequest(
      {
        deviceCode: 'male_ward',
        readings: [
          {
            metric: 'humidity',
            value: 120,
            unit: 'celsius',
            recordedAt: '2026-08-16T09:29:30.000Z',
          },
        ],
      },
      now,
    );

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'readings[0].unit must be percent_rh for humidity',
        'readings[0].value is outside the supported humidity range',
      ]),
    );
  });

  it('rejects stale and future timestamps', () => {
    expect(
      validateReadingIngestionRequest(
        {
          deviceCode: 'male_ward',
          readings: [
            {
              metric: 'temperature',
              value: 30,
              unit: 'celsius',
              recordedAt: '2026-08-15T09:29:00.000Z',
            },
          ],
        },
        now,
      ).errors,
    ).toContain('readings[0].recordedAt is too old');

    expect(
      validateReadingIngestionRequest(
        {
          deviceCode: 'male_ward',
          readings: [
            {
              metric: 'temperature',
              value: 30,
              unit: 'celsius',
              recordedAt: '2026-08-16T09:36:00.000Z',
            },
          ],
        },
        now,
      ).errors,
    ).toContain('readings[0].recordedAt is too far in the future');
  });
});
