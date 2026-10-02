import { Types } from "mongoose";

import { getFirebaseMessaging } from "../config/firebaseAdmin";
import Admin from "../models/Admin";
import Merchant from "../models/Merchant";
import { IOrder } from "../models/Order";
import logger from "../utils/logger";

const MAX_TOKENS_PER_USER = 10;
const STALE_TOKEN_CODE = "messaging/registration-token-not-registered";

/**
 * Pushes "new order" to every active admin and to each merchant whose
 * products are in the order. Never throws: callers fire-and-forget this after
 * the order is saved, and a push problem must not touch the order.
 */
export const notifyNewOrder = async (order: IOrder): Promise<void> => {
  try {
    const merchantIds = [
      ...new Set(
        order.items.flatMap((i) => (i.merchant ? [String(i.merchant)] : [])),
      ),
    ];

    const [admins, merchants] = await Promise.all([
      Admin.find({ isActive: true }).select("+fcmTokens"),
      Merchant.find({ _id: { $in: merchantIds }, isActive: true }).select(
        "+fcmTokens",
      ),
    ]);

    const owners = [
      ...admins.map((a) => ({ model: Admin, id: a._id, tokens: a.fcmTokens })),
      ...merchants.map((m) => ({
        model: Merchant,
        id: m._id,
        tokens: m.fcmTokens,
      })),
    ];

    const tokens = [...new Set(owners.flatMap((o) => o.tokens ?? []))];
    if (tokens.length === 0) return;

    const itemCount = order.items.reduce((n, i) => n + i.quantity, 0);
    const result = await getFirebaseMessaging().sendEachForMulticast({
      tokens,
      notification: {
        title: "New order",
        body: `₹${order.total} · ${itemCount} item${itemCount === 1 ? "" : "s"}`,
      },
      data: { orderId: String(order._id), type: "order.placed" },
    });

    const stale = tokens.filter(
      (_, i) => result.responses[i].error?.code === STALE_TOKEN_CODE,
    );
    if (stale.length > 0) {
      await Promise.all(
        owners.map((o) =>
          (o.model as typeof Admin).updateOne(
            { _id: o.id },
            { $pull: { fcmTokens: { $in: stale } } },
          ),
        ),
      );
    }

    logger.info(
      `Order ${order._id} push: ${result.successCount} sent, ${result.failureCount} failed`,
    );
  } catch (err) {
    logger.error("Order push notification failed", { error: err });
  }
};

/** Stores a device token on the signed-in admin/merchant (de-duped, capped). */
export const saveDeviceToken = async (
  model: typeof Admin | typeof Merchant,
  id: string | Types.ObjectId,
  token: string,
): Promise<void> => {
  const m = model as typeof Admin;
  await m.updateOne({ _id: id }, { $pull: { fcmTokens: token } });
  await m.updateOne(
    { _id: id },
    { $push: { fcmTokens: { $each: [token], $slice: -MAX_TOKENS_PER_USER } } },
  );
};

export const removeDeviceToken = async (
  model: typeof Admin | typeof Merchant,
  id: string | Types.ObjectId,
  token: string,
): Promise<void> => {
  await (model as typeof Admin).updateOne(
    { _id: id },
    { $pull: { fcmTokens: token } },
  );
};
