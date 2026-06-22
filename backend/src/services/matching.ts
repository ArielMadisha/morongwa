// Runner-client matching based on location, rating, service area, and base-radius rules
import Task, { ITask } from "../data/models/Task";
import User from "../data/models/User";
import Review from "../data/models/Review";
import { calculateDistance } from "../utils/helpers";
import { logger } from "./monitoring";
import {
  isRunnerWithinTaskRadius,
  resolveMatchRadiusForTask,
  resolveRunnerAnchorCoordinates,
  resolveRunnerMatchRadiusKm,
  resolveTaskPickupCoordinates,
  runnerMatchesTaskCategory,
} from "./runnerMatchingRules";

interface MatchCriteria {
  maxDistance?: number;
  minRating?: number;
  limit?: number;
}

interface RunnerMatch {
  runnerId: string;
  name: string;
  distance: number;
  rating: number;
  completedTasks: number;
  score: number;
}

export { resolveRunnerMatchRadiusKm };

export const findMatchingRunners = async (
  taskId: string,
  criteria: MatchCriteria = {}
): Promise<RunnerMatch[]> => {
  try {
    const task = (await Task.findById(taskId)) as ITask | null;
    if (!task) throw new Error("Task not found");

    const pickup = resolveTaskPickupCoordinates(task);
    const radiusKm = criteria.maxDistance ?? resolveMatchRadiusForTask(task);
    const minRating = criteria.minRating || 3;
    const limit = criteria.limit || 10;
    const taskType = String(task.taskType || "general");

    const runners = await User.find({
      role: "runner",
      active: true,
      suspended: false,
      runnerVerified: true,
    });

    const matches: RunnerMatch[] = [];

    for (const runner of runners) {
      if (!runnerMatchesTaskCategory(runner, taskType)) continue;
      if (pickup && !isRunnerWithinTaskRadius(runner, pickup, radiusKm)) continue;

      const completedTasks = await Task.countDocuments({
        runner: runner._id,
        status: "completed",
      });

      const ratingData = await Review.aggregate([
        { $match: { reviewee: runner._id } },
        { $group: { _id: null, avgRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
      ]);
      const reviewCount = Number(ratingData[0]?.reviewCount ?? 0);
      const rating = ratingData[0]?.avgRating as number | undefined;
      if (reviewCount > 0 && (rating == null || Number.isNaN(rating) || rating < minRating)) continue;

      let distance = 0;
      if (pickup) {
        const anchor = resolveRunnerAnchorCoordinates(runner);
        if (anchor) distance = calculateDistance(pickup, anchor);
      }

      const ratingForScore = rating != null && !Number.isNaN(rating) ? rating : minRating;
      const distanceScore = pickup
        ? ((radiusKm - Math.min(distance, radiusKm)) / radiusKm) * 40
        : 20;
      const ratingScore = (ratingForScore / 5) * 40;
      const experienceScore = Math.min(completedTasks / 20, 1) * 20;

      matches.push({
        runnerId: runner._id.toString(),
        name: runner.name,
        distance: parseFloat(distance.toFixed(2)),
        rating: parseFloat((rating ?? 0).toFixed(2)),
        completedTasks,
        score: parseFloat((distanceScore + ratingScore + experienceScore).toFixed(2)),
      });
    }

    matches.sort((a, b) => b.score - a.score);
    logger.info("Matching runners found", { taskId, matchCount: matches.length, radiusKm });
    return matches.slice(0, limit);
  } catch (error) {
    logger.error("Runner matching failed:", error);
    throw error;
  }
};

export const suggestTasksForRunner = async (
  runnerId: string,
  criteria: MatchCriteria = {}
): Promise<ITask[]> => {
  try {
    const runner = await User.findById(runnerId);
    if (!runner) return [];

    const tasks = await Task.find({ status: "posted" })
      .populate("client", "name")
      .sort({ createdAt: -1 })
      .limit(criteria.limit || 40)
      .lean();

    const radiusKm = criteria.maxDistance ?? resolveRunnerMatchRadiusKm();
    const filtered = tasks.filter((task) => {
      if (!runnerMatchesTaskCategory(runner, String(task.taskType || ""))) return false;
      const pickup = resolveTaskPickupCoordinates(task as any);
      if (!pickup) return true;
      return isRunnerWithinTaskRadius(runner, pickup, radiusKm);
    });

    logger.info("Tasks suggested for runner", { runnerId, taskCount: filtered.length });
    return filtered.slice(0, criteria.limit || 20) as any;
  } catch (error) {
    logger.error("Task suggestion failed:", error);
    throw error;
  }
};
