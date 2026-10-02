import { Response } from "express";
import { Types } from "mongoose";
import asyncHandler from "express-async-handler";

import Customer from "../models/Customer";
import Order from "../models/Order";
import Product from "../models/Product";
import { ERROR_CODES } from "../utils/errorResponse";
import { notifyNewOrder } from "../services/notification.service";
import { toOrderDto } from "../services/order.service";
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

    const customer = await Customer.findById(req.auth?.id);
    if (!customer) {
      res.status(404).json({
        success: false,
        message: "Customer not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    const address = customer.addresses.id(String(addressId));
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
      merchant?: Types.ObjectId;
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

      const product = await Product.findOne({ productId, isActive: true });
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

      const price = variant ? variant.price : product.price;
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
        merchant: product.merchant,
      });
    }

    const total = resolvedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const order = await new Order({
      customer: customer._id,
      items: resolvedItems,
      address: {
        label: address.label,
        line1: address.line1,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },
      paymentMethod,
      total,
    }).save();

    // After the response is decided: a push failure must never fail an order.
    void notifyNewOrder(order);

    res.status(201).json({
      success: true,
      message: "Order placed",
      data: toOrderDto(order),
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
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("customer", "name phoneNumber");

    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders.map(toOrderDto),
    });
  },
);
