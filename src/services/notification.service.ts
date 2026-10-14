import { getFirebaseMessaging } from "../config/firebaseAdmin";
import prisma from "../config/prisma";
import logger from "../utils/logger";
import type { OrderWithItems } from "./order.service";

const MAX_TOKENS_PER_USER = 10;
const STALE_TOKEN_CODE = "messaging/registration-token-not-registered";

/** Who a device token belongs to: an admin or a merchant, never both. */
export type TokenOwner = { kind: "admin" | "merchant"; id: string };

const ownerColumn = (owner: TokenOwner) =>
  owner.kind === "admin" ? "adminId" : "merchantId";

/**
 * Pushes "new order" to every active admin and to each merchant whose
 * products are in the order. Never throws: callers fire-and-forget this after
 * the order is saved, and a push problem must not touch the order.
 */
export const notifyNewOrder = async (order: OrderWithItems): Promise<void> => {
  try {
    const merchantIds = [
      ...new Set(order.items.flatMap((i) => (i.merchantId ? [i.merchantId] : []))),
    ];

    const rows = await prisma.deviceToken.findMany({
      where: {
        OR: [
          { admin: { isActive: true } },
          { merchantId: { in: merchantIds }, merchant: { isActive: true } },
        ],
      },
      select: { token: true },
    });

    const tokens = rows.map((r) => r.token);
    if (tokens.length === 0) return;

    const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
    const result = await getFirebaseMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "New order",
        body: `₹${Number(order.total)} · ${itemCount} item${itemCount === 1 ? "" : "s"}`,
      },
      data: { orderId: order.id, type: "order.placed" },
    });

    const stale = tokens.filter(
      (_, i) => result.responses[i].error?.code === STALE_TOKEN_CODE,
    );
    if (stale.length > 0) {
      await prisma.deviceToken.deleteMany({ where: { token: { in: stale } } });
    }

    logger.info(
      `Order ${order.id} push: ${result.successCount} sent, ${result.failureCount} failed`,
    );
  } catch (err) {
    logger.error("Order push notification failed", { error: err });
  }
};

/**
 * Stores a device token on the signed-in admin/merchant (de-duped, capped).
 *
 * A token is unique, so a device that signs in as someone else moves to them
 * instead of alerting both. Re-saving refreshes it to newest, and anything
 * past the cap is dropped oldest-first.
 */
export const saveDeviceToken = async (
  owner: TokenOwner,
  token: string,
): Promise<void> => {
  const column = ownerColumn(owner);
  const other = owner.kind === "admin" ? "merchantId" : "adminId";

  await prisma.deviceToken.upsert({
    where: { token },
    create: { token, [column]: owner.id },
    update: { [column]: owner.id, [other]: null, createdAt: new Date() },
  });

  const overflow = await prisma.deviceToken.findMany({
    where: { [column]: owner.id },
    orderBy: { createdAt: "desc" },
    skip: MAX_TOKENS_PER_USER,
    select: { id: true },
  });
  if (overflow.length > 0) {
    await prisma.deviceToken.deleteMany({
      where: { id: { in: overflow.map((t) => t.id) } },
    });
  }
};

export const removeDeviceToken = async (
  owner: TokenOwner,
  token: string,
): Promise<void> => {
  await prisma.deviceToken.deleteMany({
    where: { token, [ownerColumn(owner)]: owner.id },
  });
};
