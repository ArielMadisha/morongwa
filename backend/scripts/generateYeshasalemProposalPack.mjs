#!/usr/bin/env node
/**
 * Generate Yeshasalem District Executive partnership deck + formal letter.
 * Merges administrator@ email draft + owner-added omitted slide content
 * (ThauThau Haramanuba / data sovereignty; AskMacGyver data centres).
 *
 * From backend/: node scripts/generateYeshasalemProposalPack.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PptxGenJS from "pptxgenjs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ImageRun,
} from "docx";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, "DOCS", "Yeshasalem-District-Executive");

const BRAND = {
  brand600: "1F6DE0",
  brand700: "1958B3",
  brand500: "2E8AFF",
  cyan: "38BDF8",
  navy: "0B1F3A",
  slate900: "0F172A",
  slate700: "334155",
  slate500: "64748B",
  soft: "EEF7FF",
  white: "FFFFFF",
  accentLine: "B6DBFF",
};

const qMark = path.join(root, "frontend", "public", "qwertymates-q-mark-official.png");
const wordmark = path.join(root, "frontend", "public", "qwertymates-logo.png");
const textLogo = path.join(root, "frontend", "public", "qwertymates-text-logo.png");

function ensureAssets() {
  if (!fs.existsSync(qMark)) throw new Error(`Missing Q mark: ${qMark}`);
  if (!fs.existsSync(wordmark)) throw new Error(`Missing wordmark: ${wordmark}`);
  fs.mkdirSync(outDir, { recursive: true });
}

function addFooter(slide, pptx, page, total) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 5.2,
    w: 10,
    h: 0.425,
    fill: { color: BRAND.navy },
  });
  slide.addText("Qwertymates (Pty) Ltd  ·  Confidential partnership proposal", {
    x: 0.4,
    y: 5.28,
    w: 7.5,
    h: 0.28,
    fontSize: 10,
    color: BRAND.white,
    fontFace: "Calibri",
  });
  slide.addText(`${page} / ${total}`, {
    x: 8.2,
    y: 5.28,
    w: 1.4,
    h: 0.28,
    fontSize: 10,
    color: BRAND.white,
    align: "right",
    fontFace: "Calibri",
  });
}

function addHeaderBar(slide, pptx, title) {
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.95,
    fill: { color: BRAND.navy },
  });
  slide.addShape(pptx.ShapeType.rect, {
    x: 0,
    y: 0.95,
    w: 10,
    h: 0.08,
    fill: { color: BRAND.brand600 },
  });
  if (fs.existsSync(qMark)) {
    slide.addImage({ path: qMark, x: 0.28, y: 0.16, w: 0.62, h: 0.62 });
  }
  slide.addText(title, {
    x: 1.05,
    y: 0.22,
    w: 8.5,
    h: 0.55,
    fontSize: 22,
    bold: true,
    color: BRAND.white,
    fontFace: "Calibri",
  });
}

function bulletSlide(pptx, opts) {
  const { title, bullets, page, total, accent } = opts;
  const slide = pptx.addSlide();
  slide.background = { color: BRAND.white };
  addHeaderBar(slide, pptx, title);
  if (accent) {
    slide.addText(accent, {
      x: 0.45,
      y: 1.2,
      w: 9.1,
      h: 0.35,
      fontSize: 13,
      italic: true,
      color: BRAND.brand700,
      fontFace: "Calibri",
    });
  }
  const startY = accent ? 1.6 : 1.25;
  slide.addText(
    bullets.map((b) => ({
      text: b,
      options: { bullet: true, breakLine: true },
    })),
    {
      x: 0.5,
      y: startY,
      w: 9,
      h: 3.5,
      fontSize: 16,
      color: BRAND.slate900,
      fontFace: "Calibri",
      paraSpacing: 10,
      valign: "top",
    }
  );
  addFooter(slide, pptx, page, total);
  return slide;
}

async function buildPptx() {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "LAYOUT_16x9", width: 10, height: 5.625 });
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "Ariel, Founder & CEO — Qwertymates (Pty) Ltd";
  pptx.title = "Qwertymates Partnership & Management Proposal — Yeshasalem District Executive";
  pptx.subject = "Partnership, PMC formation, job creation";

  const TOTAL = 15;

  // 1 Title
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.navy };
    s.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 4.55,
      w: 10,
      h: 1.075,
      fill: { color: BRAND.brand600 },
    });
    if (fs.existsSync(qMark)) {
      s.addImage({ path: qMark, x: 0.55, y: 0.55, w: 1.15, h: 1.15 });
    }
    if (fs.existsSync(wordmark)) {
      s.addImage({ path: wordmark, x: 1.9, y: 0.85, w: 3.4, h: 0.55 });
    } else if (fs.existsSync(textLogo)) {
      s.addImage({ path: textLogo, x: 1.9, y: 0.75, w: 3.6, h: 0.7 });
    }
    s.addText("Partnership & Management Proposal", {
      x: 0.55,
      y: 2.0,
      w: 9,
      h: 0.7,
      fontSize: 32,
      bold: true,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    s.addText("Prepared for Yeshasalem District Executive\nYouth Development Team & District Executive Committee", {
      x: 0.55,
      y: 2.8,
      w: 9,
      h: 0.7,
      fontSize: 16,
      color: BRAND.cyan,
      fontFace: "Calibri",
    });
    s.addText("From: Ariel, Founder & CEO, Qwertymates (Pty) Ltd", {
      x: 0.55,
      y: 4.75,
      w: 9,
      h: 0.35,
      fontSize: 14,
      color: BRAND.white,
      fontFace: "Calibri",
    });
    s.addText("1 / 15", {
      x: 8.3,
      y: 5.15,
      w: 1.3,
      h: 0.25,
      fontSize: 11,
      color: BRAND.white,
      align: "right",
      fontFace: "Calibri",
    });
  }

  // 2 Vision
  bulletSlide(pptx, {
    title: "Vision",
    page: 2,
    total: TOTAL,
    accent: "A community-driven digital ecosystem for jobs, youth empowerment, and ownership.",
    bullets: [
      "Create jobs and eradicate poverty through accessible digital tools.",
      "Empower youth and local entrepreneurs to start and grow businesses.",
      "Build financial independence through technology — including community-owned financial infrastructure.",
      "Protect community knowledge, culture, and data sovereignty.",
    ],
  });

  // 3 Introduction
  bulletSlide(pptx, {
    title: "Introduction — Community Economy",
    page: 3,
    total: TOTAL,
    bullets: [
      "Qwertymates is designed to create jobs, empower youth, and build sustainable businesses.",
      "By partnering with the Youth Development Team and District Executive Committee, we integrate existing empowerment initiatives with live platforms.",
      "This is not a one-off app — it is a connected community economy: commerce, payments, media, messaging, micro-jobs, and AI support.",
      "Goal: real opportunities that stay owned by our people — shops, content, skills, and financial pathways.",
    ],
  });

  // 4 Ecosystem overview
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Qwertymates Ecosystem Overview");
    const cards = [
      ["QwertyHub", "Essentials marketplace"],
      ["ACBPAYWallet", "Cash, agents & payweb"],
      ["QwertyTV", "Creators & teaching"],
      ["QwertyMusic", "Artist ownership"],
      ["AskMacGyver AI", "Productivity & data"],
      ["Morongwa", "Voice, video, groups"],
      ["Errands", "Micro-jobs"],
      ["MyStore", "Auto storefronts"],
    ];
    cards.forEach((c, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = 0.4 + col * 2.4;
      const y = 1.3 + row * 1.7;
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y,
        w: 2.2,
        h: 1.4,
        fill: { color: BRAND.soft },
        line: { color: BRAND.accentLine, width: 1 },
        rectRadius: 0.1,
      });
      s.addText(c[0], {
        x: x + 0.1,
        y: y + 0.3,
        w: 2.0,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: BRAND.brand700,
        align: "center",
        fontFace: "Calibri",
      });
      s.addText(c[1], {
        x: x + 0.1,
        y: y + 0.75,
        w: 2.0,
        h: 0.4,
        fontSize: 12,
        color: BRAND.slate700,
        align: "center",
        fontFace: "Calibri",
      });
    });
    addFooter(s, pptx, 4, TOTAL);
  }

  // 5 QwertyHub (corrected per admin email 11 Aug 2026 — multi-function essentials marketplace)
  bulletSlide(pptx, {
    title: "QwertyHub — Default Marketplace for Essentials",
    page: 5,
    total: TOTAL,
    accent: "Multi-function marketplace: essentials, food/restaurants, groceries, and Errands delivery.",
    bullets: [
      "Default marketplace for essentials — suppliers and manufacturers list products; users can resell them.",
      "Food and restaurant ordering, integrated with Errands for collection or delivery.",
      "Groceries option: customers order from participating stores.",
      "MyStore storefronts as people begin reselling — focus on selling, not warehouses.",
      "Impact: instant entrepreneurship and poverty eradication pathways for youth and households.",
    ],
  });

  // 6 ACBPAYWallet
  bulletSlide(pptx, {
    title: "ACBPAYWallet — Our Banking Vision",
    page: 6,
    total: TOTAL,
    accent: "Part of 101’s vision to build our own bank for community financial independence.",
    bullets: [
      "Send and receive cash securely across the ecosystem.",
      "Shops and hawkers can act as cash agents — local liquidity and inclusion.",
      "Functions as a payweb for online payments for businesses and customers.",
      "Supports marketplace, errands, and platform settlements in one wallet layer.",
      "Long-term: own-bank infrastructure so communities are not dependent on external systems alone.",
    ],
  });

  // 7 QwertyTV (includes omitted ThauThau content)
  bulletSlide(pptx, {
    title: "QwertyTV — Video Empowerment & Teaching",
    page: 7,
    total: TOTAL,
    accent: "Creators monetize content; communities protect knowledge and teach ThauThau Haramanuba.",
    bullets: [
      "Platform for video creators to publish, monetize, and retain ownership of their content.",
      "Empowers local filmmakers, educators, and community leaders to share knowledge and earn.",
      "Data sovereignty: community content and teaching materials stay under community control.",
      "Dedicated teaching platform for ThauThau Haramanuba — culture, values, and education on our own rails.",
      "Impact: local knowledge and creativity generate income and strengthen identity.",
    ],
  });

  // 8 QwertyMusic
  bulletSlide(pptx, {
    title: "QwertyMusic — Artist Ownership",
    page: 8,
    total: TOTAL,
    bullets: [
      "Artists retain full ownership of their music and related data.",
      "Data sovereignty ensures fair earnings — not extraction by middlemen.",
      "Stream, buy, download; artists, publishers, and labels can upload and monetize directly.",
      "Impact: musicians thrive without exploitation; culture stays owned at home.",
    ],
  });

  // 9 AskMacGyver (includes omitted data centre content)
  bulletSlide(pptx, {
    title: "AskMacGyver AI — Productivity & Data Protection",
    page: 9,
    total: TOTAL,
    accent: "Smarter communities — and a path to owning our own data centres.",
    bullets: [
      "AI support for problem-solving, automation, and everyday productivity.",
      "Helps students, entrepreneurs, small businesses, and district programmes streamline work.",
      "Guides users across QwertyHub, wallet, media, and errands — one copilot for the ecosystem.",
      "Strategic goal: build our own data centres so community data is protected and held under our control.",
      "Today much data sits in centres we do not own — this partnership is a step toward data independence.",
    ],
  });

  // 10 Morongwa
  bulletSlide(pptx, {
    title: "Morongwa Messenger — Connected Communities",
    page: 10,
    total: TOTAL,
    bullets: [
      "Voice calls, video calls, group chats, and file sharing in one place.",
      "Keeps families, businesses, youth teams, and district programmes connected.",
      "Supports order, delivery, and errand conversations without leaving the ecosystem.",
      "Impact: affordable, reliable communication for business, education, and family support.",
    ],
  });

  // 11 Errands
  bulletSlide(pptx, {
    title: "Errands — Micro-Jobs Platform",
    page: 11,
    total: TOTAL,
    bullets: [
      "Clients register tasks; errand runners browse and complete them.",
      "Funds held securely until completion — fair, transparent payment release.",
      "Creates immediate micro-job opportunities for youth and unemployed members.",
      "Impact: everyday community needs become income streams.",
    ],
  });

  // 12 Jobs
  bulletSlide(pptx, {
    title: "Job Creation Potential",
    page: 12,
    total: TOTAL,
    accent: "Through this partnership, Qwertymates will generate roles across the district economy.",
    bullets: [
      "Digital shop owners via QwertyHub (no stock needed).",
      "Delivery agents & errand runners for groceries, restaurants, and errands.",
      "Tech developers & designers to maintain and expand the ecosystem.",
      "Community coordinators to integrate youth and district projects.",
      "Customer support agents to assist merchants and buyers.",
      "Finance officers & compliance managers to support ACBPAYWallet’s banking vision.",
      "Content creators & artists empowered through QwertyTV and QwertyMusic.",
    ],
  });

  // 13 Revenue & Impact (admin email “Execute” + Revenue & Impact Model graphic, 11 Aug 2026)
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Revenue & Impact Model");
    s.addText("Financial sustainability that funds youth programmes, bursaries, and community ownership.", {
      x: 0.4,
      y: 1.12,
      w: 9.2,
      h: 0.28,
      fontSize: 12,
      italic: true,
      color: BRAND.brand700,
      fontFace: "Calibri",
    });
    const streams = [
      ["Advertising", "Local shops & services on QwertyHub, QwertyTV, Messenger — sales & media jobs for youth."],
      ["Commissions", "2–5% marketplace fees (groceries, clothing, restaurants) — funds bursaries & training."],
      ["Wallet fees", "ACBPAYWallet micro-fees (R1–R3) on transfers — liquidity agents & community finance."],
    ];
    streams.forEach((row, i) => {
      const x = 0.35 + i * 3.15;
      s.addShape(pptx.ShapeType.roundRect, {
        x,
        y: 1.45,
        w: 3.0,
        h: 1.35,
        fill: { color: BRAND.soft },
        line: { color: BRAND.accentLine, width: 1 },
        rectRadius: 0.08,
      });
      s.addText(row[0], {
        x: x + 0.12,
        y: 1.55,
        w: 2.75,
        h: 0.32,
        fontSize: 14,
        bold: true,
        color: BRAND.brand700,
        fontFace: "Calibri",
      });
      s.addText(row[1], {
        x: x + 0.12,
        y: 1.9,
        w: 2.75,
        h: 0.8,
        fontSize: 11,
        color: BRAND.slate700,
        fontFace: "Calibri",
      });
    });
    s.addText("Illustrative monthly projection (example volumes)", {
      x: 0.4,
      y: 2.95,
      w: 9,
      h: 0.28,
      fontSize: 12,
      bold: true,
      color: BRAND.navy,
      fontFace: "Calibri",
    });
    s.addTable(
      [
        [
          { text: "Revenue stream", options: { bold: true, color: BRAND.white, fill: { color: BRAND.navy } } },
          { text: "Example volume", options: { bold: true, color: BRAND.white, fill: { color: BRAND.navy } } },
          { text: "Fee / rate", options: { bold: true, color: BRAND.white, fill: { color: BRAND.navy } } },
          { text: "Monthly", options: { bold: true, color: BRAND.white, fill: { color: BRAND.navy } } },
        ],
        ["Advertising", "50 local businesses", "R1,000 / month", "R50,000"],
        ["Commission", "10,000 transactions", "Avg R200 · 3%", "R60,000"],
        ["Wallet fees", "20,000 transfers", "R2 / transfer", "R40,000"],
      ],
      {
        x: 0.4,
        y: 3.28,
        w: 9.2,
        colW: [2.2, 2.6, 2.4, 2.0],
        border: [{ pt: 0.5, color: BRAND.accentLine }],
        fontFace: "Calibri",
        fontSize: 11,
        color: BRAND.slate900,
        align: "left",
        valign: "middle",
      }
    );
    s.addText(
      "Total potential ≈ R150,000 / month → reinvested into youth programmes, Tau Skills Academy, bursaries & community-owned infrastructure.",
      {
        x: 0.4,
        y: 4.75,
        w: 9.2,
        h: 0.35,
        fontSize: 12,
        bold: true,
        color: BRAND.navy,
        fontFace: "Calibri",
      }
    );
    addFooter(s, pptx, 13, TOTAL);
  }

  // 14 PMC
  bulletSlide(pptx, {
    title: "First Step — Project Management Committee (PMC)",
    page: 14,
    total: TOTAL,
    accent: "Drawn from the Youth Development Team and District Executive Committee.",
    bullets: [
      "PMC oversees rollout, aligns Qwertymates with community projects, and ensures accountability.",
      "Members may be registered as directors — formal governance roles in Qwertymates’ expansion.",
      "Bridge between Qwertymates and local initiatives — community ownership of the future.",
      "Integrate empowerment programmes: Tau Skills Academy, bursary schemes, and district projects.",
      "Once the team has perused and is satisfied, forward as a formal request for approval to the relevant authorities.",
    ],
  });

  // 15 Conclusion
  {
    const s = pptx.addSlide();
    s.background = { color: BRAND.white };
    addHeaderBar(s, pptx, "Conclusion & Call to Action");
    s.addText("Qwertymates is not just a platform — it is a community economy builder.", {
      x: 0.5,
      y: 1.25,
      w: 9,
      h: 0.45,
      fontSize: 16,
      italic: true,
      color: BRAND.brand700,
      fontFace: "Calibri",
    });
    s.addText(
      [
        { text: "Together, we will:", options: { breakLine: true, bold: true } },
        { text: "Create jobs and support entrepreneurs.", options: { bullet: true, breakLine: true } },
        { text: "Empower youth and integrate district programmes.", options: { bullet: true, breakLine: true } },
        { text: "Build financial independence and data sovereignty.", options: { bullet: true, breakLine: true } },
        { text: "Ensure ownership of our future — shops, art, knowledge, and infrastructure.", options: { bullet: true, breakLine: true } },
      ],
      {
        x: 0.5,
        y: 1.85,
        w: 9,
        h: 2.2,
        fontSize: 16,
        color: BRAND.slate900,
        fontFace: "Calibri",
        paraSpacing: 8,
      }
    );
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.5,
      y: 4.15,
      w: 9,
      h: 0.75,
      fill: { color: BRAND.soft },
      line: { color: BRAND.brand600, width: 1.5 },
      rectRadius: 0.08,
    });
    s.addText(
      "We invite Yeshasalem District Executive, the Youth Development Team, and the District Executive Committee to join the Project Management Committee.",
      {
        x: 0.7,
        y: 4.25,
        w: 8.6,
        h: 0.55,
        fontSize: 13,
        bold: true,
        color: BRAND.navy,
        fontFace: "Calibri",
        align: "center",
      }
    );
    addFooter(s, pptx, 15, TOTAL);
  }

  const pptxPath = path.join(outDir, "Qwertymates-Partnership-Management-Proposal-Yeshasalem.pptx");
  await pptx.writeFile({ fileName: pptxPath });
  return pptxPath;
}

async function buildDocx() {
  const qMarkBuf = fs.readFileSync(qMark);
  const children = [
    new Paragraph({
      children: [
        new ImageRun({
          type: "png",
          data: qMarkBuf,
          transformation: { width: 72, height: 72 },
          altText: { title: "Qwertymates", description: "Official Q mark", name: "qmark" },
        }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "QWERTYMATES (PTY) LTD",
          bold: true,
          size: 28,
          color: BRAND.navy,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Community economy · Jobs · Youth empowerment · Ownership",
          size: 20,
          color: BRAND.brand700,
          font: "Calibri",
          italics: true,
        }),
      ],
      spacing: { after: 300 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND.brand600, space: 8 },
      },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Formal Partnership Letter", bold: true, size: 32, color: BRAND.navy, font: "Calibri" })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Date: ${new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}`, size: 22, font: "Calibri" })],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "To:", bold: true, size: 22, font: "Calibri" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: "Yeshasalem District Youth Executive", size: 22, font: "Calibri" })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Youth Development Team & District Executive Committee",
          size: 22,
          font: "Calibri",
        }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "From:", bold: true, size: 22, font: "Calibri" })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Ariel, Founder & CEO, Qwertymates (Pty) Ltd",
          size: 22,
          font: "Calibri",
        }),
      ],
      spacing: { after: 300 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Subject: Partnership Proposal for Youth Empowerment Initiatives",
          bold: true,
          size: 22,
          font: "Calibri",
        }),
      ],
      spacing: { after: 300 },
    }),
    ...para("Dear Yeshasalem District Youth Executive,"),
    ...para(
      "Qwertymates is a community-driven digital ecosystem designed to create jobs, empower youth, and build sustainable businesses. I am writing to formally propose a partnership between Qwertymates and the Yeshasalem District Youth Executive to align district youth empowerment initiatives with our platforms."
    ),
    heading("Our platforms"),
    ...para(
      "QwertyHub — the default marketplace for essentials. Suppliers and manufacturers list their products, and users can resell them. It also offers food and restaurant ordering, integrated with Errands for collection or delivery, and a groceries option where customers can order from participating stores."
    ),
    ...para(
      "ACBPAYWallet — a digital wallet with agents, payweb, and an own-bank vision."
    ),
    ...para(
      "QwertyTV — creator monetization, data sovereignty, and ThauThau Haramanuba teaching."
    ),
    ...para("QwertyMusic — artist ownership and fair distribution."),
    ...para("AskMacGyver AI — productivity tools and data centre development."),
    ...para("Morongwa Messenger and Errands — communication and micro-job opportunities."),
    heading("Job creation potential"),
    ...bullets([
      "Digital shop owners via QwertyHub (no stock needed)",
      "Delivery agents and errand runners for groceries, restaurants, and errands",
      "Tech developers and designers to maintain and expand the ecosystem",
      "Community coordinators to integrate youth and district projects",
      "Customer support agents for merchants and buyers",
      "Finance officers and compliance managers supporting ACBPAYWallet’s banking vision",
      "Content creators and artists through QwertyTV and QwertyMusic",
    ]),
    heading("First step — Project Management Committee"),
    ...para(
      "We propose the formation of a Project Management Committee (PMC) composed of members from the Youth Executive. The committee will guide rollout in alignment with Tau Skills Academy, bursary programs, and district projects. Members of the PMC may also serve as directors, ensuring shared ownership and accountability."
    ),
    ...para(
      "Once the team has perused the proposal and are satisfied, we can forward it as a formal request for approval to the relevant authorities."
    ),
    heading("Invitation"),
    ...para(
      "This partnership is intended to be the first step toward job creation, youth empowerment, and community ownership in Yeshasalem District."
    ),
    ...para(
      "Please see the accompanying PowerPoint deck (15 slides, including Revenue & Impact) and Word proposal letter for detailed information. I look forward to your response and to working together on this important initiative."
    ),
    ...para("Sincerely,"),
    new Paragraph({
      children: [new TextRun({ text: "Ariel", bold: true, size: 22, font: "Calibri" })],
      spacing: { before: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "Founder & CEO, Qwertymates (Pty) Ltd",
          size: 22,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: "www.qwertymates.com",
          size: 20,
          color: BRAND.brand600,
          font: "Calibri",
        }),
      ],
      spacing: { before: 100 },
    }),
  ];

  const doc = new Document({
    creator: "Qwertymates (Pty) Ltd",
    title: "Letter — Yeshasalem District Executive — Qwertymates Partnership",
    description: "Formal partnership and PMC proposal letter",
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  const docxPath = path.join(outDir, "Letter-Yeshasalem-District-Executive-Qwertymates-Partnership.docx");
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buf);
  return docxPath;
}

function para(text) {
  return [
    new Paragraph({
      children: [new TextRun({ text, size: 22, font: "Calibri", color: "0F172A" })],
      spacing: { after: 200 },
      alignment: AlignmentType.JUSTIFIED,
    }),
  ];
}

function heading(text) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 24, color: BRAND.brand700, font: "Calibri" })],
    spacing: { before: 240, after: 120 },
    heading: HeadingLevel.HEADING_2,
  });
}

function bullets(items) {
  return items.map(
    (t) =>
      new Paragraph({
        children: [new TextRun({ text: t, size: 22, font: "Calibri" })],
        bullet: { level: 0 },
        spacing: { after: 80 },
      })
  );
}

async function buildPdfLetter(docxNotePath) {
  // Lightweight PDF letter (text) for easy sharing alongside DOCX
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([595, 842]);
  const navy = rgb(0.043, 0.122, 0.227);
  const brand = rgb(0.122, 0.427, 0.878);
  let y = 800;
  const left = 50;
  const width = 495;

  const draw = (text, opts = {}) => {
    const size = opts.size || 11;
    const f = opts.bold ? fontBold : font;
    const color = opts.color || navy;
    const lines = wrap(text, width, size, f);
    for (const line of lines) {
      if (y < 60) {
        y = 800;
        pdf.addPage([595, 842]);
      }
      const p = pdf.getPages()[pdf.getPageCount() - 1];
      p.drawText(line, { x: left, y, size, font: f, color });
      y -= size + 6;
    }
    if (opts.gap) y -= opts.gap;
  };

  // Logo
  if (fs.existsSync(qMark)) {
    const png = await pdf.embedPng(fs.readFileSync(qMark));
    const p0 = pdf.getPages()[0];
    p0.drawImage(png, { x: left, y: 760, width: 48, height: 48 });
    y = 740;
  }

  draw("QWERTYMATES (PTY) LTD", { bold: true, size: 14, gap: 4 });
  draw("Formal Partnership Letter — Yeshasalem District Executive", { bold: true, size: 12, color: brand, gap: 10 });
  draw(`Date: ${new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}`, { gap: 8 });
  draw("To: Yeshasalem District Executive; Youth Development Team & District Executive Committee", { gap: 4 });
  draw("From: Ariel, Founder & CEO, Qwertymates (Pty) Ltd", { gap: 10 });
  draw(
    "Qwertymates is a community-driven digital ecosystem designed to create jobs, empower youth, and build sustainable businesses. We propose a partnership to integrate district empowerment initiatives with the Qwertymates platforms.",
    { gap: 8 }
  );
  draw(
    "Platforms include QwertyHub (default marketplace for essentials; suppliers list products for resale; food/restaurant ordering with Errands collection or delivery; groceries from participating stores), ACBPAYWallet (agents, payweb, own-bank vision), QwertyTV (creator monetization, data sovereignty, ThauThau Haramanuba teaching), QwertyMusic (artist ownership), AskMacGyver AI (productivity and data centres), Morongwa Messenger, and Errands micro-jobs.",
    { gap: 8 }
  );
  draw(
    "We propose a Project Management Committee (PMC) from the Youth Executive to guide rollout with Tau Skills Academy, bursaries, and district projects. Members may serve as directors. Once the team has perused and is satisfied, we can forward it as a formal request for approval.",
    { gap: 8 }
  );
  draw(
    "Please see the accompanying PowerPoint deck (15 slides, including Revenue & Impact) and Word letter for the full proposal. We look forward to establishing the PMC as the first step toward shared job creation and community ownership.",
    { gap: 12 }
  );
  draw("Sincerely,", { gap: 16 });
  draw("Ariel", { bold: true });
  draw("Founder & CEO, Qwertymates (Pty) Ltd");
  draw("www.qwertymates.com", { color: brand });

  // unused param silences lint if any
  void docxNotePath;

  const pdfPath = path.join(outDir, "Letter-Yeshasalem-District-Executive-Qwertymates-Partnership.pdf");
  fs.writeFileSync(pdfPath, await pdf.save());
  return pdfPath;
}

function wrap(text, maxWidth, size, font) {
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

function writeReadme(paths) {
  const readme = path.join(outDir, "README.md");
  fs.writeFileSync(
    readme,
    `# Yeshasalem District Executive — Qwertymates partnership pack

Combined partnership presentation and formal letter for Yeshasalem District Executive (Youth Development Team & District Executive Committee).

## Files

| File | Description |
|------|-------------|
| \`${path.basename(paths.pptx)}\` | 15-slide deck (admin letter + QwertyHub correction + Revenue & Impact + owner additions) |
| \`${path.basename(paths.docx)}\` | Formal letter from Ariel (CEO) |
| \`${path.basename(paths.pdf)}\` | PDF letter (shareable) |

## Merge notes

- **Source A:** Email from administrator@qwertymates.com (11 Aug 2026) — letter + slide outline.
- **Source B:** Correction email — expanded QwertyHub (essentials, food/Errands, groceries).
- **Source C:** Execute email — Revenue & Impact Model slide (ads, commissions, wallet fees; ≈ R150k illustrative monthly).
- **Source D (owner richness):** ThauThau Haramanuba / data sovereignty on QwertyTV; own data centres on AskMacGyver; Tau Skills Academy / bursaries in PMC.

Brand: official Q mark + wordmark; sky/blue palette (\`#1F6DE0\` / navy), not purple.
`
  );
  return readme;
}

async function main() {
  ensureAssets();
  const pptx = await buildPptx();
  const docx = await buildDocx();
  const pdf = await buildPdfLetter(docx);
  const readme = writeReadme({ pptx, docx, pdf });
  console.log(JSON.stringify({ pptx, docx, pdf, readme, slides: 15 }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
