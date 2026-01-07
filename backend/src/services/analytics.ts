// Analytics calculation service
import Task from "../data/models/Task";
import User from "../data/models/User";
import Transaction from "../data/models/Transaction";
import Review from "../data/models/Review";

export const calculatePlatformKPIs = async (startDate?: Date, endDate?: Date) => {
  const dateFilter: any = {};
  if (startDate) dateFilter.$gte = startDate;
  if (endDate) dateFilter.$lte = endDate;

  const [
    totalUsers,
    totalTasks,
    completedTasks,
    totalRevenue,
    activeRunners,
    avgRating,
  ] = await Promise.all([
    User.countDocuments(dateFilter.createdAt ? { createdAt: dateFilter } : {}),
    Task.countDocuments(dateFilter.createdAt ? { createdAt: dateFilter } : {}),
    Task.countDocuments({ status: "completed", ...(dateFilter.completedAt ? { completedAt: dateFilter } : {}) }),
    Transaction.aggregate([
      { $match: { type: "payment", ...(dateFilter.createdAt ? { createdAt: dateFilter } : {}) } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]).then((res) => res[0]?.total || 0),
    User.countDocuments({ role: "runner", active: true }),
    Review.aggregate([{ $group: { _id: null, avgRating: { $avg: "$rating" } } }]).then(
      (res) => res[0]?.avgRating || 0
    ),
  ]);

  return {
    totalUsers,
    totalTasks,
    completedTasks,
    totalRevenue,
    activeRunners,
    avgRating: parseFloat(avgRating.toFixed(2)),
    completionRate:
      totalTasks > 0 ? parseFloat(((completedTasks / totalTasks) * 100).toFixed(2)) : 0,
  };
};

export const getTaskTrends = async (days: number = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return Task.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};

export const getRunnerPerformance = async (runnerId: string) => {
  const [completedTasks, totalEarnings, avgRating, reviews] = await Promise.all([
    Task.countDocuments({ runner: runnerId, status: "completed" }),
    Transaction.aggregate([
      { $match: { user: runnerId, type: "payment" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]).then((res) => res[0]?.total || 0),
    Review.aggregate([
      { $match: { reviewee: runnerId } },
      { $group: { _id: null, avgRating: { $avg: "$rating" } } },
    ]).then((res) => res[0]?.avgRating || 0),
    Review.countDocuments({ reviewee: runnerId }),
  ]);

  return {
    completedTasks,
    totalEarnings,
    avgRating: parseFloat(avgRating.toFixed(2)),
    totalReviews: reviews,
  };
};

export const getRevenueTrends = async (days: number = 30) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return Transaction.aggregate([
    { $match: { type: "payment", createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        revenue: { $sum: "$amount" },
      },
    },
    { $sort: { _id: 1 } },
  ]);
};
