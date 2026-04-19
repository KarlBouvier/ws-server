/**
 * Route REST : génération PDF à partir de HTML.
 * Sécurisée optionnellement par PDF_API_KEY (header x-pdf-api-key).
 */
import { Router } from "express";
import { generatePdfFromHtml } from "../services/pdfService.js";

const router = Router();

// Limite : 5 Mo de HTML maximum pour éviter les attaques par surcharge mémoire.
const MAX_HTML_BYTES = 5 * 1024 * 1024;

function authorizePdfRequest(req, res, next) {
  const expected = process.env.PDF_API_KEY;
  if (!expected) {
    return next();
  }
  const key = req.headers["x-pdf-api-key"];
  if (key !== expected) {
    return res.status(401).json({ error: "Invalid or missing PDF API key" });
  }
  return next();
}

/**
 * POST /api/pdf
 * Body JSON : { "html": "<!DOCTYPE html>..." }
 */
router.post("/", authorizePdfRequest, async (req, res) => {
  try {
    const html = req.body?.html;
    if (!html || typeof html !== "string") {
      return res.status(400).json({ error: "Field 'html' (string) is required" });
    }

    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
      return res.status(413).json({ error: "HTML payload too large (max 5 MB)" });
    }

    const buffer = await generatePdfFromHtml(html);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("[pdf] generation failed:", err);
    return res.status(500).json({ error: "PDF generation failed" });
  }
});

export { router as pdfRouter };
