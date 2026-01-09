// FNB Integration Channel service for EFT payments, auth, and reconciliation
import axios, { AxiosInstance } from "axios";
import logger from "../utils/logger";

interface FNBTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface FNBEFTPayment {
  debtorAccount: {
    bank: string;
    accountNumber: string;
  };
  creditorAccount: {
    bank: string;
    accountNumber: string;
    name: string;
  };
  amount: {
    currency: string;
    value: number;
  };
  reference: string;
  narrative: string;
  timing: "RTC" | "EFT"; // Real-Time Clearing or standard EFT
}

interface FNBPaymentResponse {
  instructionId: string;
  state: "SUBMITTED" | "PROCESSING" | "SUCCESS" | "FAILED" | "REJECTED";
  createdAt: string;
  reference?: string;
}

interface FNBStatusResponse {
  instructionId: string;
  state: "SUBMITTED" | "PROCESSING" | "SUCCESS" | "FAILED" | "REJECTED";
  statusUpdatedAt?: string;
  failureReason?: string;
}

interface FNBTransaction {
  transactionId: string;
  date: string;
  amount: number;
  type: "DEBIT" | "CREDIT";
  description: string;
  reference?: string;
  balanceAfter: number;
}

interface FNBTransactionHistoryResponse {
  accountNumber: string;
  transactions: FNBTransaction[];
  balance: number;
  statementDate: string;
}

class FNBIntegrationService {
  private client: AxiosInstance;
  private baseURL: string;
  private clientId: string;
  private clientSecret: string;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private merchantAccount: string;

  constructor() {
    this.baseURL = process.env.FNB_BASE_URL || "https://api.fnb.co.za/integration-channel";
    this.clientId = process.env.FNB_CLIENT_ID || "";
    this.clientSecret = process.env.FNB_CLIENT_SECRET || "";
    this.merchantAccount = process.env.FNB_MERCHANT_ACCOUNT || "";

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
    });
  }

  /**
   * Get or refresh OAuth access token from FNB
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if still valid (with 60-second buffer)
    if (this.accessToken && this.tokenExpiresAt > now + 60000) {
      return this.accessToken;
    }

    try {
      const response = await axios.post<FNBTokenResponse>(
        `${this.baseURL}/oauth/token`,
        {
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: "client_credentials",
        },
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = now + (response.data.expires_in * 1000 - 60000); // 60-second buffer

      logger.info("FNB access token acquired", {
        expiresIn: response.data.expires_in,
      });

      return this.accessToken;
    } catch (error) {
      logger.error("FNB token acquisition failed", { error });
      throw new Error("Failed to get FNB access token");
    }
  }

  /**
   * Create EFT payment instruction (single payout to runner)
   */
  async createEFTPayment(
    runnerAccountNumber: string,
    runnerAccountName: string,
    amount: number,
    currency: string,
    reference: string,
    narrative: string,
    timing: "RTC" | "EFT" = "EFT"
  ): Promise<FNBPaymentResponse> {
    const token = await this.getAccessToken();

    const payload: FNBEFTPayment = {
      debtorAccount: {
        bank: "FNB",
        accountNumber: this.merchantAccount,
      },
      creditorAccount: {
        bank: "STANDARD", // FNB uses "STANDARD" for EFT to any South African bank
        accountNumber: runnerAccountNumber,
        name: runnerAccountName,
      },
      amount: {
        currency: currency,
        value: amount,
      },
      reference: reference,
      narrative: narrative,
      timing: timing,
    };

    try {
      const response = await this.client.post<FNBPaymentResponse>(
        "/eft/payments",
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      logger.info("FNB EFT payment created", {
        instructionId: response.data.instructionId,
        state: response.data.state,
        amount: amount,
        reference: reference,
      });

      return response.data;
    } catch (error: any) {
      logger.error("FNB EFT payment creation failed", {
        error: error.response?.data || error.message,
        reference: reference,
      });
      throw new Error(
        `FNB payment creation failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Poll payment status from FNB
   */
  async getPaymentStatus(
    instructionId: string
  ): Promise<FNBStatusResponse> {
    const token = await this.getAccessToken();

    try {
      const response = await this.client.get<FNBStatusResponse>(
        `/eft/payments/${instructionId}/status`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      logger.debug("FNB payment status retrieved", {
        instructionId: instructionId,
        state: response.data.state,
      });

      return response.data;
    } catch (error: any) {
      logger.error("FNB status check failed", {
        error: error.response?.data || error.message,
        instructionId: instructionId,
      });
      throw new Error(
        `FNB status check failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Fetch transaction history for reconciliation
   */
  async getTransactionHistory(
    fromDate: Date,
    toDate: Date
  ): Promise<FNBTransactionHistoryResponse> {
    const token = await this.getAccessToken();

    const from = this.formatDate(fromDate);
    const to = this.formatDate(toDate);

    try {
      const response = await this.client.get<FNBTransactionHistoryResponse>(
        `/accounts/${this.merchantAccount}/transactions`,
        {
          params: { from, to },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      logger.info("FNB transaction history fetched", {
        transactionCount: response.data.transactions.length,
        balance: response.data.balance,
        from: from,
        to: to,
      });

      return response.data;
    } catch (error: any) {
      logger.error("FNB transaction history fetch failed", {
        error: error.response?.data || error.message,
      });
      throw new Error(
        `FNB transaction fetch failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Get merchant account balance
   */
  async getAccountBalance(): Promise<number> {
    const token = await this.getAccessToken();

    try {
      const response = await this.client.get<{ balance: number }>(
        `/accounts/${this.merchantAccount}/balance`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      logger.debug("FNB account balance retrieved", {
        balance: response.data.balance,
      });

      return response.data.balance;
    } catch (error: any) {
      logger.error("FNB balance check failed", {
        error: error.response?.data || error.message,
      });
      throw new Error(
        `FNB balance check failed: ${
          error.response?.data?.message || error.message
        }`
      );
    }
  }

  /**
   * Helper: format date to YYYY-MM-DD for FNB API
   */
  private formatDate(date: Date): string {
    return date.toISOString().split("T")[0];
  }
}

export default new FNBIntegrationService();
