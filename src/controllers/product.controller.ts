import { Request, Response } from "express";
import asyncHandler from "express-async-handler";

import prisma from "../config/prisma";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import {
  PRODUCT_INCLUDE,
  ProductCandidate,
  applyStockFilter,
  buildProductFilter,
  hasAnyStock,
  isCategorySlug,
  normaliseVariants,
  pickProductFields,
  resolveCatalogMode,
  toProductDto,
  validateProduct,
  variantRows,
} from "../services/product.service";
import type { Prisma } from "../generated/prisma/client";
import { AuthedRequest, ROLES } from "../types/auth.types";
import { CATEGORY_SLUG_VALUES } from "../types/catalog.types";
import {
  allowedCategories,
  canListCategory,
  knownMerchantTypes,
} from "../types/merchant.types";

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
    const products = await prisma.product.findMany({
      where: filter,
      orderBy: { name: "asc" },
      include: PRODUCT_INCLUDE,
    });
    // In live mode the shelves drop anything with no stock; in preview mode
    // (nothing stocked yet) they show the whole catalogue.
    const mode = resolveCatalogMode(await hasAnyStock(prisma));
    const visible = applyStockFilter(
      products,
      mode === "live" ? "true" : (req.query.inStock as string),
    );

    res.status(200).json({
      success: true,
      count: visible.length,
      // Clients show stock status only when it means something.
      meta: { mode, showStock: mode === "live" },
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
  const product = await prisma.product.findFirst({
    where: { productId: String(req.params.productId), isActive: true },
    include: PRODUCT_INCLUDE,
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

    if (await prisma.product.findUnique({ where: { productId: String(productId).trim() } })) {
      res.status(409).json({
        success: false,
        message: `A product with id "${productId}" already exists`,
        code: ERROR_CODES.ALREADY_EXISTS,
      });
      return;
    }

    const fields = pickProductFields(req.body);
    const variants = normaliseVariants(req.body.variants);

    const problem = validateProduct({
      ...(fields as Omit<ProductCandidate, "productId" | "variants">),
      productId: String(productId).trim(),
      variants,
    });
    if (problem) {
      res.status(400).json({
        success: false,
        message: problem,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    // A merchant lists only what their business type sells: a restaurant has
    // no shelves, a vegetable vendor has no medicines. Admins are not bound.
    if (req.auth?.role === ROLES.MERCHANT) {
      const owner = await prisma.merchant.findUnique({
        where: { id: req.auth.id },
        select: { businessTypes: true },
      });
      const types = knownMerchantTypes(owner?.businessTypes);
      if (!canListCategory(types, String(fields.category))) {
        const allowed = allowedCategories(types);
        res.status(403).json({
          success: false,
          message: allowed.length
            ? `Your business types can list products in: ${allowed.join(", ")}`
            : "Your business types cannot list products",
          code: ERROR_CODES.FORBIDDEN,
        });
        return;
      }
    }

    // Ownership comes from the token, never the body: a merchant may only
    // ever create stock under their own account. An admin may name one, but
    // it has to be a real merchant.
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

    const product = await prisma.product.create({
      data: {
        ...(fields as Prisma.ProductUncheckedCreateInput),
        productId: String(productId).trim(),
        merchantId,
        ...(variants ? { variants: { create: variantRows(variants) } } : {}),
      },
      include: PRODUCT_INCLUDE,
    });
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
    const product = await prisma.product.findUnique({
      where: { productId: String(req.params.productId) },
      include: PRODUCT_INCLUDE,
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
      product.merchantId !== req.auth.id
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

    // Moving a product to another aisle must not sidestep the business type.
    if (
      req.auth?.role === ROLES.MERCHANT &&
      fields.category !== undefined &&
      fields.category !== product.category
    ) {
      const owner = await prisma.merchant.findUnique({
        where: { id: req.auth.id },
        select: { businessTypes: true },
      });
      if (!canListCategory(knownMerchantTypes(owner?.businessTypes), String(fields.category))) {
        res.status(403).json({
          success: false,
          message: "Your business type cannot list in that category",
          code: ERROR_CODES.FORBIDDEN,
        });
        return;
      }
    }

    // Validate the product as it would stand after the write, so a patch
    // that only sets `variants` is still checked against the existing price.
    const problem = validateProduct({
      productId: product.productId,
      name: product.name,
      image: product.image,
      category: product.category,
      subCategory: product.subCategory,
      requiresPrescription: product.requiresPrescription,
      price: product.price === null ? undefined : Number(product.price),
      stockCount: product.stockCount ?? undefined,
      ...(fields as Omit<ProductCandidate, "productId" | "variants">),
      variants:
        variants ??
        product.variants.map((v) => ({
          variantId: v.variantId,
          label: v.label,
          price: Number(v.price),
          stockCount: v.stockCount,
        })),
    });
    if (problem) {
      res.status(400).json({
        success: false,
        message: problem,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    // Replacing variants is delete-and-recreate, in one transaction so a
    // failure can't leave the product with no sizes.
    const updated = await prisma.$transaction(async (tx) => {
      if (variants) {
        await tx.productVariant.deleteMany({ where: { productRef: product.id } });
      }
      return tx.product.update({
        where: { id: product.id },
        data: {
          ...(fields as Prisma.ProductUncheckedUpdateInput),
          ...(variants ? { variants: { create: variantRows(variants) } } : {}),
        },
        include: PRODUCT_INCLUDE,
      });
    });
    logger.info(`Product updated: ${updated.productId}`);

    res.status(200).json({
      success: true,
      message: "Product updated",
      data: toProductDto(updated),
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
    const product = await prisma.product.findUnique({
      where: { productId: String(req.params.productId) },
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
      product.merchantId !== req.auth.id
    ) {
      res.status(403).json({
        success: false,
        message: "This product belongs to another merchant",
        code: ERROR_CODES.FORBIDDEN,
      });
      return;
    }

    const retired = await prisma.product.update({
      where: { id: product.id },
      data: { isActive: false },
    });
    logger.info(`Product retired: ${retired.productId}`);

    res.status(200).json({
      success: true,
      message: "Product retired",
      data: { id: retired.productId, isActive: retired.isActive },
    });
  },
);
