import Customer, { IAddress, ICustomer } from "../models/Customer";

export interface CustomerProfile {
  id: string;
  phoneNumber: string;
  name?: string;
  email?: string;
  area?: string;
  isActive: boolean;
}

export const toCustomerProfile = (customer: ICustomer): CustomerProfile => ({
  id: String(customer._id),
  phoneNumber: customer.phoneNumber,
  name: customer.name,
  email: customer.email,
  area: customer.area,
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

export const toAddressDto = (address: IAddress): AddressDto => ({
  id: String(address._id),
  label: address.label,
  line1: address.line1,
  city: address.city,
  state: address.state,
  pincode: address.pincode,
});

/**
 * Finds the customer behind a verified Firebase identity, creating one on
 * first sign-in.
 *
 * Matches on uid first, then phone number: a customer who re-registers their
 * number in Firebase comes back with a new uid, and matching only on uid
 * would strand their order history behind a duplicate record.
 */
export const findOrCreateCustomer = async (
  firebaseUid: string,
  phoneNumber: string,
): Promise<{ customer: ICustomer; isNew: boolean }> => {
  const byUid = await Customer.findOne({ firebaseUid });
  if (byUid) return { customer: byUid, isNew: false };

  const byPhone = await Customer.findOne({ phoneNumber });
  if (byPhone) {
    byPhone.firebaseUid = firebaseUid;
    return { customer: byPhone, isNew: false };
  }

  return {
    customer: new Customer({ firebaseUid, phoneNumber }),
    isNew: true,
  };
};
