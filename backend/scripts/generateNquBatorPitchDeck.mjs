#!/usr/bin/env node
/**
 * Qwertymates 13-slide investor / NquBator pitch deck.
 * Owner copy is canonical — layout polish only; no extra claims or numbers.
 *
 * From backend/: node scripts/generateNquBatorPitchDeck.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PptxGenJS from "pptxgenjs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, "DOCS", "NquBator-Pitch-Deck");

const BRAND = {
  brand600: "1F6DE0",
  brand700: "1958B3",
  brand500: "2E8AFF",
  cyan: "38BDF8",
  navy: "0B1F3A",
  navyDeep: "071526",
  slate900: "0F172A",
  slate700: "334155",
  slate500: "64748B",
  soft: "EEF7FF",
  white: "FFFFFF",
  accentLine: "B6DBFF",
  cardLine: "D6E8FB",
};

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const TOTAL = 13;

const qMark = path.join(root, "frontend", "public", "qwertymates-q-mark-official.png");
const wordmark = path.join(root, "frontend", "public", "qwertymates-logo.png");
const textLogo = path.join(root, "frontend", "public", "qwertymates-text-logo.png");
const wordmarkAlt = path.join(root, "frontend", "public", "qwertymates-wordmark-logo.png");

function ensureAssets() {
  if (!fs.existsSync(qMark)) throw new Error(`Missing Q mark: ${qMark}`);
  fs.mkdirSync(outDir, { recursive: true });
}

function wordmarkPath() {
  if (fs.existsSync(wordmark)) return wordmark;
  if (fs.existsSync(textLogo)) return textLogo;
  if (fs.existsSync(wordmarkAlt)) return wordmarkAlt;
  return "";
}

function addFooter(slide, pptx, page) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 7.12,
    w: SLIDE_W,
    h: 0.38,
    fill: { color: BRAND.navy },
  });
  if (fs.existsSync(qMark)) {
    slide.addImage({ path: qMark, x: 0.28, y: 7.155, w: 0.28, h: 0.28 });
  }
  slide.addText("Qwertymates  ·  Confidential", {
    x: 0.64,
    y: 7.16,
    w: 9.5,
    h: 0.28,
    fontSize: 11,
    color: BRAND.white,
    fontFace: "Calibri",
  });
  slide.addText(`${page}  /  ${TOTAL}`, {
    x: 11.2,
    y: 7.16,
    w: 1.8,
    h: 0.28,
    fontSize: 11,
    color: BRAND.white,
    align: "right",
    fontFace: "Calibri",
  });
}

function addHeaderBar(slide, pptx, title, kicker) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: 1.08,
    fill: { color: BRAND.navy },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 1.08,
    w: SLIDE_W,
    h: 0.07,
    fill: { color: BRAND.brand600 },
  });
  if (fs.existsSync(qMark)) {
    slide.addImage({ path: qMark, x: 0.32, y: 0.2, w: 0.68, h: 0.68 });
  }
  const titleY = kicker ? 0.14 : 0.28;
  slide.addText(title, {
    x: 1.16,
    y: titleY,
    w: 11.7,
    h: kicker ? 0.5 : 0.55,
    fontSize: 28,
    bold: true,
    color: BRAND.white,
    fontFace: "Calibri",
  });
  if (kicker) {
    slide.addText(kicker, {
      x: 1.16,
      y: 0.64,
      w: 11.7,
      h: 0.3,
      fontSize: 13,
      color: BRAND.cyan,
      fontFace: "Calibri",
    });
  }
}

function addCard(slide, pptx, { x, y, w, h, title, body, titleSize = 16, bodySize = 14, compact = false }) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w,
    h,
    fill: { color: BRAND.soft },
    line: { color: BRAND.accentLine, width: 1 },
    rectRadius: 0.1,
  });
  slide.addShape(pptx.ShapeType.rect, {
    x,
    y,
    w: 0.09,
    h,
    fill: { color: BRAND.brand600 },
  });
  const titleH = compact ? 0.52 : 0.42;
  slide.addText(title, {
    x: x + 0.22,
    y: y + 0.14,
    w: w - 0.38,
    h: titleH,
    fontSize: titleSize,
    bold: true,
    color: BRAND.brand700,
    fontFace: "Calibri",
  });
  if (body) {
    const bodyY = y + (compact ? 0.68 : 0.62);
    slide.addText(body, {
      x: x + 0.22,
      y: bodyY,
      w: w - 0.38,
      h: h - (bodyY - y) - 0.14,
      fontSize: bodySize,
      color: BRAND.slate900,
      fontFace: "Calibri",
      valign: "top",
    });
  }
}

async function buildPptx() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE_16x9", width: SLIDE_W, height: SLIDE_H });
  pptx.layout = "WIDE_16x9";
  pptx.author = "Ariel Madisha, Founder & CEO — Qwertymates (Pty) Ltd";
  pptx.title = "Qwertymates Pitch Deck — NquBator";
  pptx.subject = "Investor / accelerator pitch — 13 slides";
  pptx.company = "Qwertymates (Pty) Ltd";

  // 1 Cover
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.navy };
    s.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.18,
      h: SLIDE_H,
      fill: { color: BRAND.brand600 },
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 6.35,
      w: SLIDE_W,
      h: 1.15,
      fill: { color: BRAND.brand600 },
    });
    if (fs.existsSync(qMark)) {
      s.addImage({ path: qMark, x: 0.7, y: 0.7, w: 1.35, h: 1.35 });
    }
    const wm = wordmarkPath();
    if (wm) {
      s.addImage({ path: wm, x: 2.25, y: 1.0, w: 5.4, h: 0.78 });
    } else {
      s.addText("Qwertymates", {
        x: 2.25,
        y: 1.05,
        w: 8,
        h: 0.7,
        fontSize: 36,
        bold: true,
        color: BRAND.white,
        fontFace: "Calibri",
      });
    }
    s.addText("Join the Qwerty Revolution", {
      x: 0.7,
      y: 2.35,
      w: 12,
      h: 0.7,
      fontSize: 36,
      bold: true,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    s.addText("Ariel Madisha, Founder & CEO", {
      x: 0.7,
      y: 3.2,
      w: 12,
      h: 0.38,
      fontSize: 20,
      color: BRAND.cyan,
      fontFace: "Calibri",
    });
    s.addText("business@qwertymates.com    ·    +27 66 129 4468", {
      x: 0.7,
      y: 3.62,
      w: 12,
      h: 0.36,
      fontSize: 16,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    s.addText("WhatsApp:  Botswana  +267 75 184 537    |    South Africa  +27 81 582 6899", {
      x: 0.7,
      y: 6.62,
      w: 10.4,
      h: 0.42,
      fontSize: 16,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    s.addText("1  /  13", {
      x: 11.2,
      y: 6.7,
      w: 1.8,
      h: 0.3,
      fontSize: 12,
      color: BRAND.white,
      align: "right",
      fontFace: "Calibri",
    });
  }

  // 2 Problem
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Problem");
    const cards = [
      ["Cash & manual operations", "Merchants rely on cash, manual stock, and word-of-mouth."],
      ["Rural exclusion", "Rural communities excluded from digital commerce."],
      ["Costly, limited payments", "Consumers face high costs and limited payment options."],
    ];
    cards.forEach((c, i) => {
      addCard(s, pptx, {
        x: 0.45 + i * 4.25,
        y: 1.55,
        w: 4.05,
        h: 5.15,
        title: c[0],
        body: c[1],
        titleSize: 20,
        bodySize: 18,
      });
    });
    addFooter(s, pptx, 2);
  }

  // 3 Vision
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Vision");
    const cards = [
      ["Inclusive super-app", "Build an AI-driven super-app for inclusive trade, logistics, payments, and content."],
      ["People first", "Empower merchants, suppliers, and communities."],
      ["Regional impact", "Drive financial inclusion and job creation across Southern Africa."],
    ];
    cards.forEach((c, i) => {
      addCard(s, pptx, {
        x: 0.45 + i * 4.25,
        y: 1.55,
        w: 4.05,
        h: 5.15,
        title: c[0],
        body: c[1],
        titleSize: 20,
        bodySize: 18,
      });
    });
    addFooter(s, pptx, 3);
  }

  // 4 Product — 7 cards (4 + 3). Copy from owner pitch + About.md / homepage; no extra metrics.
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Product");
    const items = [
      ["QwertyHub", "Instant store creation via simplified dropshipping."],
      ["AskMacGyver", "AI problem-solving and predictive insights."],
      ["ACBPay Wallet", "Peer-to-peer transfers, merchant payments, cash-in/cash-out."],
      ["QwertyTV & QwertyMusic", "Creator monetization and cultural relevance."],
      ["WhatsApp", "Integration for rural inclusivity."],
      ["Morongwa", "Built-in messenger — chat, voice, and video for orders, errands, and community."],
      ["Errands", "Local deliveries, collections, and micro-jobs matched to trusted runners."],
    ];
    const marginX = 0.38;
    const gapX = 0.16;
    const gapY = 0.16;
    const top = 1.3;
    const bottom = 7.02;
    const wCard = (SLIDE_W - marginX * 2 - gapX * 3) / 4;
    const hCard = (bottom - top - gapY) / 2;
    items.forEach((item, i) => {
      const row = i < 4 ? 0 : 1;
      const col = i < 4 ? i : i - 4;
      const rowCount = row === 0 ? 4 : 3;
      const rowWidth = rowCount * wCard + (rowCount - 1) * gapX;
      const x0 = (SLIDE_W - rowWidth) / 2;
      addCard(s, pptx, {
        x: x0 + col * (wCard + gapX),
        y: top + row * (hCard + gapY),
        w: wCard,
        h: hCard,
        title: item[0],
        body: item[1],
        titleSize: 15,
        bodySize: 13,
        compact: true,
      });
    });
    addFooter(s, pptx, 4);
  }

  // 5 Qwertz — Video Editing Suite
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Qwertz — Video Editing Suite", "Short vertical video for creators & merchants");
    const cards = [
      ["9:16 short clips", "Up to 90 seconds — trim, crop, text, filters, and music for QwertyTV & Wall."],
      ["FFmpeg + job queue", "Phase 1 API: upload, edit, export to feed & WhatsApp share links."],
      ["AI hooks", "AskMacGyver captions/hashtags; scene detect & subtitles on Phase 2 roadmap."],
    ];
    cards.forEach((c, i) => {
      addCard(s, pptx, {
        x: 0.45 + i * 4.25,
        y: 1.55,
        w: 4.05,
        h: 5.15,
        title: c[0],
        body: c[1],
        titleSize: 20,
        bodySize: 17,
      });
    });
    addFooter(s, pptx, 5);
  }

  // 6 Market & Customer
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Market & Customer");
    s.addText("Target: SMEs, retailers, suppliers, logistics companies, and consumers.", {
      x: 0.5,
      y: 1.35,
      w: 12.3,
      h: 0.45,
      fontSize: 18,
      color: BRAND.slate900,
      fontFace: "Calibri",
    });
    const stats = [
      ["200+", "customers interviewed/tested"],
      ["50+", "merchants piloting QwertyHub"],
      ["WhatsApp", "strong demand for simplified commerce + WhatsApp access"],
    ];
    stats.forEach((st, i) => {
      const x = 0.45 + i * 4.25;
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 2.05,
        w: 4.05,
        h: 4.65,
        fill: { color: BRAND.soft },
        line: { color: BRAND.accentLine, width: 1 },
        rectRadius: 0.1,
      });
      s.addText(st[0], {
        x: x + 0.2,
        y: 2.55,
        w: 3.65,
        h: 1.1,
        fontSize: 36,
        bold: true,
        color: BRAND.brand600,
        align: "center",
        fontFace: "Calibri",
      });
      s.addText(st[1], {
        x: x + 0.28,
        y: 3.8,
        w: 3.5,
        h: 2.3,
        fontSize: 18,
        color: BRAND.slate900,
        align: "center",
        fontFace: "Calibri",
      });
    });
    addFooter(s, pptx, 6);
  }

  // 7 Traction
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Traction");
    const stats = [
      ["200+", "active customers"],
      ["50+", "merchants onboarded"],
    ];
    stats.forEach((st, i) => {
      const x = 0.45 + i * 6.4;
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.45,
        w: 6.1,
        h: 2.55,
        fill: { color: BRAND.soft },
        line: { color: BRAND.accentLine, width: 1 },
        rectRadius: 0.1,
      });
      s.addText(st[0], {
        x: x + 0.25,
        y: 1.7,
        w: 5.6,
        h: 1.15,
        fontSize: 48,
        bold: true,
        color: BRAND.brand600,
        align: "center",
        fontFace: "Calibri",
      });
      s.addText(st[1], {
        x: x + 0.25,
        y: 2.9,
        w: 5.6,
        h: 0.7,
        fontSize: 20,
        color: BRAND.navy,
        align: "center",
        fontFace: "Calibri",
      });
    });
    addCard(s, pptx, {
      x: 0.45,
      y: 4.2,
      w: 6.1,
      h: 2.5,
      title: "Early revenue",
      body: "Errands, supplier onboarding, wallet transactions.",
      titleSize: 18,
      bodySize: 18,
    });
    addCard(s, pptx, {
      x: 6.85,
      y: 4.2,
      w: 6.05,
      h: 2.5,
      title: "Pilots",
      body: "Ongoing pilots with suppliers and retailers.",
      titleSize: 18,
      bodySize: 18,
    });
    addFooter(s, pptx, 7);
  }

  // 8 Business Model
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Business Model");
    addCard(s, pptx, {
      x: 0.4,
      y: 1.4,
      w: 4.15,
      h: 5.3,
      title: "Revenue streams",
      body: "Marketplace commissions, errands fees, wallet transactions, content monetization, AI premium services.",
      titleSize: 18,
      bodySize: 17,
    });
    addCard(s, pptx, {
      x: 4.7,
      y: 1.4,
      w: 4.15,
      h: 5.3,
      title: "Key assumptions",
      body: "Merchant adoption, WhatsApp accessibility, supplier partnerships, regulatory compliance.",
      titleSize: 18,
      bodySize: 17,
    });
    addCard(s, pptx, {
      x: 9.0,
      y: 1.4,
      w: 3.95,
      h: 5.3,
      title: "Projected revenue",
      body: "USD 250k – 1M in first 12 months.",
      titleSize: 18,
      bodySize: 17,
    });
    addFooter(s, pptx, 8);
  }

  // 9 Competitive Landscape
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Competitive Landscape");
    s.addText("Competitors", {
      x: 0.5,
      y: 1.35,
      w: 12.3,
      h: 0.35,
      fontSize: 16,
      bold: true,
      color: BRAND.navy,
      fontFace: "Calibri",
    });
    ["Takealot", "Jumia", "Bolt"].forEach((name, i) => {
      const x = 0.5 + i * 4.2;
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.8,
        w: 3.95,
        h: 1.05,
        fill: { color: BRAND.navy },
        rectRadius: 0.08,
      });
      s.addText(name, {
        x,
        y: 2.0,
        w: 3.95,
        h: 0.65,
        fontSize: 24,
        bold: true,
        color: BRAND.white,
        align: "center",
        fontFace: "Calibri",
      });
    });
    s.addText("Differentiation", {
      x: 0.5,
      y: 3.15,
      w: 12.3,
      h: 0.35,
      fontSize: 16,
      bold: true,
      color: BRAND.navy,
      fontFace: "Calibri",
    });
    const diffs = [
      "Simplified dropshipping",
      "WhatsApp accessibility",
      "AI support",
      "Integrated payments",
      "Content ecosystem",
    ];
    diffs.forEach((d, i) => {
      const x = 0.45 + i * 2.55;
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 3.6,
        w: 2.42,
        h: 3.1,
        fill: { color: BRAND.soft },
        line: { color: BRAND.accentLine, width: 1 },
        rectRadius: 0.1,
      });
      s.addText(d, {
        x: x + 0.12,
        y: 4.35,
        w: 2.18,
        h: 1.6,
        fontSize: 18,
        bold: true,
        color: BRAND.brand700,
        align: "center",
        valign: "middle",
        fontFace: "Calibri",
      });
    });
    addFooter(s, pptx, 9);
  }

  // 10 Team
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Team");
    addCard(s, pptx, {
      x: 0.4,
      y: 1.32,
      w: 6.2,
      h: 4.55,
      title: "Ariel Madisha — Founder & CEO",
      body: "20+ years in finance, audit, and municipal asset management. Transitioned into tech with MERN stack, PHP, Node.js, React, and GitHub contributions. Experience in digital commerce, supplier integrations, and grassroots projects.",
      titleSize: 16,
      bodySize: 15,
    });
    addCard(s, pptx, {
      x: 6.75,
      y: 1.32,
      w: 6.2,
      h: 4.55,
      title: "Francinah Madisha — Operations & UX",
      body: "UX diploma + UI certificate (UX Design Institute). Web development (IT Academy SA). Graphic design (University of Cape Town). Strong background in logistics, retail, and supplier management.",
      titleSize: 16,
      bodySize: 15,
    });
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.4,
      y: 6.02,
      w: 12.55,
      h: 0.9,
      fill: { color: BRAND.navy },
      rectRadius: 0.08,
    });
    s.addText("Full-time commitment to scaling Qwertymates.", {
      x: 0.6,
      y: 6.18,
      w: 12.15,
      h: 0.55,
      fontSize: 18,
      bold: true,
      color: BRAND.white,
      align: "center",
      fontFace: "Calibri",
    });
    addFooter(s, pptx, 10);
  }

  // 11 Funding Ask
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Funding Ask");
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.45,
      y: 1.4,
      w: 12.45,
      h: 2.15,
      fill: { color: BRAND.navy },
      rectRadius: 0.1,
    });
    s.addText("Raise", {
      x: 0.7,
      y: 1.55,
      w: 12,
      h: 0.35,
      fontSize: 14,
      color: BRAND.cyan,
      fontFace: "Calibri",
    });
    s.addText("R500,000 – R1,500,000   (~USD 30k – 90k)", {
      x: 0.7,
      y: 1.95,
      w: 12,
      h: 1.15,
      fontSize: 32,
      bold: true,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    addCard(s, pptx, {
      x: 0.45,
      y: 3.75,
      w: 5.9,
      h: 2.95,
      title: "Minimum ticket",
      body: "R250,000  (~USD 15k)",
      titleSize: 18,
      bodySize: 22,
    });
    addCard(s, pptx, {
      x: 6.55,
      y: 3.75,
      w: 6.35,
      h: 2.95,
      title: "Use of funds",
      body: "Merchant expansion, AI enhancement, regional scaling.",
      titleSize: 18,
      bodySize: 18,
    });
    addFooter(s, pptx, 11);
  }

  // 12 NquBator Fit
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "NquBator Fit");
    addCard(s, pptx, {
      x: 0.4,
      y: 1.4,
      w: 4.15,
      h: 5.3,
      title: "Motivation",
      body: "Leverage mentorship, partnerships, pilots, and fundraising readiness.",
      titleSize: 18,
      bodySize: 17,
    });
    addCard(s, pptx, {
      x: 4.7,
      y: 1.4,
      w: 4.15,
      h: 5.3,
      title: "Support needed",
      body: "Commercial growth, corporate partnerships, AI enablement, market expansion.",
      titleSize: 18,
      bodySize: 17,
    });
    addCard(s, pptx, {
      x: 9.0,
      y: 1.4,
      w: 3.95,
      h: 5.3,
      title: "Milestones",
      body: "Onboard 500+ merchants, scale AskMacGyver, expand regionally, grow ACBPay adoption.",
      titleSize: 18,
      bodySize: 17,
    });
    addFooter(s, pptx, 12);
  }

  // 13 Closing
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.navy };
    s.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.18,
      h: SLIDE_H,
      fill: { color: BRAND.brand600 },
    });
    if (fs.existsSync(qMark)) {
      s.addImage({ path: qMark, x: 0.7, y: 0.45, w: 0.85, h: 0.85 });
    }
    s.addText("Qwertymates", {
      x: 1.7,
      y: 0.6,
      w: 10,
      h: 0.55,
      fontSize: 22,
      bold: true,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    s.addText("Mission", {
      x: 0.7,
      y: 1.55,
      w: 12,
      h: 0.35,
      fontSize: 14,
      color: BRAND.cyan,
      fontFace: "Calibri",
    });
    s.addText("Empower merchants, suppliers, and communities with inclusive digital commerce.", {
      x: 0.7,
      y: 1.9,
      w: 12,
      h: 0.85,
      fontSize: 22,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    s.addText("Vision", {
      x: 0.7,
      y: 2.9,
      w: 12,
      h: 0.35,
      fontSize: 14,
      color: BRAND.cyan,
      fontFace: "Calibri",
    });
    s.addText("Scale Qwertymates into Southern Africa as the leading AI-driven super-app.", {
      x: 0.7,
      y: 3.25,
      w: 12,
      h: 0.85,
      fontSize: 22,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.7,
      y: 4.4,
      w: 11.95,
      h: 1.7,
      fill: { color: BRAND.brand600 },
      rectRadius: 0.1,
    });
    s.addText("Call to action", {
      x: 0.95,
      y: 4.55,
      w: 11.45,
      h: 0.35,
      fontSize: 14,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    s.addText("Partner with us to accelerate inclusive growth.", {
      x: 0.95,
      y: 4.95,
      w: 11.45,
      h: 0.85,
      fontSize: 26,
      bold: true,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    if (fs.existsSync(qMark)) {
      s.addImage({ path: qMark, x: 0.7, y: 6.95, w: 0.32, h: 0.32 });
    }
    s.addText("Qwertymates  ·  Confidential", {
      x: 1.12,
      y: 6.97,
      w: 8.5,
      h: 0.28,
      fontSize: 12,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    s.addText("13  /  13", {
      x: 11.2,
      y: 6.97,
      w: 1.8,
      h: 0.28,
      fontSize: 12,
      color: BRAND.white,
      align: "right",
      fontFace: "Calibri",
    });
  }

  const pptxPath = path.join(outDir, "Qwertymates-Pitch-Deck.pptx");
  await pptx.writeFile({ fileName: pptxPath });
  return pptxPath;
}

function wrapPdf(text, maxWidth, size, font) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(test, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function buildPdfCompanion() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qPng = fs.existsSync(qMark) ? await pdf.embedPng(fs.readFileSync(qMark)) : null;
  const navy = rgb(0.043, 0.122, 0.227);
  const brand = rgb(0.122, 0.427, 0.878);
  const white = rgb(1, 1, 1);
  const slate = rgb(0.059, 0.09, 0.165);
  const pageW = 960;
  const pageH = 540;

  const slides = [
    {
      title: "Cover",
      lines: [
        "Join the Qwerty Revolution",
        "Ariel Madisha, Founder & CEO",
        "business@qwertymates.com  ·  +27 66 129 4468",
        "WhatsApp: Botswana +267 75 184 537 | South Africa +27 81 582 6899",
      ],
    },
    {
      title: "Problem",
      lines: [
        "Merchants rely on cash, manual stock, and word-of-mouth.",
        "Rural communities excluded from digital commerce.",
        "Consumers face high costs and limited payment options.",
      ],
    },
    {
      title: "Vision",
      lines: [
        "Build an AI-driven super-app for inclusive trade, logistics, payments, and content.",
        "Empower merchants, suppliers, and communities.",
        "Drive financial inclusion and job creation across Southern Africa.",
      ],
    },
    {
      title: "Product",
      lines: [
        "QwertyHub — instant store creation via simplified dropshipping.",
        "AskMacGyver — AI problem-solving and predictive insights.",
        "ACBPay Wallet — peer-to-peer transfers, merchant payments, cash-in/cash-out.",
        "QwertyTV & QwertyMusic — creator monetization and cultural relevance.",
        "WhatsApp integration for rural inclusivity.",
        "Morongwa — built-in messenger: chat, voice, and video for orders, errands, and community.",
        "Errands — local deliveries, collections, and micro-jobs matched to trusted runners.",
      ],
    },
    {
      title: "Qwertz — Video Editing Suite",
      lines: [
        "Short vertical 9:16 clips up to 90 seconds for Wall and QwertyTV.",
        "Phase 1: FFmpeg trim/crop, text, filters, job queue, export hooks.",
        "AskMacGyver AI captions; Phase 2 scene detect, subtitles, QwertyHub publish.",
      ],
    },
    {
      title: "Market & Customer",
      lines: [
        "Target: SMEs, retailers, suppliers, logistics companies, and consumers.",
        "Engagement: 200+ customers interviewed/tested.",
        "Merchant pilots: 50+ testing QwertyHub.",
        "Feedback: strong demand for simplified commerce + WhatsApp access.",
      ],
    },
    {
      title: "Traction",
      lines: [
        "200+ active customers.",
        "50+ merchants onboarded.",
        "Early revenue from errands, supplier onboarding, wallet transactions.",
        "Ongoing pilots with suppliers and retailers.",
      ],
    },
    {
      title: "Business Model",
      lines: [
        "Revenue streams: marketplace commissions, errands fees, wallet transactions, content monetization, AI premium services.",
        "Key assumptions: merchant adoption, WhatsApp accessibility, supplier partnerships, regulatory compliance.",
        "Projected revenue: USD 250k – 1M in first 12 months.",
      ],
    },
    {
      title: "Competitive Landscape",
      lines: [
        "Competitors: Takealot, Jumia, Bolt.",
        "Differentiation: simplified dropshipping, WhatsApp accessibility, AI support, integrated payments, content ecosystem.",
      ],
    },
    {
      title: "Team",
      lines: [
        "Ariel Madisha (Founder & CEO): 20+ years in finance, audit, and municipal asset management. Transitioned into tech with MERN stack, PHP, Node.js, React, and GitHub contributions. Experience in digital commerce, supplier integrations, and grassroots projects.",
        "Francinah Madisha (Operations & UX): UX diploma + UI certificate (UX Design Institute). Web development (IT Academy SA). Graphic design (University of Cape Town). Strong background in logistics, retail, and supplier management.",
        "Full-time commitment to scaling Qwertymates.",
      ],
    },
    {
      title: "Funding Ask",
      lines: [
        "Raise: R500,000 – R1,500,000 (~USD 30k – 90k).",
        "Minimum ticket: R250,000 (~USD 15k).",
        "Use of funds: merchant expansion, AI enhancement, regional scaling.",
      ],
    },
    {
      title: "NquBator Fit",
      lines: [
        "Motivation: leverage mentorship, partnerships, pilots, and fundraising readiness.",
        "Support needed: commercial growth, corporate partnerships, AI enablement, market expansion.",
        "Milestones: onboard 500+ merchants, scale AskMacGyver, expand regionally, grow ACBPay adoption.",
      ],
    },
    {
      title: "Closing",
      lines: [
        "Mission: Empower merchants, suppliers, and communities with inclusive digital commerce.",
        "Vision: Scale Qwertymates into Southern Africa as the leading AI-driven super-app.",
        "Call to action: Partner with us to accelerate inclusive growth.",
      ],
    },
  ];

  slides.forEach((slide, idx) => {
    const page = pdf.addPage([pageW, pageH]);
    const cover = idx === 0 || idx === 11;
    if (cover) {
      page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: navy });
      page.drawRectangle({ x: 0, y: 0, width: 12, height: pageH, color: brand });
      if (qPng) page.drawImage(qPng, { x: 48, y: pageH - 110, width: 64, height: 64 });
      page.drawText(idx === 0 ? "Qwertymates" : "Qwertymates", {
        x: 128,
        y: pageH - 85,
        size: 22,
        font: fontBold,
        color: white,
      });
      let y = pageH - 170;
      for (const line of slide.lines) {
        const wrapped = wrapPdf(line, 850, 18, font);
        for (const w of wrapped) {
          page.drawText(w, { x: 48, y, size: 18, font, color: white });
          y -= 28;
        }
        y -= 10;
      }
      page.drawText("Qwertymates  ·  Confidential", { x: 48, y: 28, size: 11, font, color: white });
      page.drawText(`${idx + 1}  /  12`, { x: pageW - 90, y: 28, size: 11, font, color: white });
      return;
    }
    page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: white });
    page.drawRectangle({ x: 0, y: pageH - 72, width: pageW, height: 72, color: navy });
    page.drawRectangle({ x: 0, y: pageH - 78, width: pageW, height: 6, color: brand });
    if (qPng) page.drawImage(qPng, { x: 22, y: pageH - 62, width: 42, height: 42 });
    page.drawText(slide.title, { x: 78, y: pageH - 48, size: 22, font: fontBold, color: white });
    let y = pageH - 120;
    for (const line of slide.lines) {
      const wrapped = wrapPdf(`•  ${line}`, 860, 16, font);
      for (const w of wrapped) {
        page.drawText(w, { x: 48, y, size: 16, font, color: slate });
        y -= 26;
      }
      y -= 12;
    }
    page.drawRectangle({ x: 0, y: 0, width: pageW, height: 36, color: navy });
    if (qPng) page.drawImage(qPng, { x: 18, y: 6, width: 24, height: 24 });
    page.drawText("Qwertymates  ·  Confidential", { x: 48, y: 12, size: 11, font, color: white });
    page.drawText(`${idx + 1}  /  13`, { x: pageW - 90, y: 12, size: 11, font, color: white });
  });

  const pdfPath = path.join(outDir, "Qwertymates-Pitch-Deck.pdf");
  fs.writeFileSync(pdfPath, await pdf.save());
  return pdfPath;
}

function writeReadme(paths) {
  const readme = path.join(outDir, "README.md");
  fs.writeFileSync(
    readme,
    `# Qwertymates pitch deck (NquBator)

12-slide investor / accelerator deck. Copy is the owner’s final content; layout uses official Qwertymates brand (Q emblem, sky/blue \`#1F6DE0\`, navy, white).

## Files

| File | Description |
|------|-------------|
| \`${path.basename(paths.pptx)}\` | Primary 16:9 PowerPoint (13 slides) |
| \`${path.basename(paths.pdf)}\` | PDF companion (same 13 slides) |

## Slides

1. Cover — Q emblem, “Join the Qwerty Revolution”, Ariel Madisha, business@, phone, WhatsApp
2. Problem
3. Vision
4. Product (7 cards: QwertyHub, AskMacGyver, ACBPay Wallet, QwertyTV & QwertyMusic, WhatsApp, Morongwa, Errands)
5. Qwertz — Video Editing Suite (9:16 short video, FFmpeg Phase 1 API)
6. Market & Customer
7. Traction
8. Business Model
9. Competitive Landscape
10. Team
11. Funding Ask
12. NquBator Fit
13. Closing

## Brand

- Official Q mark: \`frontend/public/qwertymates-q-mark-official.png\`
- Wordmark: \`frontend/public/qwertymates-logo.png\`
- Palette: \`#1F6DE0\` / navy \`#0B1F3A\` / white — not purple

## Regenerate

From \`backend/\`:

\`\`\`bash
node scripts/generateNquBatorPitchDeck.mjs
node scripts/sendNquBatorPitchDeckEmail.mjs
\`\`\`
`
  );
  return readme;
}

async function main() {
  ensureAssets();
  const pptxPath = await buildPptx();
  const pdfPath = await buildPdfCompanion();
  const readme = writeReadme({ pptx: pptxPath, pdf: pdfPath });
  console.log(JSON.stringify({ pptx: pptxPath, pdf: pdfPath, readme, slides: TOTAL }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
