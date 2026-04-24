import { Router, type Request, type Response } from "express";
import { z, type ZodType } from "zod";
import { db } from "../lib/store.js";
import {
  acceptOrder,
  cancelOrder,
  createOrder,
  dashboard,
  estimatePrice,
  findDriverByUserId,
  findUserByTelegramId,
  listAvailableOrdersForDriver,
  listClientOrders,
  listDriverHistory,
  listPendingDrivers,
  registerClient,
  registerDriver,
  reviewDriver,
  setDriverOnline,
  updateOrderStatus,
  upsertTariff
} from "../services/order-service.js";
import { orderStatusLabels } from "@taxi/shared";
import {
  buildAdminMainMenu,
  buildClientMainMenu,
  buildDriverMainMenu
} from "../services/telegram-bot.js";
import {
  notifyDriverReviewCreated,
  notifyDriverReviewResult,
  notifyOrderAccepted,
  notifyOrderCancelled,
  notifyOrderCreated,
  notifyOrderStatusChanged
} from "../services/notification-center.js";

const coordinatesSchema = z.object({
  lat: z.number(),
  lng: z.number()
});

const clientRegistrationSchema = z.object({
  telegramId: z.number(),
  name: z.string().min(2),
  phone: z.string().min(5),
  city: z.string().min(2)
});

const driverRegistrationSchema = clientRegistrationSchema.extend({
  carBrand: z.string().min(2),
  carModel: z.string().min(1),
  carNumber: z.string().min(4),
  carColor: z.string().min(2),
  carPhotoUrl: z.string().url().optional(),
  driverLicenseUrl: z.string().url().optional(),
  vehicleRegistrationUrl: z.string().url().optional()
});

const estimateSchema = z.object({
  city: z.string().min(2),
  distanceKm: z.number().positive(),
  durationMin: z.number().nonnegative()
});

const orderSchema = estimateSchema.extend({
  clientId: z.string().uuid(),
  fromAddress: z.string().min(3),
  toAddress: z.string().min(3),
  from: coordinatesSchema,
  to: coordinatesSchema,
  paymentMethod: z.enum(["cash", "transfer", "card"]),
  comment: z.string().optional()
});

const cancelSchema = z.object({
  reason: z.enum(["cancelled_by_client", "cancelled_by_driver", "cancelled_by_admin"])
});

const driverOnlineSchema = z.object({
  isOnline: z.boolean()
});

const acceptOrderSchema = z.object({
  driverId: z.string().uuid()
});

const updateStatusSchema = z.object({
  status: z.enum([
    "searching_driver",
    "driver_assigned",
    "driver_on_the_way",
    "driver_arrived",
    "trip_started",
    "trip_completed",
    "cancelled_by_client",
    "cancelled_by_driver",
    "cancelled_by_admin"
  ])
});

const reviewDriverSchema = z.object({
  decision: z.enum(["approved", "rejected"])
});

const tariffSchema = z.object({
  city: z.string().min(2),
  minPrice: z.number().int().nonnegative(),
  pricePerKm: z.number().int().nonnegative(),
  pricePerMinute: z.number().int().nonnegative()
});

const respondWithError = (res: Response, error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return res.status(400).json({ error: message });
};

const parseBody = <T>(schema: ZodType<T>, req: Request, res: Response): T | undefined => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      details: parsed.error.flatten()
    });
    return undefined;
  }

  return parsed.data;
};

export const apiRouter = Router();

apiRouter.get("/bootstrap", (_req, res) => {
  res.json({
    roles: ["client", "driver", "admin"],
    orderStatusLabels,
    telegramMenus: {
      client: buildClientMainMenu(),
      driver: buildDriverMainMenu(),
      admin: buildAdminMainMenu()
    },
    demoUsers: db.users,
    demoDrivers: db.drivers,
    tariffs: db.tariffs,
    recentOrders: db.orders.slice(0, 10)
  });
});

apiRouter.get("/me", (req, res) => {
  const telegramId = Number(req.query.telegramId);
  const role = String(req.query.role ?? "client") as "client" | "driver" | "admin";

  if (!Number.isFinite(telegramId)) {
    res.status(400).json({ error: "telegramId query param is required" });
    return;
  }

  const user = findUserByTelegramId(telegramId, role);
  const driver = user ? findDriverByUserId(user.id) : undefined;

  res.json({
    user,
    driver,
    clientOrders: user?.role === "client" ? listClientOrders(user.id) : [],
    driverOrders: driver ? listDriverHistory(driver.id) : [],
    availableOrders: driver ? listAvailableOrdersForDriver(driver.id) : [],
    dashboard: role === "admin" ? dashboard() : null
  });
});

apiRouter.post("/client/register", (req, res) => {
  const body = parseBody(clientRegistrationSchema, req, res);
  if (!body) {
    return;
  }

  try {
    res.json(registerClient(body));
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.post("/driver/register", (req, res) => {
  const body = parseBody(driverRegistrationSchema, req, res);
  if (!body) {
    return;
  }

  try {
    const result = registerDriver(body);
    void notifyDriverReviewCreated(result.user.id);
    res.json(result);
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.post("/orders/estimate", (req, res) => {
  const body = parseBody(estimateSchema, req, res);
  if (!body) {
    return;
  }

  try {
    res.json(estimatePrice(body));
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.post("/orders", (req, res) => {
  const body = parseBody(orderSchema, req, res);
  if (!body) {
    return;
  }

  try {
    const order = createOrder({
        ...body,
        fromLat: body.from.lat,
        fromLng: body.from.lng,
        toLat: body.to.lat,
        toLng: body.to.lng
      });
    void notifyOrderCreated(order);
    res.json(order);
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.get("/client/orders/:clientId", (req, res) => {
  try {
    res.json(listClientOrders(req.params.clientId));
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.post("/orders/:orderId/cancel", (req, res) => {
  const body = parseBody(cancelSchema, req, res);
  if (!body) {
    return;
  }

  try {
    const order = cancelOrder(req.params.orderId, body.reason);
    void notifyOrderCancelled(order.id);
    res.json(order);
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.post("/driver/:driverId/online", (req, res) => {
  const body = parseBody(driverOnlineSchema, req, res);
  if (!body) {
    return;
  }

  try {
    res.json(setDriverOnline(req.params.driverId, body.isOnline));
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.get("/driver/:driverId/available-orders", (req, res) => {
  try {
    res.json(listAvailableOrdersForDriver(req.params.driverId));
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.post("/driver/orders/:orderId/accept", (req, res) => {
  const body = parseBody(acceptOrderSchema, req, res);
  if (!body) {
    return;
  }

  try {
    const order = acceptOrder(req.params.orderId, body.driverId);
    void notifyOrderAccepted(order.id);
    res.json(order);
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.post("/driver/orders/:orderId/status", (req, res) => {
  const body = parseBody(updateStatusSchema, req, res);
  if (!body) {
    return;
  }

  try {
    const order = updateOrderStatus(req.params.orderId, body.status);
    void notifyOrderStatusChanged(order.id);
    res.json(order);
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.get("/driver/:driverId/history", (req, res) => {
  try {
    res.json(listDriverHistory(req.params.driverId));
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.get("/admin/dashboard", (_req, res) => {
  res.json(dashboard());
});

apiRouter.get("/admin/pending-drivers", (_req, res) => {
  res.json(listPendingDrivers());
});

apiRouter.post("/admin/drivers/:driverId/review", (req, res) => {
  const body = parseBody(reviewDriverSchema, req, res);
  if (!body) {
    return;
  }

  try {
    const result = reviewDriver(req.params.driverId, body.decision);
    void notifyDriverReviewResult(
      result.user.telegramId,
      body.decision === "approved",
      result.user.name
    );
    res.json(result);
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.post("/admin/orders/:orderId/status", (req, res) => {
  const body = parseBody(updateStatusSchema, req, res);
  if (!body) {
    return;
  }

  try {
    const order = updateOrderStatus(req.params.orderId, body.status);
    void notifyOrderStatusChanged(order.id);
    res.json(order);
  } catch (error) {
    respondWithError(res, error);
  }
});

apiRouter.post("/admin/tariffs", (req, res) => {
  const body = parseBody(tariffSchema, req, res);
  if (!body) {
    return;
  }

  try {
    res.json(
      upsertTariff(body.city, body.minPrice, body.pricePerKm, body.pricePerMinute)
    );
  } catch (error) {
    respondWithError(res, error);
  }
});
