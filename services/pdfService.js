/**
 * Génération PDF via Puppeteer (adapté aux serveurs long-running, pas serverless).
 * Lance un navigateur headless, injecte du HTML, retourne un buffer PDF.
 *
 * Résolution du chemin Chrome (par ordre de priorité) :
 *  1. PUPPETEER_EXECUTABLE_PATH  → override manuel (dev local ou prod avec Chrome système)
 *  2. puppeteer.executablePath() → Chrome téléchargé par Puppeteer au npm install
 *  3. Chemins système Linux      → /usr/bin/chromium-browser, google-chrome, etc.
 *  4. Cache local mac-arm64      → fallback dev Mac sans variable d'env
 *  5. null                       → Puppeteer tente son propre fallback
 */
import puppeteer from "puppeteer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Chemins Chromium/Chrome courants sur Linux (VPS, Docker Ubuntu/Debian)
const LINUX_CHROME_PATHS = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/snap/bin/chromium",
  "/usr/local/bin/chromium",
];

/**
 * Résout le chemin de l'exécutable Chrome à utiliser.
 * Loggue le résultat au premier appel pour faciliter le debugging.
 * @returns {string|null}
 */
function resolveChromePath() {
  // ── 1. Override manuel via variable d'environnement ─────────────────────
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    const p = process.env.PUPPETEER_EXECUTABLE_PATH;
    if (fs.existsSync(p)) {
      console.log(`[pdf] Chrome résolu via PUPPETEER_EXECUTABLE_PATH : ${p}`);
      return p;
    }
    console.warn(
      `[pdf] PUPPETEER_EXECUTABLE_PATH défini mais introuvable : ${p}\n` +
      `      → Tentative de résolution automatique.`
    );
  }

  // ── 2. Chrome bundlé par Puppeteer (installé lors du npm install) ────────
  try {
    const bundled = puppeteer.executablePath();
    if (bundled && fs.existsSync(bundled)) {
      console.log(`[pdf] Chrome résolu via puppeteer.executablePath() : ${bundled}`);
      return bundled;
    }
  } catch {
    // executablePath() peut lever si le build n'a pas été téléchargé
  }

  // ── 3. Chrome système sur Linux (VPS, serveur dédié) ─────────────────────
  for (const candidate of LINUX_CHROME_PATHS) {
    if (fs.existsSync(candidate)) {
      console.log(`[pdf] Chrome résolu via chemin système Linux : ${candidate}`);
      return candidate;
    }
  }

  // ── 4. Cache local Puppeteer — Mac dev sans variable d'env ───────────────
  const cacheDir =
    process.env.PUPPETEER_CACHE_DIR ??
    path.join(__dirname, "..", ".puppeteer-cache");

  const chromeRoot = path.join(cacheDir, "chrome");
  if (fs.existsSync(chromeRoot)) {
    const subdirs = fs
      .readdirSync(chromeRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    // Mac Apple Silicon
    const macArmPatterns = subdirs.map((v) =>
      path.join(
        chromeRoot,
        v,
        "chrome-mac-arm64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      )
    );
    // Mac Intel
    const macX64Patterns = subdirs.map((v) =>
      path.join(
        chromeRoot,
        v,
        "chrome-mac-x64",
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      )
    );
    // Linux (cache local)
    const linuxPatterns = subdirs.map((v) =>
      path.join(chromeRoot, v, "chrome-linux64", "chrome")
    );

    for (const candidate of [
      ...macArmPatterns,
      ...macX64Patterns,
      ...linuxPatterns,
    ]) {
      if (fs.existsSync(candidate)) {
        console.log(`[pdf] Chrome résolu via cache local : ${candidate}`);
        return candidate;
      }
    }
  }

  // ── 5. Aucun chemin trouvé — Puppeteer utilisera son propre fallback ──────
  console.warn(
    "[pdf] Aucun exécutable Chrome trouvé. Puppeteer tentera son fallback interne.\n" +
    "      Si le PDF échoue, consultez le README pour configurer PUPPETEER_EXECUTABLE_PATH."
  );
  return null;
}

// Résolution unique au démarrage du process (pas à chaque requête)
const CHROME_EXECUTABLE_PATH = resolveChromePath();

const DEFAULT_PUPPETEER_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
];

/**
 * @param {string} html - Document HTML complet à imprimer
 * @param {object} [options]
 * @param {string} [options.format] - Taille de page, ex. "A4"
 * @returns {Promise<Buffer>}
 */
export async function generatePdfFromHtml(html, options = {}) {
  if (!html || typeof html !== "string") {
    throw new Error("generatePdfFromHtml: html must be a non-empty string");
  }

  const format = options.format ?? "A4";

  const browser = await puppeteer.launch({
    headless: true,
    args: DEFAULT_PUPPETEER_ARGS,
    ...(CHROME_EXECUTABLE_PATH ? { executablePath: CHROME_EXECUTABLE_PATH } : {}),
  });

  try {
    const page = await browser.newPage();

    // Bloquer toutes les requêtes réseau externes : le HTML est auto-contenu.
    await page.setRequestInterception(true);
    page.on("request", (interceptedRequest) => {
      if (
        interceptedRequest.resourceType() === "document" ||
        interceptedRequest.url().startsWith("data:")
      ) {
        interceptedRequest.continue();
      } else {
        interceptedRequest.abort();
      }
    });

    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(30_000);
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    const pdf = await page.pdf({
      format,
      printBackground: true,
      margin: { top: "24px", bottom: "24px", left: "24px", right: "24px" },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
