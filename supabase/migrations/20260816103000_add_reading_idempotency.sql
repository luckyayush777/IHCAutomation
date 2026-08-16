create unique index if not exists readings_device_metric_recorded_at_unique_idx
  on public.readings (device_id, metric, recorded_at);
