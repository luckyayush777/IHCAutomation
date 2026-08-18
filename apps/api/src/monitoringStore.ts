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

export interface DashboardDoctorRecord {
  id: string;
  doctor_code: string;
  display_name: string;
  role: string;
  department: string | null;
  room: string | null;
  display_order: number;
  is_active: boolean;
}

export interface DashboardDoctorAvailabilityRecord {
  id: string;
  doctor_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  availability_type: 'available' | 'on_call' | 'appointment_only' | 'unavailable';
  note: string | null;
  valid_from: string | null;
  valid_until: string | null;
}

export interface DashboardSnapshot {
  generatedAt: string;
  devices: DashboardDeviceRecord[];
  readings: DashboardReadingRecord[];
  alertRules: DashboardAlertRuleRecord[];
  alerts: DashboardAlertRecord[];
  doctors: DashboardDoctorRecord[];
  doctorAvailability: DashboardDoctorAvailabilityRecord[];
}

export interface DashboardQuery {
  deviceCode?: string;
  from?: string;
  to?: string;
}

export interface DoctorAvailabilityInput {
  weekday: number;
  startTime: string;
  endTime: string;
  availabilityType: 'available' | 'on_call' | 'appointment_only' | 'unavailable';
  note?: string;
  validFrom?: string;
  validUntil?: string;
}

export interface DoctorRosterInput {
  doctorCode: string;
  displayName: string;
  role: string;
  department?: string;
  room?: string;
  displayOrder: number;
  isActive: boolean;
  availability: DoctorAvailabilityInput[];
}

export interface MonitoringStore {
  findDeviceByCode(deviceCode: string): Promise<DeviceRecord | null>;
  storeReadings(
    deviceId: string,
    request: ReadingIngestionRequest,
    receivedAt: string,
  ): Promise<void>;
  evaluateDeviceAlerts(deviceId: string, evaluatedAt: string): Promise<void>;
  evaluateOfflineAlerts(evaluatedAt: string, deviceId?: string): Promise<void>;
  getDashboardSnapshot(generatedAt: string, query?: DashboardQuery): Promise<DashboardSnapshot>;
  getDoctorRoster(): Promise<{
    doctors: DashboardDoctorRecord[];
    doctorAvailability: DashboardDoctorAvailabilityRecord[];
  }>;
  upsertDoctorRosterEntry(input: DoctorRosterInput): Promise<void>;
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

  async evaluateDeviceAlerts(deviceId: string, evaluatedAt: string): Promise<void> {
    await this.request('rpc/evaluate_device_alerts', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ p_device_id: deviceId, p_evaluated_at: evaluatedAt }),
    });
    await this.evaluateOfflineAlerts(evaluatedAt, deviceId);
  }

  async evaluateOfflineAlerts(evaluatedAt: string, deviceId?: string): Promise<void> {
    await this.request('rpc/evaluate_offline_alerts', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        p_evaluated_at: evaluatedAt,
        p_device_id: deviceId ?? null,
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

    const [
      readingsResponse,
      alertRulesResponse,
      alertsResponse,
      doctorsResponse,
      doctorAvailabilityResponse,
    ] = await Promise.all([
      this.request(`readings?${readingsQuery.toString()}`, { method: 'GET' }),
      this.request(
        'alert_rules?select=id,name,device_id,metric,minimum_value,maximum_value,duration_seconds,severity,enabled&enabled=eq.true&order=name.asc',
        { method: 'GET' },
      ),
      this.request(
        'alerts?select=id,rule_id,device_id,status,message,trigger_value,triggered_at,acknowledged_at,resolved_at&order=triggered_at.desc&limit=50',
        { method: 'GET' },
      ),
      this.request(
        'doctors?select=id,doctor_code,display_name,role,department,room,display_order,is_active&is_active=eq.true&order=display_order.asc,display_name.asc',
        { method: 'GET' },
      ),
      this.request(
        'doctor_availability?select=id,doctor_id,weekday,start_time,end_time,availability_type,note,valid_from,valid_until&order=weekday.asc,start_time.asc',
        { method: 'GET' },
      ),
    ]);

    const [readings, alertRules, alerts, doctors, doctorAvailability] = await Promise.all([
      readingsResponse.json() as Promise<DashboardReadingRecord[]>,
      alertRulesResponse.json() as Promise<DashboardAlertRuleRecord[]>,
      alertsResponse.json() as Promise<DashboardAlertRecord[]>,
      doctorsResponse.json() as Promise<DashboardDoctorRecord[]>,
      doctorAvailabilityResponse.json() as Promise<DashboardDoctorAvailabilityRecord[]>,
    ]);

    return {
      generatedAt,
      devices,
      readings,
      alertRules,
      alerts,
      doctors,
      doctorAvailability,
    };
  }

  async getDoctorRoster() {
    const [doctorsResponse, availabilityResponse] = await Promise.all([
      this.request(
        'doctors?select=id,doctor_code,display_name,role,department,room,display_order,is_active&order=display_order.asc,display_name.asc',
        { method: 'GET' },
      ),
      this.request(
        'doctor_availability?select=id,doctor_id,weekday,start_time,end_time,availability_type,note,valid_from,valid_until&order=weekday.asc,start_time.asc',
        { method: 'GET' },
      ),
    ]);
    const [doctors, doctorAvailability] = await Promise.all([
      doctorsResponse.json() as Promise<DashboardDoctorRecord[]>,
      availabilityResponse.json() as Promise<DashboardDoctorAvailabilityRecord[]>,
    ]);
    return { doctors, doctorAvailability };
  }

  async upsertDoctorRosterEntry(input: DoctorRosterInput): Promise<void> {
    await this.request('rpc/upsert_doctor_roster_entry', {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        p_doctor: {
          doctorCode: input.doctorCode,
          displayName: input.displayName,
          role: input.role,
          department: input.department ?? '',
          room: input.room ?? '',
          displayOrder: input.displayOrder,
          isActive: input.isActive,
        },
        p_slots: input.availability,
      }),
    });
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
