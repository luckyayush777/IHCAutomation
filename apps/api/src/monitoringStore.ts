import type { ReadingIngestionRequest } from '@ihc/shared';

export interface DeviceRecord {
  id: string;
  device_code: string;
}

export interface DashboardDeviceRecord {
  id: string;
  device_code: string;
  name: string;
  location: string;
  device_type: string;
  status: string;
  last_seen_at: string | null;
}

export interface DashboardReadingRecord {
  id: number;
  device_id: string;
  metric: string;
  value: number;
  unit: string;
  quality: string;
  recorded_at: string;
  received_at: string;
}

export interface DashboardAlertRuleRecord {
  id: string;
  name: string;
  device_id: string;
  metric: string;
  minimum_value: number | null;
  maximum_value: number | null;
  duration_seconds: number;
  severity: string;
  enabled: boolean;
}

export interface DashboardAlertRecord {
  id: string;
  rule_id: string;
  device_id: string;
  status: string;
  message: string;
  trigger_value: number | null;
  triggered_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface DashboardSnapshot {
  generatedAt: string;
  devices: DashboardDeviceRecord[];
  readings: DashboardReadingRecord[];
  alertRules: DashboardAlertRuleRecord[];
  alerts: DashboardAlertRecord[];
}

export interface DashboardQuery {
  deviceCode?: string;
  from?: string;
  to?: string;
}

export interface MonitoringStore {
  findDeviceByCode(deviceCode: string): Promise<DeviceRecord | null>;
  storeReadings(
    deviceId: string,
    request: ReadingIngestionRequest,
    receivedAt: string,
  ): Promise<void>;
  getDashboardSnapshot(generatedAt: string, query?: DashboardQuery): Promise<DashboardSnapshot>;
}

interface SupabaseDeviceResponse {
  id: string;
  device_code: string;
}

export class SupabaseMonitoringStore implements MonitoringStore {
  constructor(
    private readonly supabaseUrl: string,
    private readonly secretKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async findDeviceByCode(deviceCode: string): Promise<DeviceRecord | null> {
    const query = new URLSearchParams({
      select: 'id,device_code',
      device_code: `eq.${deviceCode}`,
      limit: '1',
    });
    const response = await this.request(`devices?${query.toString()}`, { method: 'GET' });
    const body = (await response.json()) as SupabaseDeviceResponse[];

    return body[0] ?? null;
  }

  async storeReadings(
    deviceId: string,
    request: ReadingIngestionRequest,
    receivedAt: string,
  ): Promise<void> {
    const readings = request.readings.map((reading) => ({
      device_id: deviceId,
      metric: reading.metric,
      value: reading.value,
      unit: reading.unit,
      quality: reading.quality ?? 'good',
      recorded_at: reading.recordedAt,
      received_at: receivedAt,
    }));

    await this.request('readings?on_conflict=device_id,metric,recorded_at', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(readings),
    });

    await this.request(`devices?id=eq.${deviceId}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        last_seen_at: receivedAt,
        status: 'online',
      }),
    });
  }

  async getDashboardSnapshot(
    generatedAt: string,
    query: DashboardQuery = {},
  ): Promise<DashboardSnapshot> {
    const deviceQuery = new URLSearchParams({
      select: 'id,device_code,name,location,device_type,status,last_seen_at',
      order: 'device_code.asc',
    });
    if (query.deviceCode) deviceQuery.set('device_code', `eq.${query.deviceCode}`);

    const devicesResponse = await this.request(`devices?${deviceQuery.toString()}`, {
      method: 'GET',
    });
    const devices = (await devicesResponse.json()) as DashboardDeviceRecord[];
    const readingsQuery = new URLSearchParams({
      select: 'id,device_id,metric,value,unit,quality,recorded_at,received_at',
      order: 'recorded_at.desc',
      limit: '50000',
    });
    if (devices.length > 0)
      readingsQuery.set('device_id', `in.(${devices.map((device) => device.id).join(',')})`);
    else readingsQuery.set('id', 'eq.-1');
    if (query.from) readingsQuery.append('recorded_at', `gte.${query.from}`);
    if (query.to) readingsQuery.append('recorded_at', `lte.${query.to}`);

    const [readingsResponse, alertRulesResponse, alertsResponse] = await Promise.all([
      this.request(`readings?${readingsQuery.toString()}`, { method: 'GET' }),
      this.request(
        'alert_rules?select=id,name,device_id,metric,minimum_value,maximum_value,duration_seconds,severity,enabled&enabled=eq.true&order=name.asc',
        { method: 'GET' },
      ),
      this.request(
        'alerts?select=id,rule_id,device_id,status,message,trigger_value,triggered_at,acknowledged_at,resolved_at&order=triggered_at.desc&limit=50',
        { method: 'GET' },
      ),
    ]);

    const [readings, alertRules, alerts] = await Promise.all([
      readingsResponse.json() as Promise<DashboardReadingRecord[]>,
      alertRulesResponse.json() as Promise<DashboardAlertRuleRecord[]>,
      alertsResponse.json() as Promise<DashboardAlertRecord[]>,
    ]);

    return {
      generatedAt,
      devices,
      readings,
      alertRules,
      alerts,
    };
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const response = await this.fetcher(`${this.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.secretKey,
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/json',
        'user-agent': 'ihc-api/0.1.0',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase request failed with status ${response.status}`);
    }

    return response;
  }
}

export function createMonitoringStoreFromEnv(): MonitoringStore | null {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    return null;
  }

  return new SupabaseMonitoringStore(supabaseUrl, secretKey);
}
