import express from "express";

import {
  getCatalogStatus,
  syncCatalogStock,
} from "../../controllers/catalog.controller";
import { authorize, protect } from "../../middleware/authmiddleware";
import { ROLES } from "../../types/auth.types";

const router = express.Router();

router.get("/status", getCatalogStatus);

// Stock feed from the warehouse integration, which signs in as an admin.
router.post("/stock/sync", protect, authorize(ROLES.ADMIN), syncCatalogStock);

export default router;
