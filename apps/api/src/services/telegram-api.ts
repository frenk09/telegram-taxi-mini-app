export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramContact {
  phone_number: string;
  first_name: string;
  last_name?: string;
  user_id?: number;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  contact?: TelegramContact;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramResponse<T> {
  ok: boolean;
  result: T;
  description?: string;
}

export class TelegramApiClient {
  private readonly baseUrl: string;

  constructor(token: string) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async getMe() {
    return this.request<TelegramUser>("getMe");
  }

  async getUpdates(offset?: number, timeout = 30) {
    return this.request<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout,
      allowed_updates: ["message", "callback_query"]
    });
  }

  async sendMessage(
    chatId: number,
    text: string,
    extra?: Record<string, unknown>
  ) {
    return this.request("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...extra
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string) {
    return this.request("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text
    });
  }

  private async request<T>(
    method: string,
    payload?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload ?? {})
    });

    if (!response.ok) {
      throw new Error(`Telegram API HTTP ${response.status}`);
    }

    const data = (await response.json()) as TelegramResponse<T>;
    if (!data.ok) {
      throw new Error(data.description ?? "Telegram API error");
    }

    return data.result;
  }
}
