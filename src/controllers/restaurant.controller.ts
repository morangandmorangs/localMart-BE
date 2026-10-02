import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import Restaurant from "../models/Restaurant";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import {
  pickRestaurantFields,
  toRestaurantDto,
} from "../services/product.service";
import { AuthedRequest, ROLES } from "../types/auth.types";

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
    const filter: Record<string, unknown> = { isActive: true };
    if (req.query.openOnly === "true") filter.isOpen = true;

    // Open kitchens first, then by rating: a shut five-star kitchen is less
    // use to someone ordering dinner than an open four-star one.
    const restaurants = await Restaurant.find(filter).sort({
      isOpen: -1,
      rating: -1,
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
    const restaurant = await Restaurant.findOne({
      restaurantId: String(req.params.restaurantId),
      isActive: true,
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

    if (await Restaurant.findOne({ restaurantId })) {
      res.status(409).json({
        success: false,
        message: `A restaurant with id "${restaurantId}" already exists`,
        code: ERROR_CODES.ALREADY_EXISTS,
      });
      return;
    }

    const restaurant = new Restaurant({
      ...pickRestaurantFields(req.body),
      restaurantId: String(restaurantId).trim(),
      // Ownership from the token, never the body.
      merchant:
        req.auth?.role === ROLES.MERCHANT ? req.auth.id : req.body.merchant,
    });

    const invalid = restaurant.validateSync();
    if (invalid) {
      res.status(400).json({
        success: false,
        message: invalid.message,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    await restaurant.save();
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
    const restaurant = await Restaurant.findOne({
      restaurantId: String(req.params.restaurantId),
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
      String(restaurant.merchant ?? "") !== req.auth.id
    ) {
      res.status(403).json({
        success: false,
        message: "This kitchen belongs to another merchant",
        code: ERROR_CODES.FORBIDDEN,
      });
      return;
    }

    restaurant.set(pickRestaurantFields(req.body));

    const invalid = restaurant.validateSync();
    if (invalid) {
      res.status(400).json({
        success: false,
        message: invalid.message,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    await restaurant.save();
    logger.info(`Restaurant updated: ${restaurant.restaurantId}`);

    res.status(200).json({
      success: true,
      message: "Restaurant updated",
      data: toRestaurantDto(restaurant),
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
    const restaurant = await Restaurant.findOne({
      restaurantId: String(req.params.restaurantId),
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
      String(restaurant.merchant ?? "") !== req.auth.id
    ) {
      res.status(403).json({
        success: false,
        message: "This kitchen belongs to another merchant",
        code: ERROR_CODES.FORBIDDEN,
      });
      return;
    }

    restaurant.isActive = false;
    await restaurant.save();
    logger.info(`Restaurant retired: ${restaurant.restaurantId}`);

    res.status(200).json({
      success: true,
      message: "Restaurant retired",
      data: { id: restaurant.restaurantId, isActive: restaurant.isActive },
    });
  },
);
