/**
 * Central secret access — refuses weak defaults in production.
 */
const WEAK_JWT = "default-secret-change-me";
const WEAK_OTP = "otp-secret-change-me";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function assertRequiredSecretsAtStartup(): void {
  if (!isProduction()) return;

  const jwt = String(process.env.JWT_SECRET || "").trim();
  const otp = String(process.env.OTP_SECRET || "").trim();
  const mongo = String(process.env.MONGO_URI || "").trim();

  const problems: string[] = [];
  if (!mongo) problems.push("MONGO_URI is missing");
  if (!jwt || jwt === WEAK_JWT || jwt.length < 32) {
    problems.push("JWT_SECRET must be set to a strong random value (min 32 chars, not the default)");
  }
  if (!otp || otp === WEAK_OTP || otp.length < 24) {
    problems.push("OTP_SECRET must be set to a strong random value (min 24 chars, not the default)");
  }

  if (problems.length) {
    throw new Error(`Refusing to start in production: ${problems.join("; ")}`);
  }
}

export function getJwtSecret(): string {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (isProduction()) {
    if (!secret || secret === WEAK_JWT) {
      throw new Error("JWT_SECRET is not configured");
    }
    return secret;
  }
  return secret || WEAK_JWT;
}

export function getOtpSecret(): string {
  const secret = String(process.env.OTP_SECRET || "").trim();
  if (isProduction()) {
    if (!secret || secret === WEAK_OTP) {
      throw new Error("OTP_SECRET is not configured");
    }
    return secret;
  }
  return secret || WEAK_OTP;
}
