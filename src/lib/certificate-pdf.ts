import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFImage } from "pdf-lib";
import QRCode from "qrcode";
import type { CertificateRow, OrgSettings } from "./workflow-types";

const W = 842; // A4 landscape, points
const H = 595;

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Only fetch logos hosted on our Cloudinary cloud; skip silently on any failure. */
async function loadLogo(pdf: PDFDocument, url: string | null): Promise<PDFImage | null> {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!url || !cloud || !url.startsWith(`https://res.cloudinary.com/${cloud}/`)) return null;
  try {
    // Ask Cloudinary for a PNG so webp uploads can be embedded too.
    const pngUrl = url.replace("/image/upload/", "/image/upload/f_png,w_400/").replace(/\.(webp|jpg|jpeg|png)$/i, ".png");
    const res = await fetch(pngUrl, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await pdf.embedPng(new Uint8Array(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

export async function renderCertificatePdf(cert: CertificateRow, org: OrgSettings, verifyUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificate ${cert.certificate_number}`);
  pdf.setAuthor(org.org_name);
  pdf.setSubject(`${cert.badge_name} achievement for ${cert.student_name}`);
  const page = pdf.addPage([W, H]);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = hexToRgb(org.accent_color);
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

  // frame
  page.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: accent, borderWidth: 4 });
  page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderColor: accent, borderWidth: 1, opacity: 0.6 });

  // header: logo + organisation
  const logo = await loadLogo(pdf, org.logo_url);
  let top = H - 80;
  if (logo) {
    const scale = Math.min(70 / logo.height, 180 / logo.width);
    const lw = logo.width * scale;
    const lh = logo.height * scale;
    page.drawImage(logo, { x: (W - lw) / 2, y: top - lh + 20, width: lw, height: lh });
    top -= lh + 6;
  }
  center(org.org_name.toUpperCase(), top - 10, fit(org.org_name, sansBold, 16, 600), sansBold, accent);
  if (org.tagline) center(org.tagline, top - 28, 10, sans, muted);

  center("Certificate of Achievement", H - 215, 40, serifBold);
  center("This is to certify that", H - 245, 14, serif, muted);
  const nameSize = fit(cert.student_name, serifBold, 38, W - 160);
  center(cert.student_name, H - 292, nameSize, serifBold, accent);
  page.drawLine({ start: { x: 220, y: H - 302 }, end: { x: W - 220, y: H - 302 }, thickness: 0.8, color: accent });
  center("has achieved the level of", H - 326, 14, serif, muted);
  center(`${cert.badge_name}`, H - 358, fit(cert.badge_name, serifBold, 30, W - 200), serifBold);
  center(`with ${cert.verified_projects} verified, Admin-approved project${cert.verified_projects === 1 ? "" : "s"}`, H - 382, 14, serif, ink);

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
