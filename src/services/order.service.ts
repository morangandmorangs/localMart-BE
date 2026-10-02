import { IOrder, IOrderAddress, IOrderItem } from "../models/Order";

export interface OrderItemDto {
  productId: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
}

export interface OrderDto {
  id: string;
  customer: { id: string; name?: string; phoneNumber?: string };
  items: OrderItemDto[];
  address: IOrderAddress;
  paymentMethod: IOrder["paymentMethod"];
  total: number;
  status: IOrder["status"];
  createdAt: Date;
}

const toOrderItemDto = (item: IOrderItem): OrderItemDto => ({
  productId: item.productId,
  variantId: item.variantId,
  name: item.name,
  price: item.price,
  quantity: item.quantity,
});

/**
 * Mirrors toProductDto/toCustomerProfile: `_id`→`id`, Mongo internals never
 * reach the client. `customer` is read off the populated doc when the
 * caller populated it (the admin list does; nothing else needs to).
 */
export const toOrderDto = (order: IOrder): OrderDto => {
  const customer = order.customer as unknown as
    | { _id: unknown; name?: string; phoneNumber?: string }
    | undefined;

  return {
    id: String(order._id),
    customer: {
      id: String(customer?._id ?? order.customer),
      name: customer?.name,
      phoneNumber: customer?.phoneNumber,
    },
    items: order.items.map(toOrderItemDto),
    address: {
      label: order.address.label,
      line1: order.address.line1,
      city: order.address.city,
      state: order.address.state,
      pincode: order.address.pincode,
    },
    paymentMethod: order.paymentMethod,
    total: order.total,
    status: order.status,
    createdAt: order.createdAt,
  };
};
