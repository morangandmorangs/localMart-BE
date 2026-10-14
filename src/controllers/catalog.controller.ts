import { Response } from "express";
import asyncHandler from "express-async-handler";

import prisma from "../config/prisma";
import logger from "../utils/logger";
import { ERROR_CODES } from "../utils/errorResponse";
import {
  PRODUCT_INCLUDE,
  hasAnyStock,
  resolveCatalogMode,
  toProductDto,
} from "../services/product.service";
import { AuthedRequest } from "../types/auth.types";

const MAX_SYNC_ROWS = 500;

/**
 * @desc    Which mode the catalog is in, and how many products it holds
 * @route   GET /api/catalog/status
 * @access  Public
 *
 * `preview` means no stock is connected yet: every product is listed and
 * stock status stays hidden. `live` means stock has arrived: only available
 * products are listed and status is shown.
 */
export const getCatalogStatus = asyncHandler(
  async (_req, res: Response) => {
    const mode = resolveCatalogMode(await hasAnyStock(prisma));
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: PRODUCT_INCLUDE,
    });
    const available = products.filter((p) => toProductDto(p).isAvailable);

    res.status(200).json({
      success: true,
      data: {
        mode,
        showStock: mode === "live",
        total: products.length,
        available: available.length,
        unavailable: products.length - available.length,
      },
    });
  },
);

interface StockRow {
  productId?: unknown;
  variantId?: unknown;
  stockCount?: unknown;
}

/**
 * @desc    Set stock counts in bulk, from the warehouse (WMS) or a merchant feed
 * @route   POST /api/catalog/stock/sync
 * @access  Admin
 * @body    { items: [{ productId, variantId?, stockCount }] }
 *
 * Absolute counts, not deltas: the sender reports what is on the shelf, so a
 * retried or duplicated batch lands on the same numbers. Rows are validated up
 * front and applied in one transaction, so a bad row rejects the whole batch
 * instead of leaving the catalogue half-updated. The first non-zero count
 * flips the catalog from `preview` to `live`.
 */
export const syncCatalogStock = asyncHandler(
  async (req: AuthedRequest, res: Response) => {
    const items: StockRow[] | undefined = req.body?.items;

    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_SYNC_ROWS) {
      res.status(400).json({
        success: false,
        message: `items must be a list of 1 to ${MAX_SYNC_ROWS} rows`,
        code: ERROR_CODES.VALIDATION_FAILED,
      });
      return;
    }

    for (const [i, row] of items.entries()) {
      const count = row?.stockCount;
      if (typeof row?.productId !== "string" || !row.productId.trim()) {
        return void res.status(400).json({
          success: false,
          message: `items[${i}]: productId is required`,
          code: ERROR_CODES.VALIDATION_FAILED,
        });
      }
      if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
        return void res.status(400).json({
          success: false,
          message: `items[${i}]: stockCount must be a whole number, 0 or more`,
          code: ERROR_CODES.VALIDATION_FAILED,
        });
      }
    }

    const productIds = [...new Set(items.map((r) => String(r.productId).trim()))];
    const products = await prisma.product.findMany({
      where: { productId: { in: productIds } },
      include: PRODUCT_INCLUDE,
    });
    const byId = new Map(products.map((p) => [p.productId, p]));

    // Resolve every row to a target before writing anything.
    const writes: { kind: "product" | "variant"; id: string; stockCount: number }[] = [];
    for (const [i, row] of items.entries()) {
      const product = byId.get(String(row.productId).trim());
      if (!product) {
        return void res.status(404).json({
          success: false,
          message: `items[${i}]: product "${row.productId}" not found`,
          code: ERROR_CODES.NOT_FOUND,
        });
      }
      const stockCount = row.stockCount as number;

      if (product.variants.length > 0) {
        const variant = product.variants.find((v) => v.variantId === row.variantId);
        if (!variant) {
          return void res.status(400).json({
            success: false,
            message: `items[${i}]: "${product.productId}" is sold in sizes, pass a valid variantId`,
            code: ERROR_CODES.VALIDATION_FAILED,
          });
        }
        writes.push({ kind: "variant", id: variant.id, stockCount });
      } else {
        writes.push({ kind: "product", id: product.id, stockCount });
      }
    }

    await prisma.$transaction(
      writes.map((w) =>
        w.kind === "variant"
          ? prisma.productVariant.update({ where: { id: w.id }, data: { stockCount: w.stockCount } })
          : prisma.product.update({ where: { id: w.id }, data: { stockCount: w.stockCount } }),
      ),
    );
    logger.info(`Catalog stock synced: ${writes.length} row(s) by ${req.auth?.id}`);

    const mode = resolveCatalogMode(await hasAnyStock(prisma));
    res.status(200).json({
      success: true,
      message: `Updated ${writes.length} stock row(s)`,
      data: { updated: writes.length, mode },
    });
  },
);
