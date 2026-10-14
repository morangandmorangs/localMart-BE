import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import prisma from "../config/prisma";
import type { Prisma } from "../generated/prisma/client";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import {
  pickRestaurantFields,
  toRestaurantDto,
  validateRestaurant,
} from "../services/product.service";
import { AuthedRequest, ROLES } from "../types/auth.types";
import { canRunKitchen, knownMerchantTypes } from "../types/merchant.types";

/**
 * @desc    List restaurants
 * @route   GET /api/restaurants?openOnly=true
 * @access  Public
 *
 * Closed kitchens are returned by default rather than hidden: the Food page
 * shows them greyed out, which tells a customer the kitchen exists and to
 * come back, instead of making it look as though it had closed for good.
 */
export const listRestaurants = asyncHandler(
  async (req: Request, res: Response) => {
    const filter: Prisma.RestaurantWhereInput = { isActive: true };
    if (req.query.openOnly === "true") filter.isOpen = true;

    // Open kitchens first, then by rating: a shut five-star kitchen is less
    // use to someone ordering dinner than an open four-star one.
    const restaurants = await prisma.restaurant.findMany({
      where: filter,
      orderBy: [{ isOpen: "desc" }, { rating: "desc" }],
    });

    res.status(200).json({
      success: true,
      count: restaurants.length,
      data: restaurants.map(toRestaurantDto),
    });
  },
);

/**
 * @desc    One restaurant by its public id
 * @route   GET /api/restaurants/:restaurantId
 * @access  Public
 */
export const getRestaurant = asyncHandler(
  async (req: Request, res: Response) => {
    const restaurant = await prisma.restaurant.findFirst({
      where: { restaurantId: String(req.params.restaurantId), isActive: true },
    });

    if (!restaurant) {
      res.status(404).json({
        success: false,
        message: "Restaurant not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    res.status(200).json({ success: true, data: toRestaurantDto(restaurant) });
  },
);

/**
 * @desc    Create a restaurant
 * @route   POST /api/restaurants
 * @access  Admin | approved Merchant
 */
export const createRestaurant = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const { restaurantId } = req.body;

    if (!restaurantId) {
      res.status(400).json({
        success: false,
        message: "restaurantId is required",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    if (await prisma.restaurant.findUnique({ where: { restaurantId: String(restaurantId).trim() } })) {
      res.status(409).json({
        success: false,
        message: `A restaurant with id "${restaurantId}" already exists`,
        code: ERROR_CODES.ALREADY_EXISTS,
      });
      return;
    }

    const fields = pickRestaurantFields(req.body);

    const problem = validateRestaurant({
      ...fields,
      restaurantId: String(restaurantId).trim(),
    });
    if (problem) {
      res.status(400).json({
        success: false,
        message: problem,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    // Only a restaurant-type merchant runs a kitchen. Admins are not bound.
    if (req.auth?.role === ROLES.MERCHANT) {
      const owner = await prisma.merchant.findUnique({
        where: { id: req.auth.id },
        select: { businessTypes: true },
      });
      if (!canRunKitchen(knownMerchantTypes(owner?.businessTypes))) {
        res.status(403).json({
          success: false,
          message: "Only a restaurant merchant can list a kitchen",
          code: ERROR_CODES.FORBIDDEN,
        });
        return;
      }
    }

    // Ownership from the token, never the body. An admin may name a merchant,
    // but it has to be a real one.
    const merchantId =
      req.auth?.role === ROLES.MERCHANT
        ? req.auth.id
        : req.body.merchant
          ? String(req.body.merchant)
          : undefined;
    if (
      merchantId &&
      req.auth?.role !== ROLES.MERCHANT &&
      !(await prisma.merchant.findUnique({ where: { id: merchantId } }))
    ) {
      res.status(400).json({
        success: false,
        message: "merchant does not exist",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        ...(fields as Prisma.RestaurantUncheckedCreateInput),
        restaurantId: String(restaurantId).trim(),
        merchantId,
      },
    });
    logger.info(`Restaurant created: ${restaurant.restaurantId}`);

    res.status(201).json({
      success: true,
      message: "Restaurant created",
      data: toRestaurantDto(restaurant),
    });
  },
);

/**
 * @desc    Update a restaurant — including opening and closing the kitchen
 * @route   PATCH /api/restaurants/:restaurantId
 * @access  Admin | the owning Merchant
 */
export const updateRestaurant = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const restaurant = await prisma.restaurant.findUnique({
      where: { restaurantId: String(req.params.restaurantId) },
    });

    if (!restaurant) {
      res.status(404).json({
        success: false,
        message: "Restaurant not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    if (
      req.auth?.role === ROLES.MERCHANT &&
      restaurant.merchantId !== req.auth.id
    ) {
      res.status(403).json({
        success: false,
        message: "This kitchen belongs to another merchant",
        code: ERROR_CODES.FORBIDDEN,
      });
      return;
    }

    const fields = pickRestaurantFields(req.body);

    // Validate the kitchen as it would stand after the write.
    const problem = validateRestaurant({
      restaurantId: restaurant.restaurantId,
      name: restaurant.name,
      image: restaurant.image,
      cuisine: restaurant.cuisine,
      rating: Number(restaurant.rating),
      ratingCount: restaurant.ratingCount,
      prepMinutes: restaurant.prepMinutes,
      priceForTwo: Number(restaurant.priceForTwo),
      ...fields,
    });
    if (problem) {
      res.status(400).json({
        success: false,
        message: problem,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const updated = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: fields as Prisma.RestaurantUncheckedUpdateInput,
    });
    logger.info(`Restaurant updated: ${updated.restaurantId}`);

    res.status(200).json({
      success: true,
      message: "Restaurant updated",
      data: toRestaurantDto(updated),
    });
  },
);

/**
 * @desc    Retire a restaurant
 * @route   DELETE /api/restaurants/:restaurantId
 * @access  Admin | the owning Merchant
 *
 * Deactivates rather than deletes, so past orders keep pointing somewhere.
 * To stop taking orders for the evening, PATCH isOpen instead.
 */
export const deleteRestaurant = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const restaurant = await prisma.restaurant.findUnique({
      where: { restaurantId: String(req.params.restaurantId) },
    });

    if (!restaurant) {
      res.status(404).json({
        success: false,
        message: "Restaurant not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    if (
      req.auth?.role === ROLES.MERCHANT &&
      restaurant.merchantId !== req.auth.id
    ) {
      res.status(403).json({
        success: false,
        message: "This kitchen belongs to another merchant",
        code: ERROR_CODES.FORBIDDEN,
      });
      return;
    }

    const retired = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { isActive: false },
    });
    logger.info(`Restaurant retired: ${retired.restaurantId}`);

    res.status(200).json({
      success: true,
      message: "Restaurant retired",
      data: { id: retired.restaurantId, isActive: retired.isActive },
    });
  },
);
