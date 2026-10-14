import { Response } from "express";
import asyncHandler from "express-async-handler";

import prisma from "../config/prisma";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import { ORDER_INCLUDE, toOrderDto } from "../services/order.service";
import {
  PRODUCT_INCLUDE,
  toProductDto,
} from "../services/product.service";
import { AuthedRequest } from "../types/auth.types";
import {
  MERCHANT_TRANSITIONS,
  ORDER_STATUS,
  OrderStatus,
} from "../types/order.types";

const fail = (
  res: Response,
  status: number,
  message: string,
  code: string = ERROR_CODES.VALIDATION_FAILED,
) => {
  res.status(status).json({ success: false, message, code });
};

/**
 * @desc    This shop's orders, newest first
 * @route   GET /api/merchants/me/orders
 * @access  Approved Merchant
 *
 * Only this merchant's orders: the filter is the token's id, never a query
 * parameter, so one shop can never read another's.
 */
export const listShopOrders = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const orders = await prisma.order.findMany({
      where: { merchantId: String(req.auth?.id) },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: ORDER_INCLUDE,
    });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders.map(toOrderDto),
    });
  },
);

/**
 * @desc    Move an order along: accept or reject, then pack, then ready
 * @route   PATCH /api/merchants/me/orders/:id/status
 * @access  Approved Merchant
 *
 * The transition table is the merchant's whole authority. Picking up and
 * delivering belong to the driver, and the API refuses any other move.
 */
export const updateShopOrderStatus = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const next = req.body?.status as OrderStatus | undefined;
    const merchantId = String(req.auth?.id);
    const id = String(req.params.id);

    const order = await prisma.order.findFirst({ where: { id, merchantId } });
    if (!order) {
      fail(res, 404, "Order not found", ERROR_CODES.NOT_FOUND);
      return;
    }

    const current = order.status as OrderStatus;
    if (!next || !MERCHANT_TRANSITIONS[current]?.includes(next)) {
      fail(res, 409, `Cannot move an order from ${current} to ${next ?? "nothing"}`);
      return;
    }

    // Guarded on the status we just read, so two taps (or two devices) can't
    // both apply the same move.
    const moved = await prisma.order.updateMany({
      where: { id, merchantId, status: current },
      data: {
        status: next,
        ...(next === ORDER_STATUS.READY ? { readyAt: new Date() } : {}),
      },
    });
    if (moved.count === 0) {
      fail(res, 409, "This order was just updated. Refresh and try again.");
      return;
    }

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: ORDER_INCLUDE,
    });
    logger.info(`Order ${order.number}: ${current} -> ${next} (merchant ${merchantId})`);

    res.status(200).json({
      success: true,
      message: `Order ${next}`,
      data: toOrderDto(updated),
    });
  },
);

/**
 * @desc    The shop's name, area and whether it is taking orders
 * @route   GET /api/merchants/me/shop
 * @access  Merchant
 */
export const getShop = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const m = await prisma.merchant.findUnique({
    where: { id: String(req.auth?.id) },
  });
  if (!m) {
    fail(res, 404, "Merchant not found", ERROR_CODES.NOT_FOUND);
    return;
  }
  res.status(200).json({
    success: true,
    data: {
      name: m.shopName ?? m.name,
      owner: m.name,
      area: m.area ?? undefined,
      isOpen: m.isOpen,
      profileStatus: m.profileStatus,
    },
  });
});

/**
 * @desc    Open or close the shop for new orders
 * @route   PATCH /api/merchants/me/shop
 * @access  Approved Merchant
 */
export const setShopOpen = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    if (typeof req.body?.isOpen !== "boolean") {
      fail(res, 400, "isOpen must be true or false");
      return;
    }
    const m = await prisma.merchant.update({
      where: { id: String(req.auth?.id) },
      data: { isOpen: req.body.isOpen },
    });
    res.status(200).json({ success: true, data: { isOpen: m.isOpen } });
  },
);

/**
 * @desc    This merchant's own products, including hidden ones
 * @route   GET /api/products/merchant/stock
 * @access  Approved Merchant
 */
export const listShopProducts = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const products = await prisma.product.findMany({
      where: { merchantId: String(req.auth?.id) },
      orderBy: { name: "asc" },
      include: PRODUCT_INCLUDE,
    });
    res.status(200).json({
      success: true,
      count: products.length,
      data: products.map(toProductDto),
    });
  },
);

/**
 * @desc    Add or remove stock on one product or one size of it
 * @route   POST /api/products/merchant/stock/:productId/adjust
 * @access  Approved Merchant (own products)
 * @body    { delta: number, variantId?: string }
 *
 * A relative change applied in the database, not a read-then-write of the
 * new total: two taps on the stepper, or a sale landing at the same moment,
 * must add up rather than overwrite each other. Floors at zero.
 */
export const adjustShopStock = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const delta = Number(req.body?.delta);
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000) {
      fail(res, 400, "delta must be a non-zero whole number");
      return;
    }

    const merchantId = String(req.auth?.id);
    const productId = String(req.params.productId);
    const variantId = req.body?.variantId ? String(req.body.variantId) : undefined;

    const product = await prisma.product.findFirst({
      where: { productId, merchantId },
      include: PRODUCT_INCLUDE,
    });
    if (!product) {
      fail(res, 404, "Product not found", ERROR_CODES.NOT_FOUND);
      return;
    }

    if (variantId) {
      const variant = product.variants.find((v) => v.variantId === variantId);
      if (!variant) {
        fail(res, 400, `"${variantId}" is not a size of "${productId}"`);
        return;
      }
      await prisma.$executeRaw`UPDATE "ProductVariant" SET "stockCount" = GREATEST(0, "stockCount" + ${delta}) WHERE "id" = ${variant.id}`;
    } else {
      if (product.variants.length > 0) {
        fail(res, 400, "This product is sold in sizes: pass a variantId");
        return;
      }
      await prisma.$executeRaw`UPDATE "Product" SET "stockCount" = GREATEST(0, COALESCE("stockCount", 0) + ${delta}) WHERE "id" = ${product.id}`;
    }

    const updated = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: PRODUCT_INCLUDE,
    });
    res.status(200).json({ success: true, data: toProductDto(updated) });
  },
);
