import { createPartnerController } from "./partner.controller";
import { merchantRepo } from "../services/partner.service";
import { ROLES } from "../types/auth.types";
import { MERCHANT_TYPE_VALUES, parseMerchantTypes } from "../types/merchant.types";

export const merchantController = createPartnerController(
  merchantRepo,
  "Merchant",
  ROLES.MERCHANT,
  {
    // No default: a merchant who skips the question would be able to list
    // anything, which is what the type exists to prevent.
    fromBody: (body) => {
      // `businessType` (a single string) is still accepted from older apps.
      const types = parseMerchantTypes(
        body.businessTypes ?? (body.businessType ? [body.businessType] : undefined),
      );
      return types
        ? { data: { businessTypes: types } }
        : {
            error: `businessTypes must be a non-empty list of: ${MERCHANT_TYPE_VALUES.join(", ")}`,
          };
    },
  },
);

export default merchantController;
