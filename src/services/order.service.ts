import type {
  Customer,
  Driver,
  Merchant,
  Order,
  OrderItem,
} from "../generated/prisma/client";
import { OrderStatus } from "../types/order.types";

export interface OrderItemDto {
  productId: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
}

export interface OrderAddressDto {
  label: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderDto {
  id: string;
  /** The short number people say out loud ("1039"). */
  number: number;
  customer: { id: string; name?: string; phoneNumber?: string };
  /** The shop fulfilling this order, when the caller included it. */
  merchant?: { id: string; name: string; area?: string };
  items: OrderItemDto[];
  address: OrderAddressDto;
  paymentMethod: string;
  total: number;
  status: OrderStatus;
  /** What a driver earns for this drop (rupees). */
  driverPayout: number;
  driverId?: string;
  createdAt: Date;
  readyAt?: Date;
  deliveredAt?: Date;
}

/** An order with its lines, and the relations the caller chose to include. */
export type OrderWithItems = Order & {
  items: OrderItem[];
  customer?: Pick<Customer, "name" | "phoneNumber">;
  merchant?: Pick<Merchant, "id" | "name" | "shopName" | "area"> | null;
  driver?: Pick<Driver, "id" | "name"> | null;
};

/** What a caller must include to get a full OrderDto back. */
export const ORDER_INCLUDE = {
  items: true,
  customer: { select: { name: true, phoneNumber: true } },
  merchant: { select: { id: true, name: true, shopName: true, area: true } },
} as const;

const toOrderItemDto = (item: OrderItem): OrderItemDto => ({
  productId: item.productId,
  variantId: item.variantId ?? undefined,
  name: item.name,
  price: Number(item.price),
  quantity: item.quantity,
});

/**
 * Mirrors toProductDto/toCustomerProfile: database internals never reach the
 * client. Customer and merchant details are present when the caller included
 * those relations.
 */
export const toOrderDto = (order: OrderWithItems): OrderDto => ({
  id: order.id,
  number: order.number,
  customer: {
    id: order.customerId,
    name: order.customer?.name ?? undefined,
    phoneNumber: order.customer?.phoneNumber ?? undefined,
  },
  ...(order.merchant
    ? {
        merchant: {
          id: order.merchant.id,
          name: order.merchant.shopName ?? order.merchant.name,
          area: order.merchant.area ?? undefined,
        },
      }
    : {}),
  items: order.items.map(toOrderItemDto),
  address: {
    label: order.addressLabel,
    line1: order.addressLine1,
    city: order.addressCity,
    state: order.addressState,
    pincode: order.addressPincode,
  },
  paymentMethod: order.paymentMethod,
  total: Number(order.total),
  status: order.status as OrderStatus,
  driverPayout: Number(order.driverPayout),
  driverId: order.driverId ?? undefined,
  createdAt: order.createdAt,
  readyAt: order.readyAt ?? undefined,
  deliveredAt: order.deliveredAt ?? undefined,
});
