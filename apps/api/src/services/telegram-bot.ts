const miniAppUrl = process.env.MINI_APP_URL ?? "https://mini-app.example.com";
const hasRealMiniAppUrl =
  Boolean(miniAppUrl) &&
  !miniAppUrl.includes("PASTE_PUBLIC") &&
  !miniAppUrl.includes("mini-app.example.com");

export interface TelegramKeyboardButton {
  text: string;
  web_app?: {
    url: string;
  };
  request_contact?: boolean;
}

export interface TelegramReplyKeyboardMarkup {
  keyboard: TelegramKeyboardButton[][];
  resize_keyboard: true;
  one_time_keyboard?: boolean;
}

export interface TelegramInlineKeyboardButton {
  text: string;
  callback_data?: string;
  web_app?: {
    url: string;
  };
}

export interface TelegramInlineKeyboardMarkup {
  inline_keyboard: TelegramInlineKeyboardButton[][];
}

export interface TelegramReplyKeyboardRemove {
  remove_keyboard: true;
}

export const buildMiniAppUrl = (
  role: "client" | "driver" | "admin",
  telegramId?: number,
  appUrl: string = miniAppUrl
) => {
  const url = new URL(appUrl);
  url.searchParams.set("role", role);

  if (telegramId) {
    url.searchParams.set("telegramId", String(telegramId));
  }

  return url.toString();
};

export const buildClientMainMenu = (
  telegramId?: number,
  appUrl: string = miniAppUrl
): TelegramReplyKeyboardMarkup => ({
  resize_keyboard: true,
  keyboard: [
    [
      hasRealMiniAppUrl
        ? { text: "Заказать такси", web_app: { url: buildMiniAppUrl("client", telegramId, appUrl) } }
        : { text: "Заказать такси" }
    ],
    [{ text: "Мои поездки" }, { text: "Профиль" }],
    [{ text: "Поддержка" }]
  ]
});

export const buildDriverMainMenu = (
  telegramId?: number,
  appUrl: string = miniAppUrl
): TelegramReplyKeyboardMarkup => ({
  resize_keyboard: true,
  keyboard: [
    [{ text: "Выйти на линию" }, { text: "Доступные заказы" }],
    [
      hasRealMiniAppUrl
        ? { text: "Открыть mini app", web_app: { url: buildMiniAppUrl("driver", telegramId, appUrl) } }
        : { text: "Открыть mini app" }
    ],
    [{ text: "Мои поездки" }, { text: "Баланс / заработок" }],
    [{ text: "Профиль" }, { text: "Поддержка" }]
  ]
});

export const buildAdminMainMenu = (
  telegramId?: number,
  appUrl: string = miniAppUrl
): TelegramReplyKeyboardMarkup => ({
  resize_keyboard: true,
  keyboard: [
    [{ text: "Водители на проверке" }, { text: "Активные заказы" }],
    [{ text: "Тарифы" }, { text: "Статистика" }],
    [
      hasRealMiniAppUrl
        ? { text: "Открыть mini app", web_app: { url: buildMiniAppUrl("admin", telegramId, appUrl) } }
        : { text: "Открыть mini app" }
    ],
    [{ text: "Пользователи" }, { text: "Жалобы" }]
  ]
});

export const buildRoleSelectionKeyboard = (): TelegramInlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "Я клиент", callback_data: "role:client" },
      { text: "Я водитель", callback_data: "role:driver" }
    ],
    [{ text: "Я администратор", callback_data: "role:admin" }]
  ]
});

export const buildContactRequestKeyboard = (
  buttonText: string
): TelegramReplyKeyboardMarkup => ({
  resize_keyboard: true,
  one_time_keyboard: true,
  keyboard: [[{ text: buttonText, request_contact: true }]]
});

export const buildCityKeyboard = (): TelegramReplyKeyboardMarkup => ({
  resize_keyboard: true,
  one_time_keyboard: true,
  keyboard: [[{ text: "Москва" }, { text: "Санкт-Петербург" }]]
});

export const buildRemoveKeyboard = (): TelegramReplyKeyboardRemove => ({
  remove_keyboard: true
});

export const buildDriverAcceptKeyboard = (
  orderId: string
): TelegramInlineKeyboardMarkup => ({
  inline_keyboard: [[{ text: "Принять заказ", callback_data: `driver_accept:${orderId}` }]]
});

export const buildDriverStatusKeyboard = (
  orderId: string,
  nextStatus?: string
): TelegramInlineKeyboardMarkup | undefined => {
  if (!nextStatus) {
    return undefined;
  }

  return {
    inline_keyboard: [[{ text: "Следующий статус", callback_data: `driver_status:${orderId}:${nextStatus}` }]]
  };
};

export const buildAdminReviewKeyboard = (
  driverId: string
): TelegramInlineKeyboardMarkup => ({
  inline_keyboard: [
    [
      { text: "Одобрить", callback_data: `admin_review:${driverId}:approved` },
      { text: "Отклонить", callback_data: `admin_review:${driverId}:rejected` }
    ]
  ]
});
