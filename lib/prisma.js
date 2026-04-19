/**
 * Client Prisma partagé (schéma identique à krypton-website).
 * Le client est généré dans krypton-website/node_modules via `npx prisma generate`.
 */
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { PrismaClient } = require(
  path.join(__dirname, "../../krypton-website/node_modules/@prisma/client")
);

export const prisma = new PrismaClient();
