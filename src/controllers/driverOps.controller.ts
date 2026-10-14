import { Response } from "express";
import asyncHandler from "express-async-handler";

import prisma from "../config/prisma";
import type { Prisma } from "../generated/prisma/client";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import { ORDER_INCLUDE, OrderWithItems } from "../services/order.service";
import { AuthedRequest } from "../types/auth.types";
import { DRIVER_ACTIVE_STATUSES, ORDER_STATUS } from "../types/order.types";

/**
 * Where a delivery is, as the driver sees it. It folds the order status and
 * the assignment into one value:
 *   available  ready, nobody has it
 *   accepted   ready, this driver has it but hasn't collected
 *   picked_up  out for delivery
 *   delivered  done
 */
export type DeliveryStage = "available" | "accepted" | "picked_up" | "delivered";

export interface DeliveryDto {
  id: string;
  number: number;
  stage: DeliveryStage;
  shopName: string;
  shopArea: string;
  customerName: string;
  address: string;
  /** "qty × name" lines to hand over. */
  items: string[];
  /** Rupees. */
  payout: number;
  readyAt?: Date;
  deliveredAt?: Date;
}

const stageOf = (order: OrderWithItems): DeliveryStage => {
  if (order.status === ORDER_STATUS.DELIVERED) return "delivered";
  if (order.status === ORDER_STATUS.OUT_FOR_DELIVERY) return "picked_up";
  return order.driverId ? "accepted" : "available";
};

const toDeliveryDto = (order: OrderWithItems): DeliveryDto => ({
  id: order.id,
  number: order.number,
  stage: stageOf(order),
  shopName: order.merchant?.shopName ?? order.merchant?.name ?? "Shop",
  shopArea: order.merchant?.area ?? "",
  customerName: order.customer?.name ?? order.customer?.phoneNumber ?? "Customer",
  address: [order.addressLine1, order.addressCity].filter(Boolean).join(", "),
  items: order.items.map((i) => `${i.quantity} × ${i.name}`),
  payout: Number(order.driverPayout),
  readyAt: order.readyAt ?? undefined,
  deliveredAt: order.deliveredAt ?? undefined,
});

const fail = (res: Response, status: number, message: string, code: string) => {
  res.status(status).json({ success: false, message, code });
};

/**
 * @desc    Deliveries this driver can take, is carrying, or has finished
 * @route   GET /api/drivers/me/deliveries
 * @access  Approved Driver
 */
export const listDeliveries = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const driverId = String(req.auth?.id);

    const [driver, orders] = await Promise.all([
      prisma.driver.findUniqueOrThrow({
        where: { id: driverId },
        select: { isAvailable: true },
      }),
      prisma.order.findMany({
        where: {
          OR: [
            { status: ORDER_STATUS.READY, driverId: null },
            { driverId, status: { in: [...DRIVER_ACTIVE_STATUSES, ORDER_STATUS.DELIVERED] } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: ORDER_INCLUDE,
      }),
    ]);

    res.status(200).json({
      success: true,
      data: { online: driver.isAvailable, deliveries: orders.map(toDeliveryDto) },
    });
  },
);

/**
 * @desc    Go online or offline
 * @route   PATCH /api/drivers/me/online
 * @access  Approved Driver
 */
export const setOnline = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    if (typeof req.body?.online !== "boolean") {
      fail(res, 400, "online must be true or false", ERROR_CODES.VALIDATION_FAILED);
      return;
    }
    const driverId = String(req.auth?.id);

    // A driver can't go off the grid with someone's order in the car.
    if (!req.body.online) {
      const active = await prisma.order.count({
        where: { driverId, status: { in: DRIVER_ACTIVE_STATUSES } },
      });
      if (active > 0) {
        fail(res, 409, "Finish your current delivery first", ERROR_CODES.VALIDATION_FAILED);
        return;
      }
    }

    const driver = await prisma.driver.update({
      where: { id: driverId },
      data: { isAvailable: req.body.online },
    });
    res.status(200).json({ success: true, data: { online: driver.isAvailable } });
  },
);

/**
 * @desc    Take the next step on a delivery: accept, pick up, then deliver
 * @route   POST /api/drivers/me/deliveries/:id/advance
 * @access  Approved Driver
 *
 * The step is derived from where the delivery is, never from the request, so
 * a driver can only ever move forward by one.
 */
export const advanceDelivery = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const driverId = String(req.auth?.id);
    const id = String(req.params.id);

    const result = await prisma.$transaction(
      async (tx): Promise<{ error: [number, string] } | { order: OrderWithItems }> => {
        // Serialise this driver's own taps, so two quick "accept"s can't both
        // pass the one-delivery-at-a-time check below.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${driverId}))`;

        const order = await tx.order.findUnique({ where: { id } });
        if (!order) return { error: [404, "Delivery not found"] };

        const mine = order.driverId === driverId;
        let where: Prisma.OrderWhereInput;
        let data: Prisma.OrderUpdateManyMutationInput & { driverId?: string };

        if (order.status === ORDER_STATUS.READY && order.driverId === null) {
          // available -> accepted
          const driver = await tx.driver.findUniqueOrThrow({
            where: { id: driverId },
            select: { isAvailable: true },
          });
          if (!driver.isAvailable) return { error: [409, "Go online to accept deliveries"] };

          const active = await tx.order.count({
            where: { driverId, status: { in: DRIVER_ACTIVE_STATUSES } },
          });
          if (active > 0) return { error: [409, "Finish your current delivery first"] };

          // Claimed only if nobody else got there first.
          where = { id, status: ORDER_STATUS.READY, driverId: null };
          data = { driverId };
        } else if (mine && order.status === ORDER_STATUS.READY) {
          // accepted -> picked_up
          where = { id, driverId, status: ORDER_STATUS.READY };
          data = { status: ORDER_STATUS.OUT_FOR_DELIVERY };
        } else if (mine && order.status === ORDER_STATUS.OUT_FOR_DELIVERY) {
          // picked_up -> delivered
          where = { id, driverId, status: ORDER_STATUS.OUT_FOR_DELIVERY };
          data = { status: ORDER_STATUS.DELIVERED, deliveredAt: new Date() };
        } else {
          return { error: [409, "This delivery can't be moved any further"] };
        }

        const moved = await tx.order.updateMany({ where, data });
        if (moved.count === 0) return { error: [409, "Another driver just took this delivery"] };

        return {
          order: await tx.order.findUniqueOrThrow({ where: { id }, include: ORDER_INCLUDE }),
        };
      },
    );

    if ("error" in result) {
      fail(res, result.error[0], result.error[1],
        result.error[0] === 404 ? ERROR_CODES.NOT_FOUND : ERROR_CODES.VALIDATION_FAILED);
      return;
    }

    logger.info(`Delivery ${result.order.number} -> ${stageOf(result.order)} (driver ${driverId})`);
    res.status(200).json({ success: true, data: toDeliveryDto(result.order) });
  },
);
