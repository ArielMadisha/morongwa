// Winston logging and monitoring service
import winston from "winston";
import SystemMetric from "../data/models/SystemMetric";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

class MetricsCollector {
  private requests = 0;
  private errors = 0;
  private responseTimes: number[] = [];

  recordRequest(responseTime: number, isError: boolean = false): void {
    this.requests++;
    if (isError) this.errors++;
    this.responseTimes.push(responseTime);
  }

  async saveMetrics(): Promise<void> {
    if (this.requests === 0) return;

    const avgResponseTime =
      this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    const errorRate = (this.errors / this.requests) * 100;

    await SystemMetric.create({
      timestamp: new Date(),
      requests: this.requests,
      errorCount: this.errors,
      avgResponseTime,
      errorRate,
    });

    this.requests = 0;
    this.errors = 0;
    this.responseTimes = [];
  }
}

export const metricsCollector = new MetricsCollector();

// Save metrics every 5 minutes
setInterval(() => {
  metricsCollector.saveMetrics().catch((err) => {
    logger.error("Failed to save metrics:", err);
  });
}, 5 * 60 * 1000);
