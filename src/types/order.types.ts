/**
 * The order lifecycle. The merchant owns everything up to `ready`; the driver
 * owns the rest. `rejected` is a merchant's way out of a `placed` order.
 */
export const ORDER_STATUS = {
  PLACED: "placed",
  ACCEPTED: "accepted",
  PACKING: "packing",
  READY: "ready",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  REJECTED: "rejected",
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** The only moves a merchant can make. Later stages belong to the driver. */
export const MERCHANT_TRANSITIONS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  [ORDER_STATUS.PLACED]: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.REJECTED],
  [ORDER_STATUS.ACCEPTED]: [ORDER_STATUS.PACKING],
  [ORDER_STATUS.PACKING]: [ORDER_STATUS.READY],
};

/** The statuses a driver is actively carrying (accepted, or picked up). */
export const DRIVER_ACTIVE_STATUSES: OrderStatus[] = [
  ORDER_STATUS.READY,
  ORDER_STATUS.OUT_FOR_DELIVERY,
];

/**
 * What a driver earns per drop, in rupees. A flat fee until distance-based
 * pricing exists; stored on the order at creation so changing it later does
 * not rewrite what drivers were already promised.
 */
export const DRIVER_PAYOUT_RUPEES = Number(process.env.DRIVER_PAYOUT_RUPEES ?? 45);
