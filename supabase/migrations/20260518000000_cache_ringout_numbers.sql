alter table ringcentral_integrations
add column if not exists cached_ringout_numbers text;

comment on column ringcentral_integrations.cached_ringout_numbers is
  'JSON-encoded array of RingCentralPhoneNumber objects, used as cache when fetch fails';
