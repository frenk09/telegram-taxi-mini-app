import type { Order } from "@taxi/shared";
import { orderStatusLabels } from "@taxi/shared";
import {
  findDriverById,
  findDriverByUserId,
  findUserById,
  getOrderById,
  listOnlineDriversByCity,
  listUsersByRole
} from "./order-service.js";
import { getActiveTaxiTelegramBot } from "./bot-runtime.js";
import {
  buildClientOrderNotification,
  buildDriverNewOrderNotification
} from "./notifications.js";

export const notifyOrderCreated = async (order: Order) => {
  const bot = getActiveTaxiTelegramBot();
  if (!bot) {
    return;
  }

  const client = findUserById(order.clientId);
  if (client) {
    await bot.sendText(client.telegramId, `Заказ создан.\n${buildClientOrderNotification(order)}`);
  }

  const drivers = listOnlineDriversByCity(order.city);
  for (const driver of drivers) {
    const driverUser = findUserById(driver.userId);
    if (!driverUser) {
      continue;
    }

    await bot.sendOrderOffer(driverUser.telegramId, order);
  }
};

export const notifyOrderAccepted = async (orderId: string) => {
  const bot = getActiveTaxiTelegramBot();
  if (!bot) {
    return;
  }

  const order = getOrderById(orderId);
  if (!order) {
    return;
  }

  const client = findUserById(order.clientId);
  if (client) {
    await bot.sendText(
      client.telegramId,
      `Водитель найден.\n${buildClientOrderNotification(order)}`
    );
  }

  if (order.driverId) {
    const driver = findDriverById(order.driverId);
    const driverUser = driver ? findUserById(driver.userId) : undefined;
    if (driverUser) {
      await bot.sendText(
        driverUser.telegramId,
        `Вы приняли заказ.\n${buildDriverNewOrderNotification(order)}`
      );
    }
  }
};

export const notifyOrderStatusChanged = async (orderId: string) => {
  const bot = getActiveTaxiTelegramBot();
  if (!bot) {
    return;
  }

  const order = getOrderById(orderId);
  if (!order) {
    return;
  }

  const text = `Статус заказа ${order.id}: ${orderStatusLabels[order.status]}`;
  const client = findUserById(order.clientId);
  if (client) {
    await bot.sendText(client.telegramId, text);
  }

  if (order.driverId) {
    const driver = findDriverById(order.driverId);
    const driverUser = driver ? findUserById(driver.userId) : undefined;
    if (driverUser) {
      await bot.sendText(driverUser.telegramId, text);
    }
  }
};

export const notifyOrderCancelled = async (orderId: string) => {
  const bot = getActiveTaxiTelegramBot();
  if (!bot) {
    return;
  }

  const order = getOrderById(orderId);
  if (!order) {
    return;
  }

  const text = `Заказ ${order.id} отменён. Новый статус: ${orderStatusLabels[order.status]}`;
  const client = findUserById(order.clientId);
  if (client) {
    await bot.sendText(client.telegramId, text);
  }

  if (order.driverId) {
    const driver = findDriverById(order.driverId);
    const driverUser = driver ? findUserById(driver.userId) : undefined;
    if (driverUser) {
      await bot.sendText(driverUser.telegramId, text);
    }
  }
};

export const notifyDriverReviewCreated = async (driverUserId: string) => {
  const bot = getActiveTaxiTelegramBot();
  if (!bot) {
    return;
  }

  const user = findUserById(driverUserId);
  if (!user) {
    return;
  }

  const admins = listUsersByRole("admin");
  const driver = findDriverByUserId(user.id);
  if (!driver) {
    return;
  }

  for (const admin of admins) {
    await bot.sendAdminDriverReviewCard(admin.telegramId, user, driver.id);
  }
};

export const notifyDriverReviewResult = async (
  telegramId: number,
  approved: boolean,
  name: string
) => {
  const bot = getActiveTaxiTelegramBot();
  if (!bot) {
    return;
  }

  await bot.sendText(
    telegramId,
    approved
      ? `${name}, ваш профиль водителя одобрен. Можно выходить на линию.`
      : `${name}, ваш профиль водителя отклонён. Свяжитесь с администратором.`
  );
};
