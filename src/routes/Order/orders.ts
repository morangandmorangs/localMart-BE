import express from "express";

import { createOrder, listOrders } from "../../controllers/order.controller";
import { authorize, protect } from "../../middleware/authmiddleware";
import { ROLES } from "../../types/auth.types";

const router = express.Router();

router.post("/", protect, authorize(ROLES.CUSTOMER), createOrder);
router.get("/", protect, authorize(ROLES.ADMIN), listOrders);

export default router;
