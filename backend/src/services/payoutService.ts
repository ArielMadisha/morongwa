// Payout & escrow service for managing fund flow and FNB integration
import Escrow, { IEscrow } from "../data/models/Escrow";
import LedgerEntry from "../data/models/LedgerEntry";
import Task from "../data/models/Task";
import User from "../data/models/User";
import fnbService from "./fnbService";
import feeService from "./feeService";
import logger from "../utils/logger";

class PayoutService {
  /**
   * Create escrow record after successful payment collection
   */
  async createEscrow(
    taskId: string,
    clientId: string,
    runnerId: string,
    taskPrice: number,
    currency: string,
    paymentReference: string,
    paymentMethod: string,
    distance?: number,
    isPeakHours?: boolean,
    weight?: number,
    isUrgent?: boolean
  ): Promise<IEscrow> {
    const feeBreakdown = feeService.calculateFees({
      taskPrice,
      currency,
      distance,
      isPeakHours,
      weight,
      isUrgent,
    });

    const escrow = new Escrow({
      task: taskId,
      client: clientId,
      runner: runnerId,
      currency,
      taskPrice,
      fees: {
        bookingFee: feeBreakdown.bookingFee,
        commission: feeBreakdown.commission,
        distanceSurcharge: feeBreakdown.distanceSurcharge,
        peakSurcharge: feeBreakdown.peakSurcharge,
        weightSurcharge: feeBreakdown.weightSurcharge,
        urgencySurcharge: feeBreakdown.urgencySurcharge,
        total: feeBreakdown.totalFees,
      },
      totalHeld: feeBreakdown.totalHeld,
      runnersNet: feeBreakdown.runnersNet,
      status: "pending",
      paymentReference,
      paymentMethod,
      paymentStatus: "pending",
    });

    await escrow.save();

    // Create ledger entries
    await this.createLedgerEntry(
      escrow._id.toString(),
      taskId,
      clientId,
      "DEPOSIT",
      feeBreakdown.totalHeld,
      currency,
      "client_wallet",
      "morongwa_merchant",
      paymentReference,
      "pending",
      { reason: "Client payment collected via PayGate" }
    );

    await this.createLedgerEntry(
      escrow._id.toString(),
      taskId,
      clientId,
      "BOOKING_FEE",
      feeBreakdown.bookingFee,
      currency,
      "morongwa_merchant",
      "system_fee",
      paymentReference,
      "pending",
      { reason: "Booking fee deducted from escrow" }
    );

    await this.createLedgerEntry(
      escrow._id.toString(),
      taskId,
      null,
      "ESCROW_HOLD",
      feeBreakdown.totalHeld,
      currency,
      "morongwa_merchant",
      "morongwa_merchant",
      paymentReference,
      "pending",
      { reason: "Funds placed in escrow hold" }
    );

    logger.info("Escrow created", {
      escrowId: escrow._id,
      taskId,
      totalHeld: feeBreakdown.totalHeld,
      currency,
      paymentReference,
    });

    return escrow;
  }

  /**
   * Mark payment as settled in escrow
   */
  async markPaymentSettled(
    escrowId: string,
    paymentReference: string
  ): Promise<IEscrow> {
    const escrow = await Escrow.findByIdAndUpdate(
      escrowId,
      {
        paymentStatus: "settled",
        status: "held",
        paymentReference,
      },
      { new: true }
    );

    if (!escrow) {
      throw new Error(`Escrow not found: ${escrowId}`);
    }

    // Update ledger to confirmed
    await LedgerEntry.updateMany(
      { escrow: escrowId, type: { $in: ["DEPOSIT", "BOOKING_FEE"] } },
      { status: "confirmed" }
    );

    logger.info("Payment marked as settled", {
      escrowId,
      paymentReference,
    });

    return escrow;
  }

  /**
   * Release escrow (after task completion + review window)
   */
  async releaseEscrow(
    escrowId: string,
    releaseReason: "task_completed" | "review_expired" | "manual_release"
  ): Promise<IEscrow> {
    const escrow = await Escrow.findById(escrowId);

    if (!escrow) {
      throw new Error(`Escrow not found: ${escrowId}`);
    }

    if (escrow.status !== "held") {
      throw new Error(`Escrow not in held status: ${escrow.status}`);
    }

    // Update escrow
    escrow.status = "released";
    escrow.releaseReason = releaseReason;
    escrow.releasedAt = new Date();
    await escrow.save();

    // Create payout ledger entry
    await this.createLedgerEntry(
      escrowId,
      escrow.task.toString(),
      escrow.runner.toString(),
      "PAYOUT_INITIATED",
      escrow.runnersNet,
      escrow.currency,
      "morongwa_merchant",
      "runner_wallet",
      `PAYOUT-${escrow._id}`,
      "pending",
      {
        reason: releaseReason,
        runnersNet: escrow.runnersNet,
        commission: escrow.fees.commission,
      }
    );

    logger.info("Escrow released", {
      escrowId,
      runnersNet: escrow.runnersNet,
      releaseReason,
    });

    return escrow;
  }

  /**
   * Initiate payout to runner via FNB
   */
  async initiatePayout(escrowId: string): Promise<IEscrow> {
    const escrow = await Escrow.findById(escrowId).populate("runner");

    if (!escrow) {
      throw new Error(`Escrow not found: ${escrowId}`);
    }

    if (escrow.status !== "released") {
      throw new Error(
        `Escrow must be released before payout: ${escrow.status}`
      );
    }

    const runner = escrow.runner as any; // User document

    if (!runner.bankAccount) {
      throw new Error(`Runner has no bank account on file: ${runner._id}`);
    }

    try {
      // Create EFT payment via FNB
      const fnbResponse = await fnbService.createEFTPayment(
        runner.bankAccount.accountNumber,
        runner.bankAccount.accountName || runner.name,
        escrow.runnersNet,
        escrow.currency,
        `MORO-PAYOUT-${escrow._id}-${Date.now()}`,
        `Morongwa task #${escrow.task} payout for runner`,
        "EFT" // Use EFT for standard rails; RTC for real-time if enabled
      );

      // Update escrow with FNB details
      escrow.fnbInstructionId = fnbResponse.instructionId;
      escrow.fnbStatus = fnbResponse.state as any;
      escrow.fnbRetries = 0;
      await escrow.save();

      // Update ledger
      const ledgerEntry = await LedgerEntry.findOne({
        type: "PAYOUT_INITIATED",
        escrow: escrowId,
      });

      if (ledgerEntry) {
        ledgerEntry.status = "pending";
        ledgerEntry.relatedFNBInstructionId = fnbResponse.instructionId;
        ledgerEntry.meta = {
          ...ledgerEntry.meta,
          fnbInstructionId: fnbResponse.instructionId,
          fnbState: fnbResponse.state,
        };
        await ledgerEntry.save();
      }

      logger.info("Payout initiated via FNB", {
        escrowId,
        instructionId: fnbResponse.instructionId,
        amount: escrow.runnersNet,
        runner: runner._id,
      });

      return escrow;
    } catch (error: any) {
      logger.error("FNB payout initiation failed", {
        escrowId,
        error: error.message,
        runner: runner._id,
      });

      throw error;
    }
  }

  /**
   * Poll payout status and update escrow
   */
  async pollPayoutStatus(escrowId: string): Promise<IEscrow> {
    const escrow = await Escrow.findById(escrowId);

    if (!escrow) {
      throw new Error(`Escrow not found: ${escrowId}`);
    }

    if (!escrow.fnbInstructionId) {
      throw new Error(
        `No FNB instruction ID for escrow: ${escrowId}`
      );
    }

    try {
      const statusRes = await fnbService.getPaymentStatus(
        escrow.fnbInstructionId
      );

      escrow.fnbStatus = statusRes.state as any;

      if (statusRes.state === "SUCCESS") {
        escrow.status = "released";
        escrow.payoutCompletedAt = new Date();

        // Update ledger
        await this.createLedgerEntry(
          escrowId,
          escrow.task.toString(),
          escrow.runner.toString(),
          "PAYOUT_SUCCESS",
          escrow.runnersNet,
          escrow.currency,
          "morongwa_merchant",
          "runner_wallet",
          `PAYOUT-${escrow._id}`,
          "confirmed",
          {
            fnbInstructionId: escrow.fnbInstructionId,
            completedAt: new Date().toISOString(),
          }
        );

        logger.info("Payout succeeded", {
          escrowId,
          instructionId: escrow.fnbInstructionId,
        });
      } else if (
        statusRes.state === "FAILED" ||
        statusRes.state === "REJECTED"
      ) {
        escrow.fnbStatus = statusRes.state as any;
        escrow.fnbRetries++;
        escrow.fnbLastRetryAt = new Date();

        // Update ledger with failure
        await this.createLedgerEntry(
          escrowId,
          escrow.task.toString(),
          escrow.runner.toString(),
          "PAYOUT_FAILED",
          escrow.runnersNet,
          escrow.currency,
          "morongwa_merchant",
          "runner_wallet",
          `PAYOUT-${escrow._id}`,
          "failed",
          {
            fnbInstructionId: escrow.fnbInstructionId,
            failureReason: statusRes.failureReason,
            retryCount: escrow.fnbRetries,
          }
        );

        logger.warn("Payout failed", {
          escrowId,
          instructionId: escrow.fnbInstructionId,
          reason: statusRes.failureReason,
          retries: escrow.fnbRetries,
        });
      }

      await escrow.save();
      return escrow;
    } catch (error: any) {
      logger.error("Payout status poll failed", {
        escrowId,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Refund escrow (before task acceptance or after client dispute)
   */
  async refundEscrow(
    escrowId: string,
    refundReason: string
  ): Promise<IEscrow> {
    const escrow = await Escrow.findById(escrowId);

    if (!escrow) {
      throw new Error(`Escrow not found: ${escrowId}`);
    }

    if (!["pending", "held"].includes(escrow.status)) {
      throw new Error(
        `Cannot refund escrow with status: ${escrow.status}`
      );
    }

    // Calculate refund amount (full minus non-refundable booking fee)
    const refundAmount = escrow.totalHeld - escrow.fees.bookingFee;

    escrow.status = "refunded";
    escrow.refundReason = refundReason;
    escrow.refundedAt = new Date();
    await escrow.save();

    // Create refund ledger entries
    await this.createLedgerEntry(
      escrowId,
      escrow.task.toString(),
      escrow.client.toString(),
      "REFUND_INITIATED",
      refundAmount,
      escrow.currency,
      "morongwa_merchant",
      "client_wallet",
      `REFUND-${escrow._id}`,
      "pending",
      { reason: refundReason, nonRefundableFee: escrow.fees.bookingFee }
    );

    logger.info("Escrow refunded", {
      escrowId,
      refundAmount,
      reason: refundReason,
    });

    return escrow;
  }

  /**
   * Create a ledger entry
   */
  private async createLedgerEntry(
    escrowId: string,
    taskId: string | null,
    userId: string | null,
    type: string,
    amount: number,
    currency: string,
    debitAccount: string,
    creditAccount: string,
    reference: string,
    status: string,
    meta?: any
  ): Promise<void> {
    const entry = new LedgerEntry({
      escrow: escrowId,
      task: taskId,
      user: userId,
      type,
      amount,
      currency,
      debitAccount,
      creditAccount,
      reference,
      status,
      meta,
      createdBy: "system",
    });

    await entry.save();
  }

  /**
   * Get escrow details with full history
   */
  async getEscrowDetails(escrowId: string): Promise<any> {
    const escrow = await Escrow.findById(escrowId)
      .populate("task")
      .populate("client", "name email")
      .populate("runner", "name email");

    if (!escrow) {
      throw new Error(`Escrow not found: ${escrowId}`);
    }

    const ledgerEntries = await LedgerEntry.find({
      escrow: escrowId,
    }).sort({ createdAt: 1 });

    return {
      escrow,
      ledger: ledgerEntries,
    };
  }
}

export default new PayoutService();
