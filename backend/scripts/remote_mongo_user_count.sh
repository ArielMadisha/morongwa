docker exec morongwa-api-test node - <<'NODE'
const mongoose = require('mongoose');
const mod = require('/app/dist/src/data/models/User');
const User = mod.default || mod;
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/morongwa';
console.log('uri=' + uri);

async function run() {
  await mongoose.connect(uri);
  const c = await User.countDocuments({});
  console.log('mongo_users=' + c);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
NODE
