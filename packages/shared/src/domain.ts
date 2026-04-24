export type UserRole = "client" | "driver" | "admin";
export type UserStatus = "active" | "blocked" | "pending_review";
export type PaymentMethod = "cash" | "transfer" | "card";

export type OrderStatus =
  | "created"
  | "searching_driver"
  | "driver_assigned"
  | "driver_on_the_way"
  | "driver_arrived"
  | "trip_started"
  | "trip_completed"
  | "cancelled_by_client"
  | "cancelled_by_driver"
  | "cancelled_by_admin";

export interface User {
  id: string;
  telegramId: number;
  role: UserRole;
  name: string;
  phone: string;
  city: string;
  status: UserStatus;
  createdAt: string;
}

export interface DriverDocuments {
  carPhotoUrl?: string;
  driverLicenseUrl?: string;
  vehicleRegistrationUrl?: string;
}

export interface DriverProfile {
  id: string;
  userId: string;
  carBrand: string;
  carModel: string;
  carNumber: string;
  carColor: string;
  documents: DriverDocuments;
  isVerified: boolean;
  isOnline: boolean;
  rating: number;
  createdAt: string;
}

export interface Tariff {
  id: string;
  city: string;
  minPrice: number;
  pricePerKm: number;
  pricePerMinute: number;
  updatedAt: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Order {
  id: string;
  clientId: string;
  driverId?: string;
  city: string;
  fromAddress: string;
  toAddress: string;
  from: Coordinates;
  to: Coordinates;
  distanceKm: number;
  durationMin: number;
  price: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  comment?: string;
  createdAt: string;
  completedAt?: string;
}

export interface Review {
  id: string;
  orderId: string;
  fromUserId: string;
  toUserId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface PriceEstimate {
  city: string;
  distanceKm: number;
  durationMin: number;
  basePrice: number;
  totalPrice: number;
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  created: "Создан",
  searching_driver: "Ищем водителя",
  driver_assigned: "Водитель назначен",
  driver_on_the_way: "Водитель едет к клиенту",
  driver_arrived: "Водитель на месте",
  trip_started: "Поездка началась",
  trip_completed: "Поездка завершена",
  cancelled_by_client: "Отменён клиентом",
  cancelled_by_driver: "Отменён водителем",
  cancelled_by_admin: "Отменён админом"
};

export const activeOrderFlow: OrderStatus[] = [
  "created",
  "searching_driver",
  "driver_assigned",
  "driver_on_the_way",
  "driver_arrived",
  "trip_started",
  "trip_completed"
];
