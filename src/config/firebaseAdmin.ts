import fs from "fs";
import path from "path";
import admin from "firebase-admin";
import dotenv from "dotenv";
import logger from "../utils/logger";

dotenv.config();

/**
 * Builds the service account credential from the environment.
 *
 * Two supported sources, in priority order:
 *  1. FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY — the
 *     deployment-friendly form. The private key is stored with literal "\n"
 *     escapes in .env, so they're expanded back into real newlines here.
 *  2. FIREBASE_SERVICE_ACCOUNT_PATH — a path to the service account JSON
 *     downloaded from the Firebase console, resolved against the backend root.
 *
 * Returns null when neither is configured.
 */
const resolveServiceAccount = (): admin.ServiceAccount | null => {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } =
    process.env;

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (keyPath) {
    const resolved = path.isAbsolute(keyPath)
      ? keyPath
      : path.resolve(process.cwd(), keyPath);

    if (!fs.existsSync(resolved)) {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT_PATH points at a missing file: ${resolved}`,
      );
    }

    return JSON.parse(fs.readFileSync(resolved, "utf8")) as admin.ServiceAccount;
  }

  return null;
};

/**
 * Initializes the Firebase Admin app once and returns it.
 *
 * Unlike connectDB this does not exit the process on failure — the REST API
 * and Mongo still work without Firebase, so a misconfigured key degrades the
 * auth routes rather than taking the whole service down. Callers that need
 * Firebase should use getFirebaseAuth(), which throws if init never happened.
 */
export const initFirebaseAdmin = (): admin.app.App | null => {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  try {
    const serviceAccount = resolveServiceAccount();

    if (!serviceAccount) {
      logger.warn(
        "Firebase Admin not initialized: set FIREBASE_PROJECT_ID / " +
          "FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY, or " +
          "FIREBASE_SERVICE_ACCOUNT_PATH.",
      );
      return null;
    }

    const app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });

    logger.info(
      `Firebase Admin initialized for project ${serviceAccount.projectId} 🔥`,
    );
    return app;
  } catch (err) {
    logger.error("Failed to initialize Firebase Admin", { error: err });
    return null;
  }
};

/** Admin Auth instance. Throws if initFirebaseAdmin() hasn't run successfully. */
export const getFirebaseAuth = (): admin.auth.Auth => {
  if (admin.apps.length === 0) {
    throw new Error(
      "Firebase Admin is not initialized — check the FIREBASE_* env vars.",
    );
  }
  return admin.auth();
};

/** Admin Messaging instance (FCM). Throws if Firebase Admin is not initialised. */
export const getFirebaseMessaging = (): admin.messaging.Messaging => {
  if (admin.apps.length === 0) {
    throw new Error(
      "Firebase Admin is not initialized — check the FIREBASE_* env vars.",
    );
  }
  return admin.messaging();
};

export { admin };
export default initFirebaseAdmin;
