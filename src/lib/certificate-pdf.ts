import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { CertificateRow, OrgSettings } from "./workflow-types";

const W = 842; // A4 landscape, points
const H = 595;
const DEFAULT_LOGO_PATH = path.join(process.cwd(), "public", "brand", "doonkhav-logo.png");

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Logos hosted on our Cloudinary cloud are fetched live; otherwise fall back to the bundled default mark. */
async function loadLogo(pdf: PDFDocument, url: string | null): Promise<PDFImage | null> {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (url && cloud && url.startsWith(`https://res.cloudinary.com/${cloud}/`)) {
    try {
      // Ask Cloudinary for a PNG so webp uploads can be embedded too.
      const pngUrl = url.replace("/image/upload/", "/image/upload/f_png,w_400/").replace(/\.(webp|jpg|jpeg|png)$/i, ".png");
      const res = await fetch(pngUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return await pdf.embedPng(new Uint8Array(await res.arrayBuffer()));
    } catch {
      // fall through to the bundled default below
    }
  }
  try {
    return await pdf.embedPng(await readFile(DEFAULT_LOGO_PATH));
  } catch {
    return null;
  }
}

/** Thin double-line border with a small gold L-shaped accent in each corner. */
function drawFrame(page: PDFPage, primary: ReturnType<typeof rgb>, secondary: ReturnType<typeof rgb>) {
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: primary, borderWidth: 2.5 });
  page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: secondary, borderWidth: 0.75 });
  const corner = 26;
  const corners: [number, number, 1 | -1, 1 | -1][] = [[40, H - 40, 1, -1], [W - 40, H - 40, -1, -1], [40, 40, 1, 1], [W - 40, 40, -1, 1]];
  for (const [x, y, dx, dy] of corners) {
    page.drawLine({ start: { x, y }, end: { x: x + dx * corner, y }, thickness: 2, color: secondary });
    page.drawLine({ start: { x, y }, end: { x, y: y + dy * corner }, thickness: 2, color: secondary });
  }
}

export async function renderCertificatePdf(cert: CertificateRow, org: OrgSettings, verifyUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const isCompletion = cert.certificate_type === "completion";
  pdf.setTitle(`Certificate ${cert.certificate_number}`);
  pdf.setAuthor(org.org_name);
  pdf.setSubject(isCompletion ? `${cert.batch_name} completion for ${cert.student_name}` : `${cert.badge_name} achievement for ${cert.student_name}`);
  const page = pdf.addPage([W, H]);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = hexToRgb(org.accent_color);
  const secondary = hexToRgb(org.secondary_color);
  const ink = rgb(0.1, 0.12, 0.2);
  const muted = rgb(0.38, 0.4, 0.48);

  const center = (t: string, y: number, size: number, font = serif, color = ink) => {
    const w = font.widthOfTextAtSize(t, size);
    page.drawText(t, { x: (W - w) / 2, y, size, font, color });
  };
  const fit = (t: string, font: typeof serif, size: number, max: number) => {
    let s = size;
    while (s > 12 && font.widthOfTextAtSize(t, s) > max) s -= 1;
    return s;
  };

  drawFrame(page, primary, secondary);

  // header: logo + organisation
  const logo = await loadLogo(pdf, org.logo_url);
  let top = H - 76;
  if (logo) {
    const scale = Math.min(66 / logo.height, 160 / logo.width);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    page.drawImage(logo, { x: (W - lw) / 2, y: top - lh + 20, width: lw, height: lh });
    top -= lh + 6;
  }
  center(org.org_name.toUpperCase(), top - 10, fit(org.org_name, sansBold, 15, 600), sansBold, primary);
  if (org.tagline) center(org.tagline, top - 27, 9.5, sans, muted);
  page.drawLine({ start: { x: W / 2 - 60, y: top - 35 }, end: { x: W / 2 + 60, y: top - 35 }, thickness: 1, color: secondary });

  const title = isCompletion ? "Certificate of Program Completion" : "Certificate of Skill Achievement";
  center(title, H - 212, fit(title, serifBold, 34, W - 140), serifBold, primary);
  center("This is to certify that", H - 242, 13, serif, muted);
  const nameSize = fit(cert.student_name, serifBold, 36, W - 160);
  center(cert.student_name, H - 286, nameSize, serifBold, ink);
  page.drawLine({ start: { x: 220, y: H - 296 }, end: { x: W - 220, y: H - 296 }, thickness: 0.8, color: secondary });

  if (isCompletion) {
    center("has successfully completed the program", H - 322, 13, serif, muted);
    center(`${cert.batch_name}`, H - 354, fit(cert.batch_name ?? "", serifBold, 26, W - 200), serifBold, primary);
    if (cert.program_name) center(cert.program_name, H - 376, 11.5, sans, muted);
    const span = cert.started_on && cert.completed_on
      ? `${new Date(cert.started_on).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} – ${new Date(cert.completed_on).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`
      : null;
    if (span) center(span, H - 396, 10.5, sans, muted);
  } else {
    center("has achieved the level of", H - 322, 13, serif, muted);
    center(`${cert.badge_name}`, H - 354, fit(cert.badge_name ?? "", serifBold, 28, W - 200), serifBold, primary);
    center(`with ${cert.verified_projects} verified, Admin-approved project${cert.verified_projects === 1 ? "" : "s"}`, H - 378, 13, serif, ink);
  }

  // bottom row: date | QR | signatory
  const issued = new Date(cert.issued_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  page.drawText("Date of issue", { x: 80, y: 120, size: 9, font: sans, color: muted });
  page.drawText(issued, { x: 80, y: 102, size: 13, font: serifBold, color: ink });
  page.drawText("Certificate no.", { x: 80, y: 78, size: 9, font: sans, color: muted });
  page.drawText(cert.certificate_number, { x: 80, y: 62, size: 11, font: sansBold, color: ink });

  const qr = await pdf.embedPng(await QRCode.toBuffer(verifyUrl, { type: "png", margin: 1, width: 260, errorCorrectionLevel: "M" }));
  page.drawImage(qr, { x: W / 2 - 42, y: 58, width: 84, height: 84 });
  center("Scan to verify", 46, 8, sans, muted);

  const sigX = W - 80;
  const sigName = org.signatory_name || org.org_name;
  const sigW = serifBold.widthOfTextAtSize(sigName, 13);
  page.drawLine({ start: { x: sigX - 190, y: 118 }, end: { x: sigX, y: 118 }, thickness: 0.8, color: ink });
  page.drawText(sigName, { x: sigX - sigW, y: 100, size: 13, font: serifBold, color: ink });
  if (org.signatory_title) {
    const tw = sans.widthOfTextAtSize(org.signatory_title, 9);
    page.drawText(org.signatory_title, { x: sigX - tw, y: 86, size: 9, font: sans, color: muted });
  }
  if (org.certificate_footer) {
    const f = org.certificate_footer;
    const fw = sans.widthOfTextAtSize(f, 8);
    page.drawText(f, { x: (W - Math.min(fw, W - 100)) / 2, y: 36, size: 8, font: sans, color: muted, maxWidth: W - 100 });
  }
  return pdf.save();
}
