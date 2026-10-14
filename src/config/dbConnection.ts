import { describeDatabase, getDatabaseUrl, getDbTarget } from "./database";
import prisma from "./prisma";

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log(
      `Postgres connected 🐘 [${getDbTarget()}] ${describeDatabase(getDatabaseUrl())}`,
    );
  } catch (err) {
    console.error("Error connecting to Postgres:", err);
    process.exit(1);
  }
};

export default connectDB;
