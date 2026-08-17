// 一次性原型静态服务器：只用于本地设计评审。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const indexPath = fileURLToPath(new URL("./index.html", import.meta.url));
const page = await readFile(indexPath);

createServer((request, response) => {
  if (request.url === "/favicon.ico") {
    response.writeHead(204).end();
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(page);
}).listen(4173, "127.0.0.1", () => {
  console.log("原型已启动：http://127.0.0.1:4173/?variant=A");
});
