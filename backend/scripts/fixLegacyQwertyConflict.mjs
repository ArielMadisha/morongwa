import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.collection("users");

  const q = await users.findOne({ email: /^qwertymates@icloud\.com$/i });
  if (!q) throw new Error("qwertymates@icloud.com user not found");

  const qPass = await bcrypt.hash("XmN6u#nnwW", 10);
  await users.updateOne(
    { _id: q._id },
    {
      $set: {
        username: "qwertymateslegacy",
        passwordHash: qPass,
        active: true,
        locked: false,
        suspended: false,
        importedFromLegacy: true,
        updatedAt: new Date(),
      },
    }
  );

  const uPass = await bcrypt.hash("xmN6u#nnwW", 10);
  const existingU = await users.findOne({ username: /^uatnational$/i });
  if (existingU) {
    await users.updateOne(
      { _id: existingU._id },
      {
        $set: {
          username: "uatnational",
          email: "uatnational@legacy-user.com",
          passwordHash: uPass,
          active: true,
          locked: false,
          suspended: false,
          importedFromLegacy: true,
          updatedAt: new Date(),
        },
      }
    );
  } else {
    await users.insertOne({
      name: "Uatnational",
      username: "uatnational",
      email: "uatnational@legacy-user.com",
      passwordHash: uPass,
      role: ["client"],
      isVerified: true,
      active: true,
      suspended: false,
      locked: false,
      importedFromLegacy: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    });
  }

  await mongoose.disconnect();
  console.log("conflict_fixed");
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exit(1);
});

