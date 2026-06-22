import type { IUser } from "../data/models/User";

export type RunnerCategory = "courier" | "store_parcel";

export function getRunnerCategory(user: Pick<IUser, "runnerCategory">): RunnerCategory {
  return user.runnerCategory === "store_parcel" ? "store_parcel" : "courier";
}

export function isCourierRunnerReady(user: IUser): boolean {
  const pdpVerified = !!(user.pdp && (user.pdp as { verified?: boolean }).verified);
  const vehicles = user.vehicles || [];
  const allVehiclesVerified = vehicles.length > 0 && vehicles.every((v) => v.verified === true);
  return pdpVerified && allVehiclesVerified;
}

export function isStoreParcelRunnerReady(user: IUser): boolean {
  const idVerified = !!(user.runnerIdDocument && user.runnerIdDocument.verified);
  const residenceVerified = !!(user.runnerProofOfResidence && user.runnerProofOfResidence.verified);
  return idVerified && residenceVerified;
}

/** Returns true when runnerVerified was changed. */
export function syncRunnerVerifiedFlag(user: IUser): boolean {
  const ready =
    getRunnerCategory(user) === "store_parcel"
      ? isStoreParcelRunnerReady(user)
      : isCourierRunnerReady(user);

  if (user.runnerVerified !== ready) {
    user.runnerVerified = ready;
    return true;
  }
  return false;
}
