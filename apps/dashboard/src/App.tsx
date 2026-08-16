import { useEffect, useState } from 'react';

import type { HealthResponse } from '@ihc/shared';

type ConnectionState = 'checking' | 'online' | 'offline';

interface ServiceState {
  label: string;
  endpoint: string;
  state: ConnectionState;
  detail: string;
}

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
const simulatorUrl = import.meta.env.VITE_SIMULATOR_URL ?? 'http://localhost:4100';

const initialServices: ServiceState[] = [
  {
    label: 'Ingestion API',
    endpoint: `${apiUrl}/health`,
    state: 'checking',
    detail: 'Checking API process',
  },
  {
    label: 'Sensor simulator',
    endpoint: `${simulatorUrl}/health`,
    state: 'checking',
    detail: 'Checking simulator process',
  },
];

async function checkService(service: ServiceState): Promise<ServiceState> {
  try {
    const response = await fetch(service.endpoint, { signal: AbortSignal.timeout(3000) });
    const health = (await response.json()) as HealthResponse;

    if (!response.ok || health.status !== 'ok') {
      throw new Error('Service reported an unhealthy state');
    }

    return {
      ...service,
      state: 'online',
      detail: `Online, version ${health.version}`,
    };
  } catch {
    return {
      ...service,
      state: 'offline',
      detail: 'Not reachable on this computer',
    };
  }
}

export function App() {
  const [services, setServices] = useState(initialServices);

  useEffect(() => {
    let active = true;

    async function refresh() {
      const updated = await Promise.all(initialServices.map(checkService));
      if (active) setServices(updated);
    }

    void refresh();
    const interval = window.setInterval(() => void refresh(), 10_000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  const allOnline = services.every((service) => service.state === 'online');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">
          IH
        </div>
        <div>
          <p className="eyebrow">Institute Health Centre</p>
          <h1>Environmental Monitor</h1>
        </div>
        <span className="phase-badge">Foundation</span>
      </header>

      <main>
        <section className="status-intro" aria-labelledby="foundation-title">
          <div>
            <p className="section-kicker">Phase 1 status</p>
            <h2 id="foundation-title">The application foundation is ready.</h2>
            <p className="intro-copy">
              The dashboard, ingestion API, and sensor simulator now run as separate services.
              Database connectivity arrives in Phase 2.
            </p>
          </div>
          <div className={`overall-status ${allOnline ? 'is-online' : ''}`}>
            <span className="status-light" aria-hidden="true" />
            <div>
              <strong>
                {allOnline ? 'All local services online' : 'Waiting for local services'}
              </strong>
              <span>Automatic check every 10 seconds</span>
            </div>
          </div>
        </section>

        <section className="service-section" aria-labelledby="services-title">
          <div className="section-heading">
            <h2 id="services-title">Local services</h2>
            <span>
              {services.filter((service) => service.state === 'online').length} of 2 online
            </span>
          </div>

          <div className="service-grid">
            {services.map((service) => (
              <article className="service-card" key={service.label}>
                <div className="service-card-heading">
                  <span className={`service-indicator is-${service.state}`} aria-hidden="true" />
                  <h3>{service.label}</h3>
                  <span className={`state-label is-${service.state}`}>{service.state}</span>
                </div>
                <p>{service.detail}</p>
                <code>{service.endpoint}</code>
              </article>
            ))}
          </div>
        </section>

        <section className="next-band" aria-labelledby="next-title">
          <p className="section-kicker">Next milestone</p>
          <h2 id="next-title">Secure Supabase database setup</h2>
          <p>
            Phase 2 adds the device registry, readings, alert rules, public read-only access, and
            Row Level Security policies.
          </p>
        </section>
      </main>

      <footer>
        <span>IHC Automation</span>
        <span>Local development environment</span>
      </footer>
    </div>
  );
}
