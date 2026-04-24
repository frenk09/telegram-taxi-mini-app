import type { DriverProfile, Order, Tariff, User } from "@taxi/shared";

export const demoClient: User = {
  id: "client-demo",
  telegramId: 101,
  role: "client",
  name: "Анна Клиент",
  phone: "+7 999 123-45-67",
  city: "Москва",
  status: "active",
  createdAt: new Date().toISOString()
};

export const demoDriverUser: User = {
  id: "driver-user-demo",
  telegramId: 202,
  role: "driver",
  name: "Дмитрий Водитель",
  phone: "+7 999 222-11-00",
  city: "Москва",
  status: "active",
  createdAt: new Date().toISOString()
};

export const demoDriver: DriverProfile = {
  id: "driver-demo",
  userId: demoDriverUser.id,
  carBrand: "Hyundai",
  carModel: "Solaris",
  carNumber: "М555ММ77",
  carColor: "Черный",
  documents: {
    carPhotoUrl: "",
    driverLicenseUrl: "",
    vehicleRegistrationUrl: ""
  },
  isVerified: true,
  isOnline: true,
  rating: 4.95,
  createdAt: new Date().toISOString()
};

export const demoTariffs: Tariff[] = [
  {
    id: "tariff-msk",
    city: "Москва",
    minPrice: 150,
    pricePerKm: 30,
    pricePerMinute: 5,
    updatedAt: new Date().toISOString()
  }
];

export const demoOrders: Order[] = [
  {
    id: "order-1",
    clientId: demoClient.id,
    city: "Москва",
    fromAddress: "ул. Тверская, 12",
    toAddress: "Москва-Сити, Пресненская наб., 2",
    from: { lat: 55.757, lng: 37.615 },
    to: { lat: 55.748, lng: 37.539 },
    distanceKm: 8.2,
    durationMin: 24,
    price: 516,
    status: "searching_driver",
    paymentMethod: "cash",
    comment: "Нужен багажник",
    createdAt: new Date().toISOString()
  },
  {
    id: "order-2",
    clientId: demoClient.id,
    driverId: demoDriver.id,
    city: "Москва",
    fromAddress: "ул. Арбат, 20",
    toAddress: "Павелецкий вокзал",
    from: { lat: 55.752, lng: 37.592 },
    to: { lat: 55.729, lng: 37.638 },
    distanceKm: 6.4,
    durationMin: 19,
    price: 437,
    status: "driver_on_the_way",
    paymentMethod: "transfer",
    createdAt: new Date().toISOString()
  },
  {
    id: "order-3",
    clientId: demoClient.id,
    driverId: demoDriver.id,
    city: "Москва",
    fromAddress: "Ленинградский проспект, 39",
    toAddress: "ВДНХ",
    from: { lat: 55.793, lng: 37.544 },
    to: { lat: 55.829, lng: 37.633 },
    distanceKm: 11.8,
    durationMin: 31,
    price: 659,
    status: "trip_completed",
    paymentMethod: "card",
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  }
];
