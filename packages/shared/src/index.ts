export const HEALTH_CONTRACT_VERSION = 1 as const;

export type ServiceName = 'api' | 'dashboard' | 'simulator';
export type HealthStatus = 'ok' | 'degraded';

export interface HealthResponse {
  contractVersion: typeof HEALTH_CONTRACT_VERSION;
  service: ServiceName;
  status: HealthStatus;
  timestamp: string;
  uptimeSeconds: number;
  version: string;
}

export function isHealthy(response: HealthResponse): boolean {
  return response.status === 'ok';
}
