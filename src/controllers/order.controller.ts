import { Response } from "express";
import asyncHandler from "express-async-handler";

import prisma from "../config/prisma";
import { PRODUCT_INCLUDE } from "../services/product.service";
import { ERROR_CODES } from "../utils/errorResponse";
import { notifyNewOrder } from "../services/notification.service";
import { ORDER_INCLUDE, toOrderDto } from "../services/order.service";
import { DRIVER_PAYOUT_RUPEES } from "../types/order.types";
import { AuthedRequest } from "../types/auth.types";

interface OrderItemInput {
  productId?: unknown;
  variantId?: unknown;
  quantity?: unknown;
}

/**
 * @desc    Place an order from the current cart
 * @route   POST /api/orders
 * @access  Customer
 *
 * Only productId/variantId/quantity come from the client — name and price
 * are always resolved from the live Product, the same way
 * product.controller.ts never trusts a client-sent price. A tampered
 * request can pick what it buys, never what it pays.
 */
export const createOrder = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const { addressId, paymentMethod, items } = req.body as {
      addressId?: unknown;
      paymentMethod?: unknown;
      items?: OrderItemInput[];
    };

    if (paymentMethod !== "gpay" && paymentMethod !== "phonepe") {
      res.status(400).json({
        success: false,
        message: 'paymentMethod must be "gpay" or "phonepe"',
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        success: false,
        message: "items must be a non-empty array",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const customer = await prisma.customer.findUnique({
      where: { id: String(req.auth?.id) },
    });
    if (!customer) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    const address = await prisma.address.findFirst({
      where: { id: String(addressId), customerId: customer.id },
    });
    if (!address) {
      res.status(400).json({
        success: false,
        message: "That address doesn't belong to this account",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const resolvedItems: {
      productId: string;
      variantId?: string;
      name: string;
      price: number;
      quantity: number;
      merchantId?: string;
    }[] = [];

    for (const raw of items) {
      const productId = String(raw.productId ?? "").trim();
      const variantId = raw.variantId ? String(raw.variantId).trim() : undefined;
      const quantity = Number(raw.quantity);

      if (!productId || !Number.isFinite(quantity) || quantity < 1) {
        res.status(400).json({
          success: false,
          message: "Each item needs a productId and a quantity of at least 1",
          code: ERROR_CODES.VALIDATION_FAILED,
        });
        return;
      }

      const product = await prisma.product.findFirst({
        where: { productId, isActive: true },
        include: PRODUCT_INCLUDE,
      });
      if (!product) {
        res.status(400).json({
          success: false,
          message: `Product "${productId}" is no longer available`,
          code: ERROR_CODES.VALIDATION_FAILED,
        });
        return;
      }

      const variant = variantId
        ? product.variants.find((v) => v.variantId === variantId)
        : undefined;

      if (variantId && !variant) {
        res.status(400).json({
          success: false,
          message: `"${variantId}" is not a size of "${productId}"`,
          code: ERROR_CODES.VALIDATION_FAILED,
        });
        return;
      }

      const price = variant
        ? Number(variant.price)
        : product.price === null
          ? undefined
          : Number(product.price);
      if (price === undefined) {
        res.status(400).json({
          success: false,
          message: `"${productId}" has no price to charge`,
          code: ERROR_CODES.VALIDATION_FAILED,
        });
        return;
      }

      resolvedItems.push({
        productId,
        variantId,
        name: variant ? `${product.name}, ${variant.label}` : product.name,
        price,
        quantity,
        merchantId: product.merchantId ?? undefined,
      });
    }

    // A closed shop can't take orders: refuse the whole checkout rather than
    // silently dropping its items from the cart.
    const merchantIds = [
      ...new Set(resolvedItems.flatMap((i) => (i.merchantId ? [i.merchantId] : []))),
    ];
    const closed = await prisma.merchant.findMany({
      where: { id: { in: merchantIds }, isOpen: false },
      select: { name: true, shopName: true },
    });
    if (closed.length > 0) {
      res.status(409).json({
        success: false,
        message: `${closed.map((m) => m.shopName ?? m.name).join(", ")} is not taking orders right now`,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    // One order per merchant, so each shop sees and fulfils only its own
    // items and a driver collects from one place. Items with no merchant
    // (unclaimed demo stock) share one order that only an admin sees.
    const groups = new Map<string | null, typeof resolvedItems>();
    for (const item of resolvedItems) {
      const key = item.merchantId ?? null;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    // All the orders land together or not at all.
    const orders = await prisma.$transaction(
      [...groups.entries()].map(([merchantId, lines]) =>
        prisma.order.create({
          data: {
            customerId: customer.id,
            merchantId,
            items: { create: lines },
            addressLabel: address.label,
            addressLine1: address.line1,
            addressCity: address.city,
            addressState: address.state,
            addressPincode: address.pincode,
            paymentMethod,
            total: lines.reduce((sum, l) => sum + l.price * l.quantity, 0),
            driverPayout: DRIVER_PAYOUT_RUPEES,
          },
          include: ORDER_INCLUDE,
        }),
      ),
    );

    // After the response is decided: a push failure must never fail an order.
    for (const order of orders) void notifyNewOrder(order);

    // `data` stays the first order for clients written when a checkout was a
    // single order; `orders` is the full set.
    res.status(201).json({
      success: true,
      message: orders.length > 1 ? `${orders.length} orders placed` : "Order placed",
      data: toOrderDto(orders[0]),
      orders: orders.map(toOrderDto),
    });
  },
);

/**
 * @desc    The signed-in customer's orders, newest first
 * @route   GET /api/orders/mine
 * @access  Customer
 */
export const listMyOrders = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const orders = await prisma.order.findMany({
      where: { customerId: String(req.auth?.id) },
      orderBy: { createdAt: "desc" },
      take: 50,
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
 * @desc    Recent orders, newest first
 * @route   GET /api/orders
 * @access  Admin
 */
export const listOrders = asyncHandler(
  async (_req: AuthedRequest, res: Response) => {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: ORDER_INCLUDE,
    });

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders.map(toOrderDto),
    });
  },
);
