import type { Order, OrderStatus, User } from "@taxi/shared";
import { orderStatusLabels } from "@taxi/shared";
import {
  acceptOrder,
  dashboard,
  ensureAdmin,
  findDriverById,
  findDriverByUserId,
  findUserById,
  findUserByTelegramId,
  getOrderById,
  listActiveOrders,
  listAvailableOrdersForDriver,
  listClientOrders,
  listDriverHistory,
  listPendingDrivers,
  listUsersByRole,
  registerClient,
  registerDriver,
  reviewDriver,
  setDriverOnline,
  updateOrderStatus
} from "./order-service.js";
import {
  buildAdminMainMenu,
  buildAdminReviewKeyboard,
  buildCityKeyboard,
  buildClientMainMenu,
  buildContactRequestKeyboard,
  buildDriverAcceptKeyboard,
  buildDriverMainMenu,
  buildDriverStatusKeyboard,
  buildMiniAppUrl,
  buildRemoveKeyboard,
  buildRoleSelectionKeyboard
} from "./telegram-bot.js";
import { TelegramApiClient, type TelegramCallbackQuery, type TelegramMessage, type TelegramUpdate, type TelegramUser } from "./telegram-api.js";
import {
  buildAdminDriverReviewNotification,
  buildClientOrderNotification,
  buildDriverNewOrderNotification
} from "./notifications.js";

type DriverRegistrationPayload = {
  name: string;
  phone?: string;
  city?: string;
  carBrand?: string;
  carModel?: string;
  carNumber?: string;
  carColor?: string;
  carPhotoUrl?: string;
  driverLicenseUrl?: string;
  vehicleRegistrationUrl?: string;
};

type BotSession =
  | {
      flow: "client_registration";
      step: "phone" | "city";
      payload: {
        name: string;
        phone?: string;
      };
    }
  | {
      flow: "driver_registration";
      step:
        | "phone"
        | "city"
        | "car_brand"
        | "car_model"
        | "car_number"
        | "car_color"
        | "car_photo"
        | "driver_license"
        | "vehicle_registration";
      payload: DriverRegistrationPayload;
    };

const adminTelegramIds = new Set(
  String(process.env.ADMIN_TELEGRAM_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item))
);

const nextDriverStatuses: Partial<Record<OrderStatus, OrderStatus>> = {
  driver_assigned: "driver_on_the_way",
  driver_on_the_way: "driver_arrived",
  driver_arrived: "trip_started",
  trip_started: "trip_completed"
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const displayName = (telegramUser?: TelegramUser) => {
  if (!telegramUser) {
    return "Пользователь";
  }

  return [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ");
};

const fileIdToUrl = (fileId?: string) => (fileId ? `tg://file/${fileId}` : undefined);

let activeTaxiTelegramBot: TaxiTelegramBot | null = null;

export const setActiveTaxiTelegramBot = (bot: TaxiTelegramBot | null) => {
  activeTaxiTelegramBot = bot;
};

export const getActiveTaxiTelegramBot = () => activeTaxiTelegramBot;

export class TaxiTelegramBot {
  private readonly api: TelegramApiClient;
  private readonly sessions = new Map<number, BotSession>();
  private running = false;
  private offset = 0;

  constructor(
    private readonly token: string,
    private readonly miniAppUrl: string
  ) {
    this.api = new TelegramApiClient(token);
  }

  async start() {
    if (this.running) {
      return;
    }

    this.running = true;
    const me = await this.api.getMe();
    console.log(`Telegram bot started as @${me.username ?? me.first_name}`);

    while (this.running) {
      try {
        const updates = await this.api.getUpdates(this.offset, 30);
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch (error) {
        console.error("Telegram polling error", error);
        await delay(3000);
      }
    }
  }

  stop() {
    this.running = false;
  }

  async sendText(
    chatId: number,
    text: string,
    extra?: Record<string, unknown>
  ) {
    return this.api.sendMessage(chatId, text, extra);
  }

  async sendOrderOffer(chatId: number, order: Order) {
    return this.sendText(chatId, buildDriverNewOrderNotification(order), {
      reply_markup: buildDriverAcceptKeyboard(order.id)
    });
  }

  async sendTripCard(chatId: number, order: Order) {
    return this.sendText(chatId, this.buildOrderSummary(order), {
      reply_markup: buildDriverStatusKeyboard(order.id, nextDriverStatuses[order.status])
    });
  }

  async sendAdminDriverReviewCard(chatId: number, user: User, driverId: string) {
    const driver = findDriverById(driverId);
    if (!driver) {
      return;
    }

    return this.sendText(chatId, buildAdminDriverReviewNotification(user, driver), {
      reply_markup: buildAdminReviewKeyboard(driver.id)
    });
  }

  private async handleUpdate(update: TelegramUpdate) {
    if (update.message) {
      await this.handleMessage(update.message);
    }

    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
    }
  }

  private async handleMessage(message: TelegramMessage) {
    if (message.chat.type !== "private") {
      return;
    }

    const session = this.sessions.get(message.chat.id);

    if (message.contact && session) {
      await this.handleContactMessage(message, session);
      return;
    }

    if ((message.photo || message.document) && session) {
      await this.handleFileMessage(message, session);
      return;
    }

    const text = message.text?.trim();
    if (!text) {
      return;
    }

    if (session) {
      await this.handleSessionText(message, text, session);
      return;
    }

    await this.handlePlainText(message, text);
  }

  private async handlePlainText(message: TelegramMessage, text: string) {
    const telegramUser = message.from;
    const chatId = message.chat.id;
    const clientUser = telegramUser
      ? findUserByTelegramId(telegramUser.id, "client")
      : undefined;
    const driverUser = telegramUser
      ? findUserByTelegramId(telegramUser.id, "driver")
      : undefined;
    const adminUser = telegramUser
      ? findUserByTelegramId(telegramUser.id, "admin")
      : undefined;

    if (text === "/start" || text === "/menu" || text === "Старт") {
      await this.sendWelcome(chatId);
      return;
    }

    if (text === "Заказать такси") {
      await this.sendText(
        chatId,
        `Откройте mini app для оформления заказа: ${buildMiniAppUrl(
          "client",
          telegramUser?.id,
          this.miniAppUrl
        )}`,
        {
          reply_markup: buildClientMainMenu(telegramUser?.id, this.miniAppUrl)
        }
      );
      return;
    }

    if (text === "Мои поездки" && clientUser) {
      await this.showClientOrders(chatId, clientUser.id);
      return;
    }

    if (text === "Профиль" && clientUser) {
      await this.sendText(
        chatId,
        `Ваш профиль\nИмя: ${clientUser.name}\nТелефон: ${clientUser.phone}\nГород: ${clientUser.city}`,
        {
          reply_markup: buildClientMainMenu(telegramUser?.id, this.miniAppUrl)
        }
      );
      return;
    }

    if (text === "Поддержка") {
      await this.sendText(
        chatId,
        "Поддержка сервиса: @support или позвоните оператору. Для MVP это тестовый канал поддержки."
      );
      return;
    }

    if (text === "Выйти на линию" && driverUser) {
      await this.toggleDriverOnline(chatId, driverUser.id, telegramUser?.id);
      return;
    }

    if (text === "Доступные заказы" && driverUser) {
      await this.showDriverAvailableOrders(chatId, driverUser.id);
      return;
    }

    if (text === "Открыть mini app" && driverUser) {
      await this.sendText(
        chatId,
        `Mini app водителя: ${buildMiniAppUrl("driver", telegramUser?.id, this.miniAppUrl)}`,
        {
          reply_markup: buildDriverMainMenu(telegramUser?.id, this.miniAppUrl)
        }
      );
      return;
    }

    if (text === "Открыть mini app" && adminUser) {
      await this.sendText(
        chatId,
        `Mini app администратора: ${buildMiniAppUrl("admin", telegramUser?.id, this.miniAppUrl)}`,
        {
          reply_markup: buildAdminMainMenu(telegramUser?.id, this.miniAppUrl)
        }
      );
      return;
    }

    if (text === "Мои поездки" && driverUser) {
      await this.showDriverTrips(chatId, driverUser.id);
      return;
    }

    if (text === "Баланс / заработок" && driverUser) {
      await this.showDriverEarnings(chatId, driverUser.id);
      return;
    }

    if (text === "Профиль" && driverUser) {
      await this.showDriverProfile(chatId, driverUser.id, telegramUser?.id);
      return;
    }

    if (text === "Водители на проверке" && adminUser) {
      await this.showPendingDrivers(chatId, telegramUser?.id);
      return;
    }

    if (text === "Активные заказы" && adminUser) {
      await this.showActiveOrders(chatId, telegramUser?.id);
      return;
    }

    if (text === "Тарифы" && adminUser) {
      const info = dashboard().tariffs
        .map(
          (tariff) =>
            `${tariff.city}: минимум ${tariff.minPrice} RUB, ${tariff.pricePerKm} RUB/км, ${tariff.pricePerMinute} RUB/мин`
        )
        .join("\n");

      await this.sendText(chatId, `Текущие тарифы\n${info}`, {
        reply_markup: buildAdminMainMenu(telegramUser?.id, this.miniAppUrl)
      });
      return;
    }

    if (text === "Статистика" && adminUser) {
      const stats = dashboard().metrics;
      await this.sendText(
        chatId,
        `Статистика\nКлиентов: ${stats.clients}\nВодителей: ${stats.drivers}\nНа линии: ${stats.onlineDrivers}\nАктивных заказов: ${stats.activeOrders}\nНа проверке: ${stats.pendingDrivers}`,
        {
          reply_markup: buildAdminMainMenu(telegramUser?.id, this.miniAppUrl)
        }
      );
      return;
    }

    if (text === "Пользователи" && adminUser) {
      const users = [...listUsersByRole("client"), ...listUsersByRole("driver")]
        .slice(0, 10)
        .map((user) => `${user.role}: ${user.name} (${user.city})`)
        .join("\n");

      await this.sendText(chatId, `Пользователи\n${users || "Пока нет данных"}`, {
        reply_markup: buildAdminMainMenu(telegramUser?.id, this.miniAppUrl)
      });
      return;
    }

    if (text === "Жалобы" && adminUser) {
      await this.sendText(
        chatId,
        "Модуль жалоб пока в MVP как заглушка. Следующим шагом можно добавить обращения и споры."
      );
      return;
    }

    await this.sendWelcome(chatId);
  }

  private async handleSessionText(
    message: TelegramMessage,
    text: string,
    session: BotSession
  ) {
    const chatId = message.chat.id;

    if (text === "/cancel") {
      this.sessions.delete(chatId);
      await this.sendText(chatId, "Текущая регистрация отменена.", {
        reply_markup: buildRemoveKeyboard()
      });
      await this.sendWelcome(chatId);
      return;
    }

    if (session.flow === "client_registration") {
      if (session.step === "phone") {
        session.payload.phone = text;
        session.step = "city";
        await this.sendText(chatId, "Укажите ваш город:", {
          reply_markup: buildCityKeyboard()
        });
        return;
      }

      if (session.step === "city" && message.from) {
        registerClient({
          telegramId: message.from.id,
          name: session.payload.name,
          phone: session.payload.phone ?? "",
          city: text
        });
        this.sessions.delete(chatId);
        await this.sendText(chatId, "Регистрация клиента завершена.", {
          reply_markup: buildClientMainMenu(message.from.id, this.miniAppUrl)
        });
      }

      return;
    }

    if (session.flow === "driver_registration") {
      if (session.step === "phone") {
        session.payload.phone = text;
        session.step = "city";
        await this.sendText(chatId, "Укажите город работы:", {
          reply_markup: buildCityKeyboard()
        });
        return;
      }

      if (session.step === "city") {
        session.payload.city = text;
        session.step = "car_brand";
        await this.sendText(chatId, "Введите марку авто:", {
          reply_markup: buildRemoveKeyboard()
        });
        return;
      }

      if (session.step === "car_brand") {
        session.payload.carBrand = text;
        session.step = "car_model";
        await this.sendText(chatId, "Введите модель авто:");
        return;
      }

      if (session.step === "car_model") {
        session.payload.carModel = text;
        session.step = "car_number";
        await this.sendText(chatId, "Введите госномер:");
        return;
      }

      if (session.step === "car_number") {
        session.payload.carNumber = text;
        session.step = "car_color";
        await this.sendText(chatId, "Введите цвет авто:");
        return;
      }

      if (session.step === "car_color") {
        session.payload.carColor = text;
        session.step = "car_photo";
        await this.sendText(
          chatId,
          "Отправьте фото автомобиля или напишите /skip для пропуска."
        );
        return;
      }

      if (
        session.step === "car_photo" ||
        session.step === "driver_license" ||
        session.step === "vehicle_registration"
      ) {
        if (text === "/skip") {
          await this.advanceDriverDocumentStep(chatId, message.from?.id, session);
          return;
        }

        await this.sendText(
          chatId,
          "Для этого шага нужно прислать фото/документ или команду /skip."
        );
      }
    }
  }

  private async handleContactMessage(message: TelegramMessage, session: BotSession) {
    const phone = message.contact?.phone_number ?? "";
    if (!phone) {
      return;
    }

    if (session.flow === "client_registration") {
      session.payload.phone = phone;
      session.step = "city";
      await this.sendText(message.chat.id, "Укажите ваш город:", {
        reply_markup: buildCityKeyboard()
      });
      return;
    }

    if (session.flow === "driver_registration") {
      session.payload.phone = phone;
      session.step = "city";
      await this.sendText(message.chat.id, "Укажите город работы:", {
        reply_markup: buildCityKeyboard()
      });
    }
  }

  private async handleFileMessage(message: TelegramMessage, session: BotSession) {
    if (session.flow !== "driver_registration") {
      return;
    }

    const photoId = message.photo?.at(-1)?.file_id;
    const documentId = message.document?.file_id;
    const fileUrl = fileIdToUrl(photoId ?? documentId);

    if (!fileUrl) {
      await this.sendText(message.chat.id, "Не удалось обработать файл. Попробуйте снова.");
      return;
    }

    if (session.step === "car_photo") {
      session.payload.carPhotoUrl = fileUrl;
      session.step = "driver_license";
      await this.sendText(
        message.chat.id,
        "Теперь отправьте фото водительского удостоверения или /skip."
      );
      return;
    }

    if (session.step === "driver_license") {
      session.payload.driverLicenseUrl = fileUrl;
      session.step = "vehicle_registration";
      await this.sendText(
        message.chat.id,
        "Теперь отправьте СТС / документы на авто или /skip."
      );
      return;
    }

    if (session.step === "vehicle_registration") {
      session.payload.vehicleRegistrationUrl = fileUrl;
      await this.finishDriverRegistration(message.chat.id, message.from?.id, session);
    }
  }

  private async advanceDriverDocumentStep(
    chatId: number,
    telegramId: number | undefined,
    session: Extract<BotSession, { flow: "driver_registration" }>
  ) {
    if (session.step === "car_photo") {
      session.step = "driver_license";
      await this.sendText(chatId, "Отправьте водительское удостоверение или /skip.");
      return;
    }

    if (session.step === "driver_license") {
      session.step = "vehicle_registration";
      await this.sendText(chatId, "Отправьте СТС / документы на авто или /skip.");
      return;
    }

    if (session.step === "vehicle_registration") {
      await this.finishDriverRegistration(chatId, telegramId, session);
    }
  }

  private async finishDriverRegistration(
    chatId: number,
    telegramId: number | undefined,
    session: Extract<BotSession, { flow: "driver_registration" }>
  ) {
    if (!telegramId) {
      return;
    }

    const result = registerDriver({
      telegramId,
      name: session.payload.name,
      phone: session.payload.phone ?? "",
      city: session.payload.city ?? "Москва",
      carBrand: session.payload.carBrand ?? "",
      carModel: session.payload.carModel ?? "",
      carNumber: session.payload.carNumber ?? "",
      carColor: session.payload.carColor ?? "",
      carPhotoUrl: session.payload.carPhotoUrl,
      driverLicenseUrl: session.payload.driverLicenseUrl,
      vehicleRegistrationUrl: session.payload.vehicleRegistrationUrl
    });

    this.sessions.delete(chatId);

    await this.sendText(
      chatId,
      "Анкета водителя отправлена на проверку. После одобрения вы сможете выйти на линию.",
      {
        reply_markup: buildDriverMainMenu(telegramId, this.miniAppUrl)
      }
    );

    await this.notifyAdminsAboutDriverReview(result.user, result.driver.id);
  }

  private async handleCallback(callbackQuery: TelegramCallbackQuery) {
    const chatId = callbackQuery.message?.chat.id;
    const data = callbackQuery.data;

    if (!chatId || !data) {
      return;
    }

    try {
      if (data.startsWith("role:")) {
        const role = data.split(":")[1];
        await this.startRoleFlow(chatId, callbackQuery.from, role);
        await this.api.answerCallbackQuery(callbackQuery.id, "Роль выбрана");
        return;
      }

      if (data.startsWith("driver_accept:")) {
        const orderId = data.split(":")[1];
        await this.handleDriverAccept(chatId, callbackQuery, orderId);
        return;
      }

      if (data.startsWith("driver_status:")) {
        const [, orderId, nextStatus] = data.split(":");
        await this.handleDriverStatus(chatId, callbackQuery, orderId, nextStatus as OrderStatus);
        return;
      }

      if (data.startsWith("admin_review:")) {
        const [, driverId, decision] = data.split(":");
        await this.handleAdminReview(chatId, callbackQuery, driverId, decision as "approved" | "rejected");
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка действия";
      await this.api.answerCallbackQuery(callbackQuery.id, message);
      await this.sendText(chatId, message);
    }
  }

  private async startRoleFlow(chatId: number, telegramUser: TelegramUser, role: string) {
    if (role === "client") {
      const existing = findUserByTelegramId(telegramUser.id, "client");
      if (existing) {
        await this.sendText(chatId, "Режим клиента активирован.", {
          reply_markup: buildClientMainMenu(telegramUser.id, this.miniAppUrl)
        });
        return;
      }

      this.sessions.set(chatId, {
        flow: "client_registration",
        step: "phone",
        payload: {
          name: displayName(telegramUser)
        }
      });

      await this.sendText(chatId, "Отправьте номер телефона кнопкой ниже или сообщением:", {
        reply_markup: buildContactRequestKeyboard("Отправить номер телефона")
      });
      return;
    }

    if (role === "driver") {
      const existing = findUserByTelegramId(telegramUser.id, "driver");
      if (existing) {
        await this.sendText(chatId, "Режим водителя активирован.", {
          reply_markup: buildDriverMainMenu(telegramUser.id, this.miniAppUrl)
        });
        return;
      }

      this.sessions.set(chatId, {
        flow: "driver_registration",
        step: "phone",
        payload: {
          name: displayName(telegramUser)
        }
      });

      await this.sendText(chatId, "Начинаем регистрацию водителя. Сначала отправьте номер телефона:", {
        reply_markup: buildContactRequestKeyboard("Отправить номер телефона")
      });
      return;
    }

    if (role === "admin") {
      if (!adminTelegramIds.has(telegramUser.id) && !findUserByTelegramId(telegramUser.id, "admin")) {
        await this.sendText(chatId, "Ваш Telegram ID не добавлен в список администраторов.");
        return;
      }

      ensureAdmin({
        telegramId: telegramUser.id,
        name: displayName(telegramUser),
        city: "Москва"
      });

      await this.sendText(chatId, "Режим администратора активирован.", {
        reply_markup: buildAdminMainMenu(telegramUser.id, this.miniAppUrl)
      });
    }
  }

  private async sendWelcome(chatId: number) {
    await this.sendText(
      chatId,
      "Добро пожаловать в Telegram Taxi.\nВыберите роль, чтобы зарегистрироваться и начать работу:",
      {
        reply_markup: buildRoleSelectionKeyboard()
      }
    );
  }

  private async showClientOrders(chatId: number, clientId: string) {
    const orders = listClientOrders(clientId);
    if (!orders.length) {
      await this.sendText(chatId, "У вас пока нет поездок.");
      return;
    }

    for (const order of orders.slice(0, 5)) {
      await this.sendText(chatId, buildClientOrderNotification(order));
    }
  }

  private async toggleDriverOnline(
    chatId: number,
    userId: string,
    telegramId?: number
  ) {
    const driver = findDriverByUserId(userId);
    if (!driver) {
      throw new Error("Профиль водителя не найден");
    }

    const updated = setDriverOnline(driver.id, !driver.isOnline);
    await this.sendText(
      chatId,
      updated.isOnline ? "Вы вышли на линию." : "Вы больше не на линии.",
      {
        reply_markup: buildDriverMainMenu(telegramId, this.miniAppUrl)
      }
    );
  }

  private async showDriverAvailableOrders(chatId: number, userId: string) {
    const driver = findDriverByUserId(userId);
    if (!driver) {
      throw new Error("Профиль водителя не найден");
    }

    const orders = listAvailableOrdersForDriver(driver.id);
    if (!orders.length) {
      await this.sendText(chatId, "Сейчас доступных заказов нет.");
      return;
    }

    for (const order of orders.slice(0, 10)) {
      await this.sendOrderOffer(chatId, order);
    }
  }

  private async showDriverTrips(chatId: number, userId: string) {
    const driver = findDriverByUserId(userId);
    if (!driver) {
      throw new Error("Профиль водителя не найден");
    }

    const orders = listDriverHistory(driver.id);
    if (!orders.length) {
      await this.sendText(chatId, "У вас пока нет выполненных или активных поездок.");
      return;
    }

    for (const order of orders.slice(0, 10)) {
      await this.sendTripCard(chatId, order);
    }
  }

  private async showDriverEarnings(chatId: number, userId: string) {
    const driver = findDriverByUserId(userId);
    if (!driver) {
      throw new Error("Профиль водителя не найден");
    }

    const orders = listDriverHistory(driver.id).filter(
      (order) => order.status === "trip_completed"
    );
    const total = orders.reduce((sum, order) => sum + order.price, 0);
    await this.sendText(
      chatId,
      `Завершённых поездок: ${orders.length}\nЗаработок: ${total} RUB`
    );
  }

  private async showDriverProfile(chatId: number, userId: string, telegramId?: number) {
    const user = findUserById(userId);
    const driver = findDriverByUserId(userId);
    if (!user || !driver) {
      throw new Error("Профиль водителя не найден");
    }

    await this.sendText(
      chatId,
      `Профиль водителя\n${user.name}\nТелефон: ${user.phone}\nГород: ${user.city}\nАвто: ${driver.carBrand} ${driver.carModel}, ${driver.carColor}\nГосномер: ${driver.carNumber}\nПроверка: ${driver.isVerified ? "одобрен" : "на проверке"}\nНа линии: ${driver.isOnline ? "да" : "нет"}`,
      {
        reply_markup: buildDriverMainMenu(telegramId, this.miniAppUrl)
      }
    );
  }

  private async showPendingDrivers(chatId: number, telegramId?: number) {
    const pending = listPendingDrivers();
    if (!pending.length) {
      await this.sendText(chatId, "Сейчас нет водителей на проверке.", {
        reply_markup: buildAdminMainMenu(telegramId, this.miniAppUrl)
      });
      return;
    }

    for (const driver of pending) {
      const user = findUserById(driver.userId);
      if (!user) {
        continue;
      }

      await this.sendAdminDriverReviewCard(chatId, user, driver.id);
    }
  }

  private async showActiveOrders(chatId: number, telegramId?: number) {
    const orders = listActiveOrders();
    if (!orders.length) {
      await this.sendText(chatId, "Активных заказов нет.", {
        reply_markup: buildAdminMainMenu(telegramId, this.miniAppUrl)
      });
      return;
    }

    for (const order of orders) {
      await this.sendText(chatId, this.buildOrderSummary(order));
    }
  }

  private async handleDriverAccept(
    chatId: number,
    callbackQuery: TelegramCallbackQuery,
    orderId: string
  ) {
    const driverUser = findUserByTelegramId(callbackQuery.from.id, "driver");
    if (!driverUser) {
      throw new Error("Сначала зарегистрируйтесь как водитель");
    }

    const driver = findDriverByUserId(driverUser.id);
    if (!driver) {
      throw new Error("Профиль водителя не найден");
    }

    const order = acceptOrder(orderId, driver.id);
    await this.api.answerCallbackQuery(callbackQuery.id, "Заказ принят");
    await this.sendTripCard(chatId, order);

    const client = findUserById(order.clientId);
    if (client) {
      await this.sendText(
        client.telegramId,
        `Водитель найден для заказа ${order.id}. Ожидайте машину.`
      );
    }
  }

  private async handleDriverStatus(
    chatId: number,
    callbackQuery: TelegramCallbackQuery,
    orderId: string,
    nextStatus: OrderStatus
  ) {
    const driverUser = findUserByTelegramId(callbackQuery.from.id, "driver");
    if (!driverUser) {
      throw new Error("Сначала зарегистрируйтесь как водитель");
    }

    const driver = findDriverByUserId(driverUser.id);
    const order = getOrderById(orderId);
    if (!driver || !order || order.driverId !== driver.id) {
      throw new Error("Этот заказ не закреплён за вами");
    }

    const updated = updateOrderStatus(orderId, nextStatus);
    await this.api.answerCallbackQuery(callbackQuery.id, "Статус обновлён");
    await this.sendTripCard(chatId, updated);

    const client = findUserById(updated.clientId);
    if (client) {
      await this.sendText(
        client.telegramId,
        `Статус вашего заказа ${updated.id}: ${orderStatusLabels[updated.status]}`
      );
    }
  }

  private async handleAdminReview(
    chatId: number,
    callbackQuery: TelegramCallbackQuery,
    driverId: string,
    decision: "approved" | "rejected"
  ) {
    const adminUser = findUserByTelegramId(callbackQuery.from.id, "admin");
    if (!adminUser && !adminTelegramIds.has(callbackQuery.from.id)) {
      throw new Error("Недостаточно прав");
    }

    const result = reviewDriver(driverId, decision);
    await this.api.answerCallbackQuery(
      callbackQuery.id,
      decision === "approved" ? "Водитель одобрен" : "Водитель отклонён"
    );
    await this.sendText(
      chatId,
      `Решение по водителю ${result.user.name}: ${decision === "approved" ? "одобрен" : "отклонён"}`
    );
    await this.sendText(
      result.user.telegramId,
      decision === "approved"
        ? "Ваш профиль водителя одобрен. Можно выходить на линию."
        : "Профиль водителя отклонён администратором."
    );
  }

  private buildOrderSummary(order: Order) {
    return `Заказ ${order.id}\nСтатус: ${orderStatusLabels[order.status]}\nМаршрут: ${order.fromAddress} -> ${order.toAddress}\nСтоимость: ${order.price} RUB`;
  }

  private async notifyAdminsAboutDriverReview(user: User, driverId: string) {
    const admins = listUsersByRole("admin");
    for (const admin of admins) {
      await this.sendAdminDriverReviewCard(admin.telegramId, user, driverId);
    }
  }
}
