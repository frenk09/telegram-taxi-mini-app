import { randomUUID } from "node:crypto";
import type { DriverProfile, Order, Tariff, User } from "@taxi/shared";

const now = () => new Date().toISOString();

const adminUser: User = {
  id: randomUUID(),
  telegramId: 100000001,
  role: "admin",
  name: "Оператор Мария",
  phone: "+79990000000",
  city: "Москва",
  status: "active",
  createdAt: now()
};

const clientUser: User = {
  id: randomUUID(),
  telegramId: 100000002,
  role: "client",
  name: "Иван Клиент",
  phone: "+79991112233",
  city: "Москва",
  status: "active",
  createdAt: now()
};

const driverUser: User = {
  id: randomUUID(),
  telegramId: 100000003,
  role: "driver",
  name: "Алексей Водитель",
  phone: "+79994445566",
  city: "Москва",
  status: "active",
  createdAt: now()
};

const driverProfile: DriverProfile = {
  id: randomUUID(),
  userId: driverUser.id,
  carBrand: "Kia",
  carModel: "Rio",
  carNumber: "А123АА77",
  carColor: "Белый",
  documents: {
    carPhotoUrl: "https://example.com/car.jpg",
    driverLicenseUrl: "https://example.com/license.jpg",
    vehicleRegistrationUrl: "https://example.com/sts.jpg"
  },
  isVerified: true,
  isOnline: true,
  rating: 4.9,
  createdAt: now()
};

export const db: {
  users: User[];
  drivers: DriverProfile[];
  orders: Order[];
  tariffs: Tariff[];
} = {
  users: [adminUser, clientUser, driverUser],
  drivers: [driverProfile],
  orders: [],
  tariffs: [
    {
      id: randomUUID(),
      city: "Москва",
      minPrice: 150,
      pricePerKm: 30,
      pricePerMinute: 5,
      updatedAt: now()
    },
    {
      id: randomUUID(),
      city: "Санкт-Петербург",
      minPrice: 170,
      pricePerKm: 32,
      pricePerMinute: 6,
      updatedAt: now()
    }
  ]
};

export const createId = () => randomUUID();
