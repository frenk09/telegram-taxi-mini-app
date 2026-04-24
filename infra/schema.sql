create table if not exists users (
  id uuid primary key,
  telegram_id bigint not null unique,
  role varchar(20) not null check (role in ('client', 'driver', 'admin')),
  name varchar(255) not null,
  phone varchar(50),
  city varchar(120),
  status varchar(30) not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists drivers (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  car_brand varchar(120) not null,
  car_model varchar(120) not null,
  car_number varchar(40) not null,
  car_color varchar(80) not null,
  documents jsonb not null default '{}'::jsonb,
  is_verified boolean not null default false,
  is_online boolean not null default false,
  rating numeric(3, 2) not null default 5.0,
  created_at timestamptz not null default now()
);

create table if not exists tariffs (
  id uuid primary key,
  city varchar(120) not null unique,
  min_price integer not null,
  price_per_km integer not null,
  price_per_minute integer not null,
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key,
  client_id uuid not null references users(id),
  driver_id uuid references drivers(id),
  city varchar(120) not null,
  from_address text not null,
  to_address text not null,
  from_lat numeric(10, 7) not null,
  from_lng numeric(10, 7) not null,
  to_lat numeric(10, 7) not null,
  to_lng numeric(10, 7) not null,
  distance_km numeric(8, 2) not null default 0,
  duration_min integer not null default 0,
  price integer not null,
  status varchar(40) not null,
  payment_method varchar(30) not null,
  comment text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists reviews (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  from_user_id uuid not null references users(id) on delete cascade,
  to_user_id uuid not null references users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_orders_client_id on orders(client_id);
create index if not exists idx_orders_driver_id on orders(driver_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_drivers_user_id on drivers(user_id);
