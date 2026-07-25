import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import User from "../data/models/User";
import TuckshopCashAgentRegistration from "../data/models/TuckshopCashAgentRegistration";
import { sendEmailWithAttachments } from "./notification";

export type AgentCommissionSummary = {
  tuckshopsRegistered: number;
  pendingApprovals: number;
  totalCommissionsEarnedZar: number;
  /** Latest WA digits on file for payout/digest messages */
  notifyPhoneDigits: string;
};

function escapeCsvCell(v: string): string {
  const s = String(v ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function getAgentCommissionSummary(userId: mongoose.Types.ObjectId): Promise<AgentCommissionSummary> {
  const regs = await TuckshopCashAgentRegistration.find({ applicantUser: userId }).sort({ createdAt: -1 }).lean();
  const tuckshopsRegistered = regs.length;
  const pendingApprovals = regs.filter((r) => String(r.status || "") === "pending").length;
  const approved = regs.filter((r) => String(r.status || "") === "approved");
  const totalCommissionsEarnedZar = approved.reduce((s, r) => s + Number((r as any).commissionAmountZar || 0), 0);
  const notifyPhoneDigits = String(regs[0]?.waPhoneDigits || "").replace(/\D/g, "");
  return { tuckshopsRegistered, pendingApprovals, totalCommissionsEarnedZar, notifyPhoneDigits };
}

export function buildAgentRegistrationsCsv(rows: Array<Record<string, unknown>>): string {
  const header = [
    "tuckshopName",
    "status",
    "preferredPaymentMethod",
    "tuckshopContactPhone",
    "commissionAmountZar",
    "submittedAt",
    "reviewedAt",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        escapeCsvCell(String(r.tuckshopName ?? "")),
        escapeCsvCell(String(r.status ?? "")),
        escapeCsvCell(String(r.preferredPaymentMethod ?? "")),
        escapeCsvCell(String(r.tuckshopContactPhone ?? "")),
        escapeCsvCell(String(Number((r as any).commissionAmountZar || 0))),
        escapeCsvCell(r.createdAt ? new Date(String(r.createdAt)).toISOString() : ""),
        escapeCsvCell(r.reviewedAt ? new Date(String(r.reviewedAt)).toISOString() : ""),
      ].join(",")
    );
  }
  return lines.join("\n");
}

export async function buildAgentEarningsPdfBuffer(
  summary: AgentCommissionSummary,
  displayName: string
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).text("Qwertymates — Agent earnings", { align: "center" });
    doc.moveDown();
    doc.fontSize(11).text(`Agent: ${displayName}`);
    doc.text(`Generated (UTC): ${new Date().toISOString()}`);
    doc.moveDown();
    doc.fontSize(12).text(`Tuckshops registered: ${summary.tuckshopsRegistered}`);
    doc.text(`Pending approvals: ${summary.pendingApprovals}`);
    doc.text(`Total commissions earned (ZAR): ${summary.totalCommissionsEarnedZar.toFixed(2)}`);
    doc.moveDown();
    doc
      .fontSize(10)
      .text(
        "This PDF summarizes tuckshop cash-agent registrations tied to your Qwertymates account. Line detail is in the attached CSV.",
        { width: 500 }
      );
    doc.end();
  });
}

export async function emailAgentEarningsReportForUser(
  userId: mongoose.Types.ObjectId
): Promise<{ ok: boolean; message: string }> {
  const user = await User.findById(userId).select("email name username").lean();
  const email = String((user as any)?.email || "").trim();
  if (!email) {
    return { ok: false, message: "Add an email address to your profile first, then request the report again." };
  }
  const regs = await TuckshopCashAgentRegistration.find({ applicantUser: userId }).sort({ createdAt: -1 }).lean();
  const summary = await getAgentCommissionSummary(userId);
  const csv = buildAgentRegistrationsCsv(regs as any[]);
  const displayName = String((user as any)?.name || (user as any)?.username || "Agent");
  const pdf = await buildAgentEarningsPdfBuffer(summary, displayName);
  const stamp = Date.now();
  const sent = await sendEmailWithAttachments({
    to: email,
    subject: "Qwertymates — Agent earnings report",
    text: [
      `Hi ${displayName},`,
      "",
      "Attached: CSV (detail) and PDF (summary).",
      "",
      `Tuckshops registered: ${summary.tuckshopsRegistered}`,
      `Pending approvals: ${summary.pendingApprovals}`,
      `Total commissions earned (ZAR): ${summary.totalCommissionsEarnedZar.toFixed(2)}`,
      "",
      `Dashboard: ${String(process.env.FRONTEND_URL || "https://www.qwertymates.com").replace(/\/$/, "")}/wallet/agent-earnings`,
    ].join("\n"),
    attachments: [
      { filename: `agent-earnings-${stamp}.csv`, content: csv, contentType: "text/csv; charset=utf-8" },
      { filename: `agent-earnings-${stamp}.pdf`, content: pdf, contentType: "application/pdf" },
    ],
  });
  if (!sent) {
    return { ok: false, message: "Email could not be sent (mail not configured or SMTP error)." };
  }
  return { ok: true, message: `Report sent to ${email}` };
}
