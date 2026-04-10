import { Client } from "ssh2";
const [host, username, password, localPath, remotePath] = process.argv.slice(2);
if (!host || !username || !password || !localPath || !remotePath) process.exit(1);
const conn = new Client();
conn.on("ready", () => {
  conn.sftp((err, sftp) => {
    if (err) process.exit(1);
    sftp.fastPut(localPath, remotePath, (e) => {
      if (e) process.exit(1);
      console.log("uploaded");
      conn.end();
    });
  });
}).on("error", () => process.exit(1)).connect({ host, username, password, port: 22 });
