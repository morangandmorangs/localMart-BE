import express from "express";

import {
  addAddress,
  getCustomerProfile,
  listAddresses,
  loginCustomer,
  loginCustomerDev,
  updateCustomerProfile,
} from "../../controllers/customer.controller";
import { authorize, protect } from "../../middleware/authmiddleware";
import { ROLES } from "../../types/auth.types";

const router = express.Router();

// Public: the client has already passed Firebase's phone OTP challenge and
// posts the resulting ID token here.
router.post("/auth/firebase", loginCustomer);
// Development only: 404s unless ALLOW_DEV_LOGIN=true and NODE_ENV is not production.
router.post("/auth/dev", loginCustomerDev);

// Signed-in customers
router.get("/me", protect, authorize(ROLES.CUSTOMER), getCustomerProfile);
router.patch("/me", protect, authorize(ROLES.CUSTOMER), updateCustomerProfile);
router.get(
  "/me/addresses",
  protect,
  authorize(ROLES.CUSTOMER),
  listAddresses,
);
router.post(
  "/me/addresses",
  protect,
  authorize(ROLES.CUSTOMER),
  addAddress,
);

export default router;
