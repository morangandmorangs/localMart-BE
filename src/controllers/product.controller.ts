import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import Product from "../models/Product";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import {
  applyStockFilter,
  buildProductFilter,
  isCategorySlug,
  normaliseVariants,
  pickProductFields,
  toProductDto,
  validateProductShape,
} from "../services/product.service";
import { AuthedRequest, ROLES } from "../types/auth.types";
import { CATEGORY_SLUG_VALUES } from "../types/catalog.types";

/**
 * @desc    List products, filtered by aisle, shelf, stock or name
 * @route   GET /api/products?category=grocery&subCategory=dairy-bakery
 * @access  Public
 */
export const listProducts = asyncHandler(
  async (req: Request, res: Response) => {
    // A category that isn't one of ours is a client bug, not an empty shelf —
    // say so rather than silently returning the whole catalogue.
    if (req.query.category && !isCategorySlug(req.query.category)) {
      res.status(400).json({
        success: false,
        message: `Unknown category. Expected one of: ${CATEGORY_SLUG_VALUES.join(", ")}`,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const filter = buildProductFilter(req.query);
    const products = await Product.find(filter).sort({ name: 1 });
    const visible = applyStockFilter(products, req.query.inStock as string);

    res.status(200).json({
      success: true,
      count: visible.length,
      data: visible.map(toProductDto),
    });
  },
);

/**
 * @desc    One product by its public id
 * @route   GET /api/products/:productId
 * @access  Public
 */
export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const product = await Product.findOne({
    productId: String(req.params.productId),
    isActive: true,
  });

  if (!product) {
    res.status(404).json({
      success: false,
      message: "Product not found",
      code: ERROR_CODES.NOT_FOUND,
    });
    return;
  }

  res.status(200).json({ success: true, data: toProductDto(product) });
});

/**
 * @desc    Create a product
 * @route   POST /api/products
 * @access  Admin | approved Merchant
 */
export const createProduct = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const { productId } = req.body;

    if (!productId) {
      res.status(400).json({
        success: false,
        message: "productId is required",
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    if (await Product.findOne({ productId })) {
      res.status(409).json({
        success: false,
        message: `A product with id "${productId}" already exists`,
        code: ERROR_CODES.ALREADY_EXISTS,
      });
      return;
    }

    const fields = pickProductFields(req.body);
    const variants = normaliseVariants(req.body.variants);
    if (variants) fields.variants = variants;

    const shapeProblem = validateProductShape({
      productId: String(productId),
      category: fields.category,
      variants: fields.variants,
      price: fields.price,
      requiresPrescription: fields.requiresPrescription,
    });
    if (shapeProblem) {
      res.status(400).json({
        success: false,
        message: shapeProblem,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const product = new Product({
      ...fields,
      productId: String(productId).trim(),
      // Ownership comes from the token, never the body: a merchant may only
      // ever create stock under their own account.
      merchant:
        req.auth?.role === ROLES.MERCHANT ? req.auth.id : req.body.merchant,
    });

    // The model's pre-validate hooks enforce the variants-or-price rule and
    // the Rx-only-in-medicine rule; surface those as 400s, not 500s.
    const invalid = product.validateSync();
    if (invalid) {
      res.status(400).json({
        success: false,
        message: invalid.message,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    await product.save();
    logger.info(`Product created: ${product.productId}`);

    res.status(201).json({
      success: true,
      message: "Product created",
      data: toProductDto(product),
    });
  },
);

/**
 * @desc    Update a product
 * @route   PATCH /api/products/:productId
 * @access  Admin | the owning Merchant
 */
export const updateProduct = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const product = await Product.findOne({
      productId: String(req.params.productId),
    });

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Product not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    // A merchant may only touch their own stock. Checked against the token,
    // so a correct product id is not itself authority to edit it.
    if (
      req.auth?.role === ROLES.MERCHANT &&
      String(product.merchant ?? "") !== req.auth.id
    ) {
      res.status(403).json({
        success: false,
        message: "This product belongs to another merchant",
        code: ERROR_CODES.FORBIDDEN,
      });
      return;
    }

    const fields = pickProductFields(req.body);
    const variants = normaliseVariants(req.body.variants);
    if (variants) fields.variants = variants;

    product.set(fields);

    const shapeProblem = validateProductShape({
      productId: product.productId,
      category: product.category,
      variants: product.variants,
      price: product.price,
      requiresPrescription: product.requiresPrescription,
    });
    if (shapeProblem) {
      res.status(400).json({
        success: false,
        message: shapeProblem,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    const invalid = product.validateSync();
    if (invalid) {
      res.status(400).json({
        success: false,
        message: invalid.message,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    await product.save();
    logger.info(`Product updated: ${product.productId}`);

    res.status(200).json({
      success: true,
      message: "Product updated",
      data: toProductDto(product),
    });
  },
);

/**
 * @desc    Retire a product
 * @route   DELETE /api/products/:productId
 * @access  Admin | the owning Merchant
 *
 * Deactivates rather than deletes: past orders reference these rows, and a
 * hard delete would leave an order history pointing at nothing.
 */
export const deleteProduct = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const product = await Product.findOne({
      productId: String(req.params.productId),
    });

    if (!product) {
      res.status(404).json({
        success: false,
        message: "Product not found",
        code: ERROR_CODES.NOT_FOUND,
      });
      return;
    }

    if (
      req.auth?.role === ROLES.MERCHANT &&
      String(product.merchant ?? "") !== req.auth.id
    ) {
      res.status(403).json({
        success: false,
        message: "This product belongs to another merchant",
        code: ERROR_CODES.FORBIDDEN,
      });
      return;
    }

    product.isActive = false;
    await product.save();
    logger.info(`Product retired: ${product.productId}`);

    res.status(200).json({
      success: true,
      message: "Product retired",
      data: { id: product.productId, isActive: product.isActive },
    });
  },
);
