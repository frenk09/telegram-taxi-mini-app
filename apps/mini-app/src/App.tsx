import { useEffect, useMemo, useState } from "react";
import type { DriverProfile, Order, OrderStatus, PaymentMethod, Tariff, User } from "@taxi/shared";
import { orderStatusLabels } from "@taxi/shared";
import { SectionCard } from "./components/SectionCard";
import { StatusPill } from "./components/StatusPill";
import { api, type AdminDashboard, type BootstrapPayload, type MePayload } from "./lib/api";
import { getLaunchParams, prepareTelegramWebApp, resolveTelegramId } from "./lib/telegram";

type RoleView = "client" | "driver" | "admin";

const roleTabs: { id: RoleView; label: string }[] = [
  { id: "client", label: "Клиент" },
  { id: "driver", label: "Водитель" },
  { id: "admin", label: "Админ" }
];

const nextSteps: Partial<Record<OrderStatus, OrderStatus>> = {
  driver_assigned: "driver_on_the_way",
  driver_on_the_way: "driver_arrived",
  driver_arrived: "trip_started",
  trip_started: "trip_completed"
};

const payments: PaymentMethod[] = ["cash", "transfer", "card"];
const paymentLabels: Record<PaymentMethod, string> = {
  cash: "Наличные",
  transfer: "Перевод",
  card: "Карта"
};

const initialRole = getLaunchParams().role;

const estimatePrice = (
  tariff: Tariff,
  distanceKm: number,
  durationMin: number
) =>
  Math.round(
    tariff.minPrice + distanceKm * tariff.pricePerKm + durationMin * tariff.pricePerMinute
  );

export default function App() {
  const [role, setRole] = useState<RoleView>(initialRole);
  const [telegramId, setTelegramId] = useState<number>(() => resolveTelegramId(initialRole));
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [me, setMe] = useState<MePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderForm, setOrderForm] = useState({
    fromAddress: "ул. Пятницкая, 11",
    toAddress: "Белорусский вокзал",
    distanceKm: 7.5,
    durationMin: 22,
    paymentMethod: "cash" as PaymentMethod,
    comment: ""
  });
  const [tariffForm, setTariffForm] = useState({
    city: "Москва",
    minPrice: 150,
    pricePerKm: 30,
    pricePerMinute: 5
  });

  useEffect(() => {
    prepareTelegramWebApp();
  }, []);

  const refresh = async (nextRole: RoleView = role, nextTelegramId: number = telegramId) => {
    setLoading(true);
    setError(null);

    try {
      const [bootstrapPayload, mePayload] = await Promise.all([
        api.getBootstrap(),
        api.getMe(nextTelegramId, nextRole)
      ]);

      setBootstrap(bootstrapPayload);
      setMe(mePayload);

      const firstTariff =
        mePayload.dashboard?.tariffs[0] ??
        bootstrapPayload.tariffs.find((item) => item.city === "Москва") ??
        bootstrapPayload.tariffs[0];

      if (firstTariff) {
        setTariffForm({
          city: firstTariff.city,
          minPrice: firstTariff.minPrice,
          pricePerKm: firstTariff.pricePerKm,
          pricePerMinute: firstTariff.pricePerMinute
        });
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [role, telegramId]);

  const tariff = useMemo(() => {
    const fromDashboard = me?.dashboard?.tariffs.find((item) => item.city === tariffForm.city);
    const fromBootstrap = bootstrap?.tariffs.find((item) => item.city === tariffForm.city);

    return (
      fromDashboard ??
      fromBootstrap ?? {
        id: "custom",
        city: tariffForm.city,
        minPrice: tariffForm.minPrice,
        pricePerKm: tariffForm.pricePerKm,
        pricePerMinute: tariffForm.pricePerMinute,
        updatedAt: new Date().toISOString()
      }
    );
  }, [bootstrap?.tariffs, me?.dashboard?.tariffs, tariffForm]);

  const forecast = estimatePrice(tariff, orderForm.distanceKm, orderForm.durationMin);
  const userById = useMemo(
    () =>
      new Map<string, User>(
        (bootstrap?.demoUsers ?? []).map((user) => [user.id, user])
      ),
    [bootstrap?.demoUsers]
  );

  const currentUser = me?.user;
  const currentDriver = me?.driver;
  const clientOrders = me?.clientOrders ?? [];
  const availableOrders = me?.availableOrders ?? [];
  const driverTrips = me?.driverOrders ?? [];
  const dashboard = me?.dashboard as AdminDashboard | null;
  const pendingDrivers = dashboard?.pendingDrivers ?? [];

  const createOrder = async () => {
    if (!currentUser) {
      setError("Клиент не найден. Зарегистрируйтесь через бота.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.createOrder({
        clientId: currentUser.id,
        city: currentUser.city,
        fromAddress: orderForm.fromAddress,
        toAddress: orderForm.toAddress,
        from: { lat: 55.751, lng: 37.618 },
        to: { lat: 55.773, lng: 37.585 },
        distanceKm: orderForm.distanceKm,
        durationMin: orderForm.durationMin,
        paymentMethod: orderForm.paymentMethod,
        comment: orderForm.comment
      });
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось создать заказ");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    setSubmitting(true);
    setError(null);

    try {
      await api.cancelOrder(orderId, "cancelled_by_client");
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось отменить заказ");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDriverOnline = async () => {
    if (!currentDriver) {
      setError("Профиль водителя не найден.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.setDriverOnline(currentDriver.id, !currentDriver.isOnline);
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Не удалось сменить статус линии"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const acceptOrder = async (orderId: string) => {
    if (!currentDriver) {
      setError("Профиль водителя не найден.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.acceptOrder(orderId, currentDriver.id);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось принять заказ");
    } finally {
      setSubmitting(false);
    }
  };

  const advanceTrip = async (orderId: string, currentStatus: OrderStatus) => {
    const nextStatus = nextSteps[currentStatus];
    if (!nextStatus) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.updateDriverOrderStatus(orderId, nextStatus);
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Не удалось обновить статус"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const reviewPendingDriver = async (
    driverId: string,
    decision: "approved" | "rejected"
  ) => {
    setSubmitting(true);
    setError(null);

    try {
      await api.reviewDriver(driverId, decision);
      await refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Не удалось обработать водителя"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const saveTariff = async () => {
    setSubmitting(true);
    setError(null);

    try {
      await api.updateTariff(tariffForm);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось обновить тариф");
    } finally {
      setSubmitting(false);
    }
  };

  const renderAlert = () =>
    error ? <div className="section-card" style={{ borderColor: "rgba(201,75,82,0.35)" }}>{error}</div> : null;

  const renderClient = () => (
    <div className="panel-grid">
      <SectionCard
        title="Заказать такси"
        eyebrow="Mini App"
        aside={<div className="price-badge">{forecast} ₽</div>}
      >
        <div className="form-grid">
          <label>
            Адрес подачи
            <input
              value={orderForm.fromAddress}
              onChange={(event) =>
                setOrderForm((current) => ({ ...current, fromAddress: event.target.value }))
              }
            />
          </label>
          <label>
            Адрес назначения
            <input
              value={orderForm.toAddress}
              onChange={(event) =>
                setOrderForm((current) => ({ ...current, toAddress: event.target.value }))
              }
            />
          </label>
          <label>
            Дистанция, км
            <input
              type="number"
              value={orderForm.distanceKm}
              onChange={(event) =>
                setOrderForm((current) => ({
                  ...current,
                  distanceKm: Number(event.target.value)
                }))
              }
            />
          </label>
          <label>
            Время, мин
            <input
              type="number"
              value={orderForm.durationMin}
              onChange={(event) =>
                setOrderForm((current) => ({
                  ...current,
                  durationMin: Number(event.target.value)
                }))
              }
            />
          </label>
          <label>
            Оплата
            <select
              value={orderForm.paymentMethod}
              onChange={(event) =>
                setOrderForm((current) => ({
                  ...current,
                  paymentMethod: event.target.value as PaymentMethod
                }))
              }
            >
              {payments.map((payment) => (
                <option key={payment} value={payment}>
                  {paymentLabels[payment]}
                </option>
              ))}
            </select>
          </label>
          <label className="form-grid__wide">
            Комментарий
            <textarea
              rows={3}
              value={orderForm.comment}
              onChange={(event) =>
                setOrderForm((current) => ({ ...current, comment: event.target.value }))
              }
              placeholder="Например: детское кресло, встреча у подъезда"
            />
          </label>
        </div>
        <div className="map-preview">
          <div>
            <strong>Карта и маршрут</strong>
            <p>На следующем этапе сюда подключается Яндекс.Карты или 2ГИС.</p>
          </div>
          <div className="map-preview__stats">
            <span>{orderForm.distanceKm} км</span>
            <span>{orderForm.durationMin} мин</span>
            <span>{forecast} ₽</span>
          </div>
        </div>
        <button className="primary-button" onClick={createOrder} disabled={submitting || !currentUser}>
          Подтвердить заказ
        </button>
      </SectionCard>

      <SectionCard title="Мои поездки" eyebrow="Клиент">
        <div className="list">
          {clientOrders.length ? (
            clientOrders.map((order) => (
              <article key={order.id} className="ride-card">
                <div className="ride-card__top">
                  <div>
                    <h3>{order.fromAddress}</h3>
                    <p>{order.toAddress}</p>
                  </div>
                  <StatusPill status={order.status} />
                </div>
                <div className="ride-meta">
                  <span>{order.price} ₽</span>
                  <span>{paymentLabels[order.paymentMethod]}</span>
                  <span>{order.distanceKm} км</span>
                </div>
                <div className="ride-card__actions">
                  <button className="secondary-button">Связаться с водителем</button>
                  {order.status === "searching_driver" || order.status === "driver_assigned" ? (
                    <button
                      className="ghost-button"
                      onClick={() => void cancelOrder(order.id)}
                      disabled={submitting}
                    >
                      Отменить
                    </button>
                  ) : null}
                </div>
              </article>
            ))
          ) : (
            <article className="ride-card">
              <p>Поездок пока нет. Первый заказ можно оформить выше.</p>
            </article>
          )}
        </div>
      </SectionCard>
    </div>
  );

  const renderDriver = () => (
    <div className="panel-grid">
      <SectionCard
        title="Профиль водителя"
        eyebrow="Driver Hub"
        aside={
          <button
            className={currentDriver?.isOnline ? "primary-button" : "secondary-button"}
            onClick={() => void toggleDriverOnline()}
            disabled={submitting || !currentDriver}
          >
            {currentDriver?.isOnline ? "На линии" : "Не на линии"}
          </button>
        }
      >
        <div className="profile-strip">
          <div>
            <strong>{currentUser?.name ?? "Водитель не найден"}</strong>
            <p>
              {currentDriver
                ? `${currentDriver.carBrand} ${currentDriver.carModel}, ${currentDriver.carColor}`
                : "Сначала зарегистрируйтесь через бота"}
            </p>
          </div>
          <div>
            <strong>{currentDriver?.carNumber ?? "—"}</strong>
            <p>Рейтинг {currentDriver?.rating ?? "—"}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Доступные заказы" eyebrow="Водитель">
        <div className="list">
          {availableOrders.length ? (
            availableOrders.map((order) => (
              <article key={order.id} className="ride-card ride-card--driver">
                <div className="ride-card__top">
                  <div>
                    <h3>{order.fromAddress}</h3>
                    <p>{order.toAddress}</p>
                  </div>
                  <span className="price-badge">{order.price} ₽</span>
                </div>
                <div className="ride-meta">
                  <span>{order.distanceKm} км</span>
                  <span>{order.durationMin} мин</span>
                  <span>{paymentLabels[order.paymentMethod]}</span>
                </div>
                <button
                  className="primary-button"
                  onClick={() => void acceptOrder(order.id)}
                  disabled={submitting || !currentDriver?.isOnline}
                >
                  Принять заказ
                </button>
              </article>
            ))
          ) : (
            <article className="ride-card">
              <p>Сейчас новых заказов нет.</p>
            </article>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Мои поездки" eyebrow="Исполнение">
        <div className="list">
          {driverTrips.length ? (
            driverTrips.map((order) => (
              <article key={order.id} className="ride-card">
                <div className="ride-card__top">
                  <div>
                    <h3>{order.fromAddress}</h3>
                    <p>{order.toAddress}</p>
                  </div>
                  <StatusPill status={order.status} />
                </div>
                <div className="ride-card__actions">
                  <button
                    className="secondary-button"
                    onClick={() => void advanceTrip(order.id, order.status)}
                    disabled={submitting || !nextSteps[order.status]}
                  >
                    {nextSteps[order.status]
                      ? orderStatusLabels[nextSteps[order.status] as OrderStatus]
                      : "Маршрут завершён"}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <article className="ride-card">
              <p>У водителя пока нет активных или завершённых поездок.</p>
            </article>
          )}
        </div>
      </SectionCard>
    </div>
  );

  const renderAdmin = () => (
    <div className="panel-grid">
      <SectionCard title="Операционный центр" eyebrow="Админ">
        <div className="stats-grid">
          <article>
            <strong>{dashboard?.metrics.activeOrders ?? 0}</strong>
            <span>Активные заказы</span>
          </article>
          <article>
            <strong>{dashboard?.metrics.pendingDrivers ?? 0}</strong>
            <span>Водители на модерации</span>
          </article>
          <article>
            <strong>{dashboard?.metrics.onlineDrivers ?? 0}</strong>
            <span>Водители на линии</span>
          </article>
        </div>
      </SectionCard>

      <SectionCard title="Модерация водителей" eyebrow="Анкеты">
        <div className="list">
          {pendingDrivers.length ? (
            pendingDrivers.map((item) => {
              const user = userById.get(item.userId);
              return (
                <article key={item.id} className="moderation-card">
                  <div>
                    <h3>{user?.name ?? "Новый водитель"}</h3>
                    <p>
                      {user?.city ?? "Город не указан"}, {item.carBrand} {item.carModel}
                    </p>
                  </div>
                  <div className="ride-card__actions">
                    <button
                      className="primary-button"
                      onClick={() => void reviewPendingDriver(item.id, "approved")}
                      disabled={submitting}
                    >
                      Одобрить
                    </button>
                    <button
                      className="ghost-button"
                      onClick={() => void reviewPendingDriver(item.id, "rejected")}
                      disabled={submitting}
                    >
                      Отклонить
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <article className="ride-card">
              <p>Сейчас нет новых водителей на проверке.</p>
            </article>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Тарифы" eyebrow="Настройки" aside={<button className="primary-button" onClick={() => void saveTariff()} disabled={submitting}>Сохранить</button>}>
        <div className="form-grid">
          <label>
            Город
            <input
              value={tariffForm.city}
              onChange={(event) =>
                setTariffForm((current) => ({ ...current, city: event.target.value }))
              }
            />
          </label>
          <label>
            Минимальная цена
            <input
              type="number"
              value={tariffForm.minPrice}
              onChange={(event) =>
                setTariffForm((current) => ({
                  ...current,
                  minPrice: Number(event.target.value)
                }))
              }
            />
          </label>
          <label>
            Цена за км
            <input
              type="number"
              value={tariffForm.pricePerKm}
              onChange={(event) =>
                setTariffForm((current) => ({
                  ...current,
                  pricePerKm: Number(event.target.value)
                }))
              }
            />
          </label>
          <label>
            Цена за минуту
            <input
              type="number"
              value={tariffForm.pricePerMinute}
              onChange={(event) =>
                setTariffForm((current) => ({
                  ...current,
                  pricePerMinute: Number(event.target.value)
                }))
              }
            />
          </label>
        </div>
      </SectionCard>
    </div>
  );

  return (
    <div className="app-shell">
      <div className="app-shell__backdrop" />
      <header className="hero">
        <div>
          <p className="hero__eyebrow">Telegram Taxi Aggregator</p>
          <h1>Мини-приложение для клиента, водителя и оператора в одном рабочем потоке</h1>
          <p className="hero__lead">
            Интерфейс подключён к backend API и умеет работать из Telegram по роли и `telegramId`.
          </p>
        </div>
        <div className="hero__summary">
          <span>Telegram ID: {telegramId}</span>
          <span>Роль: {roleTabs.find((item) => item.id === role)?.label}</span>
          <span>{currentUser ? `${currentUser.name}, ${currentUser.city}` : "Ожидается регистрация через бота"}</span>
        </div>
      </header>

      <nav className="role-tabs" aria-label="Переключение ролей">
        {roleTabs.map((tab) => (
          <button
            key={tab.id}
            className={
              tab.id === role
                ? "role-tabs__button role-tabs__button--active"
                : "role-tabs__button"
            }
            onClick={() => {
              setRole(tab.id);
              setTelegramId(resolveTelegramId(tab.id));
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {renderAlert()}

      {loading ? (
        <section className="section-card">
          <h2>Загрузка</h2>
          <p>Получаем данные пользователя и актуальные заказы.</p>
        </section>
      ) : null}

      {!loading && role === "client" ? renderClient() : null}
      {!loading && role === "driver" ? renderDriver() : null}
      {!loading && role === "admin" ? renderAdmin() : null}
    </div>
  );
}
