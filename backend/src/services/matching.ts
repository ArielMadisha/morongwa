// Runner-client matching algorithm based on location, rating, and availability
import Task, { ITask } from "../data/models/Task";
import User from "../data/models/User";
import Review from "../data/models/Review";
import { calculateDistance } from "../utils/helpers";
import { logger } from "./monitoring";

interface MatchCriteria {
  maxDistance?: number; // in kilometers
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

export const findMatchingRunners = async (
  taskId: string,
  criteria: MatchCriteria = {}
): Promise<RunnerMatch[]> => {
  try {
    const task = await Task.findById(taskId) as ITask;
    if (!task) {
      throw new Error("Task not found");
    }

    const maxDistance = criteria.maxDistance || 50; // 50km default
    const minRating = criteria.minRating || 3;
    const limit = criteria.limit || 10;

    // Find active runners
    const runners = await User.find({ role: "runner", active: true, suspended: false });

    const matches: RunnerMatch[] = [];

    for (const runner of runners) {
      // Calculate completed tasks
      const completedTasks = await Task.countDocuments({
        runner: runner._id,
        status: "completed",
      });

      // Calculate average rating
      const ratingData = await Review.aggregate([
        { $match: { reviewee: runner._id } },
        { $group: { _id: null, avgRating: { $avg: "$rating" } } },
      ]);
      const rating = ratingData[0]?.avgRating || 0;

      if (rating < minRating) continue;

      // For MVP, we'll use a simple scoring algorithm
      // In production, you'd use actual runner locations
      const distance = Math.random() * maxDistance; // Placeholder - use real geolocation

      if (distance > maxDistance) continue;

      // Calculate match score (weighted algorithm)
      const distanceScore = ((maxDistance - distance) / maxDistance) * 40; // 40% weight
      const ratingScore = (rating / 5) * 40; // 40% weight
      const experienceScore = Math.min(completedTasks / 20, 1) * 20; // 20% weight

      const score = distanceScore + ratingScore + experienceScore;

      matches.push({
        runnerId: runner._id.toString(),
        name: runner.name,
        distance: parseFloat(distance.toFixed(2)),
        rating: parseFloat(rating.toFixed(2)),
        completedTasks,
        score: parseFloat(score.toFixed(2)),
      });
    }

    // Sort by score descending
    matches.sort((a, b) => b.score - a.score);

    logger.info("Matching runners found", { taskId, matchCount: matches.length });

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
    const maxDistance = criteria.maxDistance || 50;

    const tasks = await Task.find({ status: "posted" })
      .populate("client", "name")
      .sort({ createdAt: -1 })
      .limit(criteria.limit || 20)
      .lean();

    // For MVP, return all available tasks
    // In production, filter by runner's location and preferences
    logger.info("Tasks suggested for runner", { runnerId, taskCount: tasks.length });

    return tasks as any;
  } catch (error) {
    logger.error("Task suggestion failed:", error);
    throw error;
  }
};
