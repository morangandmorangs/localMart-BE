import type { Address, Customer } from "../generated/prisma/client";
import { generateToken } from "../utils/jwt";
import { ROLES } from "../types/auth.types";

export interface CustomerProfile {
  id: string;
  phoneNumber: string;
  name?: string;
  email?: string;
  area?: string;
  isActive: boolean;
}

/** Optional columns are NULL in Postgres; the wire shape omits them. */
const orUndefined = <T>(value: T | null): T | undefined => value ?? undefined;

export const toCustomerProfile = (customer: Customer): CustomerProfile => ({
  id: customer.id,
  phoneNumber: customer.phoneNumber,
  name: orUndefined(customer.name),
  email: orUndefined(customer.email),
  area: orUndefined(customer.area),
  isActive: customer.isActive,
});

export interface AddressDto {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
}

export const toAddressDto = (address: Address): AddressDto => ({
  id: address.id,
  label: address.label,
  line1: address.line1,
  city: address.city,
  state: address.state,
  pincode: address.pincode,
});

export const signCustomerToken = (customer: Customer): string =>
  generateToken({ id: customer.id, role: ROLES.CUSTOMER });
