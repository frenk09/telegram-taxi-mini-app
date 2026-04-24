import type { DriverProfile, Order, User } from "@taxi/shared";
import { orderStatusLabels } from "@taxi/shared";

export const buildClientOrderNotification = (order: Order) =>
  `Заказ ${order.id}\nСтатус: ${orderStatusLabels[order.status]}\nМаршрут: ${order.fromAddress} -> ${order.toAddress}\nСтоимость: ${order.price} RUB`;

export const buildDriverNewOrderNotification = (order: Order) =>
  `Новый заказ в городе ${order.city}\nОткуда: ${order.fromAddress}\nКуда: ${order.toAddress}\nСтоимость: ${order.price} RUB`;

export const buildAdminDriverReviewNotification = (
  user: User,
  driver: DriverProfile
) =>
  `Новый водитель на проверке\n${user.name}, ${user.city}\nАвто: ${driver.carBrand} ${driver.carModel}, ${driver.carNumber}`;
