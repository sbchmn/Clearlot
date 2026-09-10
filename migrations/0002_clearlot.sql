-- Clearlot domain schema. Additive, idempotent. user_id is TEXT.

create table if not exists profiles (
  user_id text primary key,
  display_name text not null default '',
  is_admin boolean not null default false,
  telegram_user_id text unique,
  telegram_chat_id text,
  discord_user_id text unique,
  ship_name text,
  ship_line1 text,
  ship_line2 text,
  ship_city text,
  ship_region text,
  ship_postal text,
  ship_country text not null default 'US',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_methods (
  code text primary key,
  kind text not null check (kind in ('crypto', 'manual')),
  label text not null,
  enabled boolean not null default false,
  wallet_address text,
  handle text,
  instructions text,
  min_confirmations integer not null default 1,
  asset_id text,
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id serial primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  sku text,
  image_seed integer not null default 1,
  stock_qty integer not null default 0 check (stock_qty >= 0),
  always_on_enabled boolean not null default false,
  always_on_price_cents integer not null default 0 check (always_on_price_cents >= 0),
  active boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_active_idx on products (active, always_on_enabled);

create table if not exists product_tests (
  id serial primary key,
  product_id integer not null references products(id) on delete cascade,
  test_type text not null,
  custom_label text,
  payer text not null check (payer in ('admin', 'group_funded')),
  creates text not null check (creates in ('group_test', 'public_result', 'both'))
);

create table if not exists group_buys (
  id serial primary key,
  slug text not null unique,
  title text not null,
  description text not null default '',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'live', 'closed', 'fulfilled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  admin_fee_cents integer not null default 0 check (admin_fee_cents >= 0),
  tests_spawned boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists group_buys_status_idx on group_buys (status, starts_at, ends_at);

create table if not exists shipping_tiers (
  id serial primary key,
  scope text not null check (scope in ('catalog', 'group_buy')),
  group_buy_id integer references group_buys(id) on delete cascade,
  min_items integer not null default 1,
  max_items integer,
  price_cents integer not null default 0 check (price_cents >= 0),
  label text not null default 'Shipping'
);

create table if not exists group_buy_items (
  id serial primary key,
  group_buy_id integer not null references group_buys(id) on delete cascade,
  product_id integer not null references products(id) on delete restrict,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  cap_qty integer not null default 0 check (cap_qty >= 0),
  sold_qty integer not null default 0 check (sold_qty >= 0),
  unique (group_buy_id, product_id)
);

create table if not exists group_buy_item_tests (
  id serial primary key,
  group_buy_item_id integer not null references group_buy_items(id) on delete cascade,
  test_type text not null,
  custom_label text,
  payer text not null check (payer in ('admin', 'group_funded')),
  creates text not null check (creates in ('group_test', 'public_result', 'both'))
);

create table if not exists carts (
  user_id text primary key,
  source text not null check (source in ('catalog', 'group_buy')),
  group_buy_id integer references group_buys(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists cart_items (
  id serial primary key,
  user_id text not null references carts(user_id) on delete cascade,
  product_id integer not null references products(id),
  group_buy_item_id integer references group_buy_items(id) on delete cascade,
  qty integer not null check (qty > 0),
  unique (user_id, product_id, group_buy_item_id)
);
create index if not exists cart_items_user_idx on cart_items (user_id);

create table if not exists orders (
  id serial primary key,
  public_id text not null unique,
  user_id text not null,
  channel text not null default 'web' check (channel in ('web', 'telegram', 'discord')),
  source text not null check (source in ('catalog', 'group_buy')),
  group_buy_id integer references group_buys(id),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment', 'pending_admin', 'verified', 'packing', 'shipped', 'cancelled')),
  subtotal_cents integer not null,
  admin_fee_cents integer not null default 0,
  shipping_cents integer not null default 0,
  shipping_label text,
  total_cents integer not null,
  payment_code text not null,
  crypto_asset text,
  crypto_amount text,
  quote_usd_rate text,
  quote_locked_at timestamptz,
  txid text,
  proof_mime text,
  proof_data text,
  auto_verified boolean not null default false,
  verification_note text,
  ship_name text,
  ship_line1 text,
  ship_city text,
  ship_region text,
  ship_postal text,
  ship_country text,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (txid)
);
create index if not exists orders_user_idx on orders (user_id, created_at desc);
create index if not exists orders_status_idx on orders (status, created_at desc);

create table if not exists order_lines (
  id serial primary key,
  order_id integer not null references orders(id) on delete cascade,
  product_id integer not null,
  group_buy_item_id integer,
  name_snapshot text not null,
  qty integer not null,
  unit_price_cents integer not null
);

create table if not exists payment_verifications (
  id serial primary key,
  order_id integer not null references orders(id) on delete cascade,
  user_id text not null,
  txid text not null,
  chain text not null,
  result text not null,
  expected_address text,
  expected_amount text,
  observed_amount text,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists payment_verifications_order_idx on payment_verifications (order_id);

create table if not exists verify_rate (
  user_id text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, window_start)
);

create table if not exists fx_rates (
  asset text primary key,
  usd numeric not null,
  fetched_at timestamptz not null default now()
);

create table if not exists bot_sessions (
  user_id text primary key,
  channel text not null default 'web',
  step text not null default 'menu',
  payload jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists group_tests (
  id serial primary key,
  title text not null,
  description text,
  status text not null default 'recruiting'
    check (status in ('recruiting', 'ready_for_payment', 'testing', 'closed')),
  vendor text,
  batch_number text,
  compound text,
  size_label text,
  lab_name text,
  lab_details jsonb,
  total_lab_cost numeric not null default 0,
  shipping_cost numeric not null default 0,
  donor_shipping_cost numeric not null default 0,
  refund_per_donor numeric not null default 20,
  results_link text,
  results_note text,
  source text not null default 'manual' check (source in ('manual', 'group_buy')),
  source_group_buy_id integer references group_buys(id),
  source_product_id integer references products(id),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists participations (
  id serial primary key,
  group_test_id integer not null references group_tests(id) on delete cascade,
  user_id text not null,
  approved boolean not null default false,
  denied boolean not null default false,
  denied_reason text,
  vial_donor boolean not null default false,
  amount_owed numeric not null default 0,
  amount_paid numeric not null default 0,
  paid_lab boolean not null default false,
  order_status text not null default 'pending',
  notes text,
  requested_at timestamptz not null default now(),
  unique (group_test_id, user_id)
);
create index if not exists participations_user_idx on participations (user_id);
create index if not exists participations_test_idx on participations (group_test_id);

create table if not exists public_results (
  id serial primary key,
  title text not null,
  summary text,
  results_link text,
  item_results jsonb,
  published boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'group_buy')),
  source_group_buy_id integer,
  source_product_id integer,
  created_by text not null,
  posted_at timestamptz not null default now()
);

create table if not exists telegram_link_tokens (
  id serial primary key,
  user_id text not null,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists app_meta (
  key text primary key,
  value text not null
);

create table if not exists bot_config (
  key text primary key,
  value text
);

-- Seed settlement rails (disabled until an admin enters wallets / handles).
insert into payment_methods (code, kind, label, enabled, asset_id, min_confirmations, instructions)
values
  ('btc', 'crypto', 'Bitcoin', false, 'bitcoin', 1, 'Send the exact quoted BTC amount. Submit the transaction ID and a screenshot.'),
  ('etc', 'crypto', 'Ethereum Classic', false, 'ethereum-classic', 12, 'Send the exact quoted ETC amount on Ethereum Classic (not ETH).'),
  ('sol', 'crypto', 'Solana', false, 'solana', 1, 'Send the exact quoted SOL amount.'),
  ('tron', 'crypto', 'TRON', false, 'tron', 1, 'Send the exact quoted TRX amount.'),
  ('cashapp', 'manual', 'Cash App', false, null, 0, 'Send the USD total. Upload a payment screenshot. An admin will confirm.'),
  ('venmo', 'manual', 'Venmo', false, null, 0, 'Send the USD total. Upload a payment screenshot. An admin will confirm.')
on conflict (code) do nothing;
