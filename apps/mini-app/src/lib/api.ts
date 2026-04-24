import type { DriverProfile, Order, Tariff, User } from "@taxi/shared";

type RoleView = "client" | "driver" | "admin";

export interface AdminDashboard {
  metrics: {
    users: number;
    drivers: number;
    clients: number;
    activeOrders: number;
    pendingDrivers: number;
    onlineDrivers: number;
  };
  activeOrders: Order[];
  pendingDrivers: DriverProfile[];
  tariffs: Tariff[];
}

export interface BootstrapPayload {
  roles: RoleView[];
  demoUsers: User[];
  demoDrivers: DriverProfile[];
  tariffs: Tariff[];
  recentOrders: Order[];
}

export interface MePayload {
  user?: User;
  driver?: DriverProfile;
  clientOrders: Order[];
  driverOrders: Order[];
  availableOrders: Order[];
  dashboard: AdminDashboard | null;
}

const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

const buildUrl = (path: string) =>
  path.startsWith("http") ? path : `${apiBase}${path}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(error?.error ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export const api = {
  getBootstrap: () => request<BootstrapPayload>("/api/bootstrap"),
  getMe: (telegramId: number, role: RoleView) =>
    request<MePayload>(`/api/me?telegramId=${telegramId}&role=${role}`),
  createOrder: (payload: Record<string, unknown>) =>
    request<Order>("/api/orders", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  cancelOrder: (orderId: string, reason: string) =>
    request<Order>(`/api/orders/${orderId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason })
    }),
  setDriverOnline: (driverId: string, isOnline: boolean) =>
    request<DriverProfile>(`/api/driver/${driverId}/online`, {
      method: "POST",
      body: JSON.stringify({ isOnline })
    }),
  acceptOrder: (orderId: string, driverId: string) =>
    request<Order>(`/api/driver/orders/${orderId}/accept`, {
      method: "POST",
      body: JSON.stringify({ driverId })
    }),
  updateDriverOrderStatus: (orderId: string, status: string) =>
    request<Order>(`/api/driver/orders/${orderId}/status`, {
      method: "POST",
      body: JSON.stringify({ status })
    }),
  reviewDriver: (driverId: string, decision: "approved" | "rejected") =>
    request(`/api/admin/drivers/${driverId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision })
    }),
  updateTariff: (payload: {
    city: string;
    minPrice: number;
    pricePerKm: number;
    pricePerMinute: number;
  }) =>
    request<Tariff>("/api/admin/tariffs", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};
