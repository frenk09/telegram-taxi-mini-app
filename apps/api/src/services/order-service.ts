import type {
  DriverProfile,
  Order,
  OrderStatus,
  PaymentMethod,
  PriceEstimate,
  Tariff,
  User
} from "@taxi/shared";
import { db, createId } from "../lib/store.js";
import { calculateTripEstimate } from "./pricing.js";

interface CreateClientInput {
  telegramId: number;
  name: string;
  phone: string;
  city: string;
}

interface CreateDriverInput extends CreateClientInput {
  carBrand: string;
  carModel: string;
  carNumber: string;
  carColor: string;
  carPhotoUrl?: string;
  driverLicenseUrl?: string;
  vehicleRegistrationUrl?: string;
}

interface EstimateInput {
  city: string;
  distanceKm: number;
  durationMin: number;
}

interface CreateOrderInput extends EstimateInput {
  clientId: string;
  fromAddress: string;
  toAddress: string;
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  paymentMethod: PaymentMethod;
  comment?: string;
}

interface AdminInput {
  telegramId: number;
  name: string;
  city: string;
}

interface UpdateUserInput {
  name?: string;
  phone?: string;
  city?: string;
  status?: User["status"];
}

interface UpdateDriverInput {
  carBrand?: string;
  carModel?: string;
  carNumber?: string;
  carColor?: string;
  isVerified?: boolean;
  isOnline?: boolean;
  documents?: DriverProfile["documents"];
}

const now = () => new Date().toISOString();

const activeTripStatuses = new Set<OrderStatus>([
  "searching_driver",
  "driver_assigned",
  "driver_on_the_way",
  "driver_arrived",
  "trip_started"
]);

const nextDriverStatuses: Record<OrderStatus, OrderStatus[]> = {
  created: ["searching_driver"],
  searching_driver: ["driver_assigned", "cancelled_by_client", "cancelled_by_admin"],
  driver_assigned: ["driver_on_the_way", "cancelled_by_driver", "cancelled_by_admin"],
  driver_on_the_way: ["driver_arrived", "cancelled_by_driver", "cancelled_by_admin"],
  driver_arrived: ["trip_started", "cancelled_by_driver", "cancelled_by_admin"],
  trip_started: ["trip_completed", "cancelled_by_admin"],
  trip_completed: [],
  cancelled_by_client: [],
  cancelled_by_driver: [],
  cancelled_by_admin: []
};

const requireTariff = (city: string): Tariff => {
  const tariff = db.tariffs.find(
    (item) => item.city.toLowerCase() === city.toLowerCase()
  );

  if (!tariff) {
    throw new Error(`Тариф для города "${city}" не найден`);
  }

  return tariff;
};

export const registerClient = (input: CreateClientInput): User => {
  const existing = db.users.find(
    (user) => user.telegramId === input.telegramId && user.role === "client"
  );

  if (existing) {
    existing.name = input.name;
    existing.phone = input.phone;
    existing.city = input.city;
    existing.status = "active";
    return existing;
  }

  const user: User = {
    id: createId(),
    telegramId: input.telegramId,
    role: "client",
    name: input.name,
    phone: input.phone,
    city: input.city,
    status: "active",
    createdAt: now()
  };

  db.users.push(user);
  return user;
};

export const registerDriver = (
  input: CreateDriverInput
): { user: User; driver: DriverProfile } => {
  const existingUser = db.users.find(
    (user) => user.telegramId === input.telegramId && user.role === "driver"
  );
  const existingDriver = existingUser
    ? db.drivers.find((driverItem) => driverItem.userId === existingUser.id)
    : undefined;

  if (existingUser && existingDriver) {
    existingUser.name = input.name;
    existingUser.phone = input.phone;
    existingUser.city = input.city;
    existingUser.status = existingDriver.isVerified ? "active" : "pending_review";

    existingDriver.carBrand = input.carBrand;
    existingDriver.carModel = input.carModel;
    existingDriver.carNumber = input.carNumber;
    existingDriver.carColor = input.carColor;
    existingDriver.documents = {
      ...existingDriver.documents,
      carPhotoUrl: input.carPhotoUrl ?? existingDriver.documents.carPhotoUrl,
      driverLicenseUrl:
        input.driverLicenseUrl ?? existingDriver.documents.driverLicenseUrl,
      vehicleRegistrationUrl:
        input.vehicleRegistrationUrl ?? existingDriver.documents.vehicleRegistrationUrl
    };

    return { user: existingUser, driver: existingDriver };
  }

  const user: User = {
    id: createId(),
    telegramId: input.telegramId,
    role: "driver",
    name: input.name,
    phone: input.phone,
    city: input.city,
    status: "pending_review",
    createdAt: now()
  };

  const driver: DriverProfile = {
    id: createId(),
    userId: user.id,
    carBrand: input.carBrand,
    carModel: input.carModel,
    carNumber: input.carNumber,
    carColor: input.carColor,
    documents: {
      carPhotoUrl: input.carPhotoUrl,
      driverLicenseUrl: input.driverLicenseUrl,
      vehicleRegistrationUrl: input.vehicleRegistrationUrl
    },
    isVerified: false,
    isOnline: false,
    rating: 5,
    createdAt: now()
  };

  db.users.push(user);
  db.drivers.push(driver);

  return { user, driver };
};

export const ensureAdmin = (input: AdminInput): User => {
  const existing = db.users.find(
    (user) => user.telegramId === input.telegramId && user.role === "admin"
  );

  if (existing) {
    existing.name = input.name;
    existing.city = input.city;
    existing.status = "active";
    return existing;
  }

  const user: User = {
    id: createId(),
    telegramId: input.telegramId,
    role: "admin",
    name: input.name,
    phone: "",
    city: input.city,
    status: "active",
    createdAt: now()
  };

  db.users.push(user);
  return user;
};

export const findUserByTelegramId = (
  telegramId: number,
  role?: User["role"]
): User | undefined =>
  db.users.find(
    (user) => user.telegramId === telegramId && (!role || user.role === role)
  );

export const findUserById = (userId: string): User | undefined =>
  db.users.find((user) => user.id === userId);

export const listUsersByRole = (role: User["role"]): User[] =>
  db.users.filter((user) => user.role === role);

export const updateUserProfile = (userId: string, patch: UpdateUserInput): User => {
  const user = findUserById(userId);
  if (!user) {
    throw new Error("Пользователь не найден");
  }

  if (typeof patch.name === "string") {
    user.name = patch.name;
  }

  if (typeof patch.phone === "string") {
    user.phone = patch.phone;
  }

  if (typeof patch.city === "string") {
    user.city = patch.city;
  }

  if (patch.status) {
    user.status = patch.status;
  }

  return user;
};

export const findDriverById = (driverId: string): DriverProfile | undefined =>
  db.drivers.find((driver) => driver.id === driverId);

export const findDriverByUserId = (userId: string): DriverProfile | undefined =>
  db.drivers.find((driver) => driver.userId === userId);

export const updateDriverProfile = (
  driverId: string,
  patch: UpdateDriverInput
): DriverProfile => {
  const driver = findDriverById(driverId);
  if (!driver) {
    throw new Error("Водитель не найден");
  }

  if (typeof patch.carBrand === "string") {
    driver.carBrand = patch.carBrand;
  }

  if (typeof patch.carModel === "string") {
    driver.carModel = patch.carModel;
  }

  if (typeof patch.carNumber === "string") {
    driver.carNumber = patch.carNumber;
  }

  if (typeof patch.carColor === "string") {
    driver.carColor = patch.carColor;
  }

  if (typeof patch.isVerified === "boolean") {
    driver.isVerified = patch.isVerified;
  }

  if (typeof patch.isOnline === "boolean") {
    driver.isOnline = patch.isOnline;
  }

  if (patch.documents) {
    driver.documents = {
      ...driver.documents,
      ...patch.documents
    };
  }

  return driver;
};

export const estimatePrice = (input: EstimateInput): PriceEstimate => {
  const tariff = requireTariff(input.city);
  return calculateTripEstimate(tariff, input.distanceKm, input.durationMin);
};

export const createOrder = (input: CreateOrderInput): Order => {
  const estimate = estimatePrice(input);
  const order: Order = {
    id: createId(),
    clientId: input.clientId,
    city: input.city,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    from: {
      lat: input.fromLat,
      lng: input.fromLng
    },
    to: {
      lat: input.toLat,
      lng: input.toLng
    },
    distanceKm: input.distanceKm,
    durationMin: input.durationMin,
    price: estimate.totalPrice,
    status: "searching_driver",
    paymentMethod: input.paymentMethod,
    comment: input.comment,
    createdAt: now()
  };

  db.orders.unshift(order);
  return order;
};

export const cancelOrder = (
  orderId: string,
  reason: "cancelled_by_client" | "cancelled_by_driver" | "cancelled_by_admin"
): Order => {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) {
    throw new Error("Заказ не найден");
  }

  if (!activeTripStatuses.has(order.status) && order.status !== "searching_driver") {
    throw new Error("Заказ уже завершён или отменён");
  }

  order.status = reason;
  return order;
};

export const listClientOrders = (clientId: string): Order[] =>
  db.orders.filter((order) => order.clientId === clientId);

export const getOrderById = (orderId: string): Order | undefined =>
  db.orders.find((order) => order.id === orderId);

export const setDriverOnline = (driverId: string, isOnline: boolean): DriverProfile => {
  const driver = db.drivers.find((item) => item.id === driverId);
  if (!driver) {
    throw new Error("Водитель не найден");
  }

  if (!driver.isVerified) {
    throw new Error("Водитель ещё не прошёл модерацию");
  }

  driver.isOnline = isOnline;
  return driver;
};

export const listAvailableOrdersForDriver = (driverId: string): Order[] => {
  const driver = db.drivers.find((item) => item.id === driverId);
  if (!driver) {
    throw new Error("Водитель не найден");
  }

  const user = db.users.find((item) => item.id === driver.userId);
  if (!user) {
    throw new Error("Пользователь водителя не найден");
  }

  return db.orders.filter(
    (order) =>
      order.status === "searching_driver" && order.city.toLowerCase() === user.city.toLowerCase()
  );
};

export const acceptOrder = (orderId: string, driverId: string): Order => {
  const driver = db.drivers.find((item) => item.id === driverId);
  if (!driver) {
    throw new Error("Водитель не найден");
  }

  if (!driver.isVerified || !driver.isOnline) {
    throw new Error("Водитель должен быть проверен и быть на линии");
  }

  const order = db.orders.find((item) => item.id === orderId);
  if (!order) {
    throw new Error("Заказ не найден");
  }

  if (order.status !== "searching_driver") {
    throw new Error("Заказ уже принят или недоступен");
  }

  order.driverId = driverId;
  order.status = "driver_assigned";
  return order;
};

export const updateOrderStatus = (
  orderId: string,
  nextStatus: OrderStatus
): Order => {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) {
    throw new Error("Заказ не найден");
  }

  const allowed = nextDriverStatuses[order.status];
  if (!allowed.includes(nextStatus)) {
    throw new Error(
      `Нельзя перевести заказ из статуса ${order.status} в ${nextStatus}`
    );
  }

  order.status = nextStatus;

  if (nextStatus === "trip_completed") {
    order.completedAt = now();
  }

  return order;
};

export const listDriverHistory = (driverId: string): Order[] =>
  db.orders.filter((order) => order.driverId === driverId);

export const listPendingDrivers = (): DriverProfile[] =>
  db.drivers.filter((driver) => !driver.isVerified);

export const listOnlineDriversByCity = (city: string): DriverProfile[] =>
  db.drivers.filter((driver) => {
    if (!driver.isVerified || !driver.isOnline) {
      return false;
    }

    const user = db.users.find((item) => item.id === driver.userId);
    return Boolean(user && user.city.toLowerCase() === city.toLowerCase());
  });

export const listActiveOrders = (): Order[] =>
  db.orders.filter((order) => activeTripStatuses.has(order.status));

export const reviewDriver = (
  driverId: string,
  decision: "approved" | "rejected"
): { user: User; driver: DriverProfile } => {
  const driver = db.drivers.find((item) => item.id === driverId);
  if (!driver) {
    throw new Error("Водитель не найден");
  }

  const user = db.users.find((item) => item.id === driver.userId);
  if (!user) {
    throw new Error("Пользователь водителя не найден");
  }

  if (decision === "approved") {
    driver.isVerified = true;
    user.status = "active";
  } else {
    driver.isVerified = false;
    user.status = "blocked";
  }

  return { user, driver };
};

export const upsertTariff = (
  city: string,
  minPrice: number,
  pricePerKm: number,
  pricePerMinute: number
): Tariff => {
  const existing = db.tariffs.find(
    (item) => item.city.toLowerCase() === city.toLowerCase()
  );

  if (existing) {
    existing.minPrice = minPrice;
    existing.pricePerKm = pricePerKm;
    existing.pricePerMinute = pricePerMinute;
    existing.updatedAt = now();
    return existing;
  }

  const next: Tariff = {
    id: createId(),
    city,
    minPrice,
    pricePerKm,
    pricePerMinute,
    updatedAt: now()
  };

  db.tariffs.push(next);
  return next;
};

export const dashboard = () => {
  const activeOrders = db.orders.filter((order) => activeTripStatuses.has(order.status));
  const pendingDrivers = db.drivers.filter((driver) => !driver.isVerified);
  const onlineDrivers = db.drivers.filter((driver) => driver.isOnline && driver.isVerified);

  return {
    metrics: {
      users: db.users.length,
      drivers: db.drivers.length,
      clients: db.users.filter((user) => user.role === "client").length,
      activeOrders: activeOrders.length,
      pendingDrivers: pendingDrivers.length,
      onlineDrivers: onlineDrivers.length
    },
    activeOrders,
    pendingDrivers,
    tariffs: db.tariffs
  };
};
