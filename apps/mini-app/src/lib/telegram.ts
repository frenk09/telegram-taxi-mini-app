type RoleView = "client" | "driver" | "admin";

interface TelegramWebAppUser {
  id: number;
}

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
  };
}

interface TelegramWindow extends Window {
  Telegram?: {
    WebApp?: TelegramWebApp;
  };
}

const fallbackTelegramIds: Record<RoleView, number> = {
  client: 100000002,
  driver: 100000003,
  admin: 100000001
};

export const getLaunchParams = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    role: (params.get("role") as RoleView | null) ?? "client",
    telegramId: params.get("telegramId")
  };
};

export const getTelegramWebApp = () =>
  (window as TelegramWindow).Telegram?.WebApp;

export const resolveTelegramId = (role: RoleView) => {
  const params = getLaunchParams();
  const fromQuery = params.telegramId ? Number(params.telegramId) : NaN;
  if (Number.isFinite(fromQuery)) {
    return fromQuery;
  }

  const telegramId = getTelegramWebApp()?.initDataUnsafe?.user?.id;
  if (telegramId) {
    return telegramId;
  }

  return fallbackTelegramIds[role];
};

export const prepareTelegramWebApp = () => {
  const webApp = getTelegramWebApp();
  webApp?.ready();
  webApp?.expand();
};
