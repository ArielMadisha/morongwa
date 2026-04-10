import { Client } from "ssh2";
const [host, username, password, ...cmdParts] = process.argv.slice(2);
const command = cmdParts.join(" ");
if (!host || !username || !password || !command) process.exit(1);
const c = new Client();
c.on("ready", () => {
  c.exec(command, (err, s) => {
    if (err) process.exit(1);
    s.on("data", (d) => process.stdout.write(String(d)));
    s.stderr.on("data", (d) => process.stderr.write(String(d)));
    s.on("close", (code) => { c.end(); process.exit(code ?? 0); });
  });
}).on("error", () => process.exit(1)).connect({ host, username, password, port: 22 });
