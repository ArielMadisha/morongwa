import mongoose from "mongoose";
import TvChannelProgram from "../data/models/TvChannelProgram";
import TvChannelState, { TV_CHANNEL_STATE_ID } from "../data/models/TvChannelState";

function durationMs(program: { durationSeconds: number }): number {
  return Math.max(1, program.durationSeconds) * 1000;
}

/** Programmes that participate in the rotating queue (excludes wall-clock fixed slots). */
async function orderedQueuePrograms(): Promise<Array<{ _id: mongoose.Types.ObjectId; durationSeconds: number }>> {
  return TvChannelProgram.find({ enabled: true, scheduleMode: { $ne: "fixed" } })
    .sort({ sortOrder: 1, createdAt: 1 })
    .select("_id durationSeconds")
    .lean();
}

function programWindowEndMs(p: {
  scheduledStart?: Date;
  scheduledEnd?: Date;
  durationSeconds: number;
}): number {
  const startMs = p.scheduledStart ? new Date(p.scheduledStart).getTime() : NaN;
  if (Number.isNaN(startMs)) return NaN;
  if (p.scheduledEnd) {
    const endMs = new Date(p.scheduledEnd).getTime();
    if (!Number.isNaN(endMs) && endMs > startMs) return endMs;
  }
  return startMs + durationMs(p);
}

type FixedSlotLean = {
  _id: mongoose.Types.ObjectId;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  durationSeconds: number;
  scheduleMode?: string;
};

/** Latest-starting fixed programme whose wall-clock window contains `now`. */
async function findFixedProgramAt(now: Date): Promise<FixedSlotLean | null> {
  const t = now.getTime();
  const candidates = await TvChannelProgram.find({
    enabled: true,
    scheduleMode: "fixed",
    scheduledStart: { $exists: true, $lte: now },
  })
    .sort({ scheduledStart: -1 })
    .select("_id scheduledStart scheduledEnd durationSeconds scheduleMode")
    .lean<FixedSlotLean[]>();

  for (const p of candidates) {
    const startMs = p.scheduledStart ? new Date(p.scheduledStart).getTime() : NaN;
    if (Number.isNaN(startMs) || t < startMs) continue;
    const endMs = programWindowEndMs(p);
    if (!Number.isNaN(endMs) && t < endMs) return p;
  }
  return null;
}

async function getState(): Promise<{
  _id: mongoose.Types.ObjectId;
  currentProgramId: mongoose.Types.ObjectId | null | undefined;
  isPaused: boolean;
  anchorWallTime: Date | null | undefined;
  anchorElapsedMs: number;
}> {
  let doc = await TvChannelState.findById(TV_CHANNEL_STATE_ID).lean();
  if (!doc) {
    await TvChannelState.create({
      _id: TV_CHANNEL_STATE_ID,
      currentProgramId: null,
      isPaused: true,
      anchorWallTime: null,
      anchorElapsedMs: 0,
    });
    doc = await TvChannelState.findById(TV_CHANNEL_STATE_ID).lean();
  }
  const row = doc as {
    _id: mongoose.Types.ObjectId;
    currentProgramId?: mongoose.Types.ObjectId | null;
    isPaused?: boolean;
    anchorWallTime?: Date | null;
    anchorElapsedMs?: number;
  };
  return {
    _id: row._id,
    currentProgramId: row.currentProgramId ?? null,
    isPaused: !!row.isPaused,
    anchorWallTime: row.anchorWallTime ?? null,
    anchorElapsedMs: Number(row.anchorElapsedMs) || 0,
  };
}

function effectiveElapsedMs(state: {
  isPaused: boolean;
  anchorWallTime: Date | null | undefined;
  anchorElapsedMs: number;
}): number {
  if (state.isPaused || !state.anchorWallTime) {
    return Math.max(0, Number(state.anchorElapsedMs) || 0);
  }
  const anchor = new Date(state.anchorWallTime).getTime();
  if (Number.isNaN(anchor)) return Math.max(0, Number(state.anchorElapsedMs) || 0);
  return Math.max(0, Number(state.anchorElapsedMs) || 0) + (Date.now() - anchor);
}

function fixedWallOffsetMs(program: { scheduledStart?: Date; durationSeconds: number }, nowMs: number): number {
  const startMs = program.scheduledStart ? new Date(program.scheduledStart).getTime() : 0;
  const max = durationMs(program);
  return Math.min(max - 1, Math.max(0, nowMs - startMs));
}

/** Apply fixed-slot preemption or expire finished fixed slots. */
async function applyFixedSchedulePreemptionOrExpiry(): Promise<void> {
  const nowMs = Date.now();
  const now = new Date(nowMs);
  const state = await getState();
  const fixed = await findFixedProgramAt(now);

  if (fixed && fixed.scheduledStart) {
    const offset = fixedWallOffsetMs(fixed, nowMs);
    const curId = state.currentProgramId ? String(state.currentProgramId) : "";
    if (!curId || curId !== String(fixed._id)) {
      await TvChannelState.updateOne(
        { _id: TV_CHANNEL_STATE_ID },
        {
          $set: {
            currentProgramId: fixed._id,
            isPaused: state.isPaused,
            anchorWallTime: state.isPaused ? null : new Date(),
            anchorElapsedMs: offset,
          },
        }
      );
    }
    return;
  }

  if (state.currentProgramId) {
    const cur = await TvChannelProgram.findById(state.currentProgramId).lean();
    if (cur && (cur as any).scheduleMode === "fixed" && cur.scheduledStart) {
      const endMs = programWindowEndMs(cur);
      if (!Number.isNaN(endMs) && nowMs >= endMs) {
        await advanceToNextInternal("auto");
      }
    }
  }
}

async function advanceToNextInternal(_reason: "skip" | "auto"): Promise<void> {
  const state = await getState();
  const queue = await orderedQueuePrograms();
  if (!queue.length) {
    await TvChannelState.updateOne(
      { _id: TV_CHANNEL_STATE_ID },
      { $set: { currentProgramId: null, isPaused: true, anchorWallTime: null, anchorElapsedMs: 0 } }
    );
    return;
  }
  const curId = state.currentProgramId ? String(state.currentProgramId) : null;
  let idx = curId ? queue.findIndex((p) => String(p._id) === curId) : -1;

  let next;
  if (idx >= 0) {
    next = queue[(idx + 1) % queue.length];
  } else {
    next = queue[0];
  }

  await TvChannelState.updateOne(
    { _id: TV_CHANNEL_STATE_ID },
    {
      $set: {
        currentProgramId: next._id,
        isPaused: false,
        anchorWallTime: new Date(),
        anchorElapsedMs: 0,
      },
    }
  );
}

export async function advanceToNext(reason: "skip" | "auto"): Promise<void> {
  await advanceToNextInternal(reason);
}

export async function ensurePlaybackCursor(): Promise<void> {
  await applyFixedSchedulePreemptionOrExpiry();

  const state = await getState();
  if (!state.currentProgramId) return;

  const program = await TvChannelProgram.findById(state.currentProgramId).select("durationSeconds enabled scheduleMode").lean();
  if (!program || !program.enabled) {
    await TvChannelState.updateOne(
      { _id: TV_CHANNEL_STATE_ID },
      { $set: { currentProgramId: null, isPaused: true, anchorWallTime: null, anchorElapsedMs: 0 } }
    );
    return;
  }

  if ((program as any).scheduleMode === "fixed") {
    return;
  }

  const maxMs = durationMs(program);
  let elapsed = effectiveElapsedMs(state);
  let guard = 0;
  while (elapsed >= maxMs && guard < 50) {
    guard += 1;
    await advanceToNextInternal("auto");
    const s2 = await getState();
    if (!s2.currentProgramId) return;
    const p2 = await TvChannelProgram.findById(s2.currentProgramId).select("durationSeconds scheduleMode").lean();
    if (!p2) return;
    if ((p2 as any).scheduleMode === "fixed") return;
    elapsed = effectiveElapsedMs(s2);
    if (elapsed < durationMs(p2)) break;
  }
}

export async function getChannelNowPayload(): Promise<{
  current: Record<string, unknown> | null;
  isPaused: boolean;
  positionMs: number;
  durationMs: number;
  next: Record<string, unknown> | null;
  queue: Record<string, unknown>[];
  serverTime: string;
  playoutSource?: "queue" | "fixed";
}> {
  await ensurePlaybackCursor();
  const state = await getState();
  const queueFull = await TvChannelProgram.find({ enabled: true })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  const queue = queueFull.map((p) => ({
    _id: p._id,
    title: p.title,
    genre: p.genre,
    sortOrder: p.sortOrder,
    durationSeconds: p.durationSeconds,
    scheduledStart: p.scheduledStart,
    scheduledEnd: p.scheduledEnd,
    scheduleMode: (p as any).scheduleMode || "queue",
    videoUrl: p.videoUrl,
  }));

  if (!state.currentProgramId) {
    const qOrder = await orderedQueuePrograms();
    const nextRow =
      qOrder[0] != null
        ? queue.find((x) => String(x._id) === String(qOrder[0]._id)) ?? null
        : null;
    return {
      current: null,
      isPaused: true,
      positionMs: 0,
      durationMs: 0,
      next: nextRow,
      queue,
      serverTime: new Date().toISOString(),
    };
  }

  const current = await TvChannelProgram.findById(state.currentProgramId).lean();
  if (!current || !current.enabled) {
    return {
      current: null,
      isPaused: true,
      positionMs: 0,
      durationMs: 0,
      next: queue[0] || null,
      queue,
      serverTime: new Date().toISOString(),
    };
  }

  const mode = (current as any).scheduleMode === "fixed" ? "fixed" : "queue";
  let positionMs = effectiveElapsedMs(state);
  if (mode === "fixed" && current.scheduledStart && !state.isPaused) {
    positionMs = fixedWallOffsetMs(current, Date.now());
  }
  positionMs = Math.min(positionMs, durationMs(current));

  const curId = String(current._id);
  const queueOnly = await TvChannelProgram.find({ enabled: true, scheduleMode: { $ne: "fixed" } })
    .sort({ sortOrder: 1, createdAt: 1 })
    .lean();
  const idx = queueOnly.findIndex((p) => String(p._id) === curId);
  let next: (typeof queue)[0] | null = null;
  if (queueOnly.length) {
    const nextIdx = idx >= 0 ? (idx + 1) % queueOnly.length : 0;
    const n = queueOnly[nextIdx];
    next =
      queue.find((x) => String(x._id) === String(n._id)) ||
      ({
        _id: n._id,
        title: n.title,
        genre: n.genre,
        sortOrder: n.sortOrder,
        durationSeconds: n.durationSeconds,
        scheduledStart: n.scheduledStart,
        scheduledEnd: n.scheduledEnd,
        scheduleMode: (n as any).scheduleMode || "queue",
        videoUrl: n.videoUrl,
      } as any);
  }

  return {
    current: {
      _id: current._id,
      title: current.title,
      description: current.description,
      videoUrl: current.videoUrl,
      posterUrl: current.posterUrl,
      genre: current.genre,
      durationSeconds: current.durationSeconds,
      scheduledStart: current.scheduledStart,
      scheduledEnd: current.scheduledEnd,
      scheduleMode: (current as any).scheduleMode || "queue",
    },
    isPaused: state.isPaused,
    positionMs,
    durationMs: durationMs(current),
    next,
    queue,
    serverTime: new Date().toISOString(),
    playoutSource: mode,
  };
}

export async function playChannel(): Promise<void> {
  const state = await getState();
  const queue = await orderedQueuePrograms();
  if (!queue.length) {
    await TvChannelState.updateOne(
      { _id: TV_CHANNEL_STATE_ID },
      { $set: { currentProgramId: null, isPaused: true, anchorWallTime: null, anchorElapsedMs: 0 } }
    );
    return;
  }
  let currentId = state.currentProgramId;
  const fixed = await findFixedProgramAt(new Date());
  if (fixed && fixed.scheduledStart) {
    currentId = fixed._id;
    const offset = fixedWallOffsetMs(fixed, Date.now());
    await TvChannelState.updateOne(
      { _id: TV_CHANNEL_STATE_ID },
      {
        $set: {
          currentProgramId: currentId,
          isPaused: false,
          anchorWallTime: new Date(),
          anchorElapsedMs: offset,
        },
      }
    );
    return;
  }

  if (!currentId || !(await TvChannelProgram.findById(currentId).select("_id enabled scheduleMode").lean())?.enabled) {
    currentId = queue[0]._id;
  }
  const elapsed = state.isPaused ? Math.max(0, state.anchorElapsedMs || 0) : effectiveElapsedMs(state);
  await TvChannelState.updateOne(
    { _id: TV_CHANNEL_STATE_ID },
    {
      $set: {
        currentProgramId: currentId,
        isPaused: false,
        anchorWallTime: new Date(),
        anchorElapsedMs: elapsed,
      },
    }
  );
}

export async function pauseChannel(): Promise<void> {
  const state = await getState();
  let elapsed = effectiveElapsedMs(state);
  const program = state.currentProgramId
    ? await TvChannelProgram.findById(state.currentProgramId).select("scheduleMode scheduledStart durationSeconds").lean()
    : null;
  if (program && (program as any).scheduleMode === "fixed" && program.scheduledStart && !state.isPaused) {
    elapsed = fixedWallOffsetMs(program, Date.now());
  }
  await TvChannelState.updateOne(
    { _id: TV_CHANNEL_STATE_ID },
    { $set: { isPaused: true, anchorWallTime: null, anchorElapsedMs: elapsed } }
  );
}

/** Jump within the current programme (milliseconds from start). */
export async function seekCurrent(positionMs: number): Promise<void> {
  const state = await getState();
  if (!state.currentProgramId) return;
  const program = await TvChannelProgram.findById(state.currentProgramId).select("durationSeconds").lean();
  if (!program) return;
  const max = durationMs(program);
  const clamped = Math.max(0, Math.min(max - 1, positionMs));
  await TvChannelState.updateOne(
    { _id: TV_CHANNEL_STATE_ID },
    { $set: { isPaused: false, anchorWallTime: new Date(), anchorElapsedMs: clamped } }
  );
}
