import { createServer } from "node:http";

const source = [];
const target = [];
const destination = createServer((request, response) => {
  target.push(request.headers["causal-require"] ?? null);
  response.writeHead(200);
  response.end("unconfirmed redirect target");
});
await new Promise((resolveListen) => destination.listen(0, "127.0.0.1", resolveListen));
const targetAddress = destination.address();
if (!targetAddress || typeof targetAddress === "string") throw new Error("missing target port");

const origin = createServer((request, response) => {
  if (request.url === "/report") {
    const body = JSON.stringify({ source, target });
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    });
    response.end(body);
    return;
  }
  if (request.url !== "/redirect") {
    response.writeHead(404);
    response.end();
    return;
  }
  source.push(request.headers["causal-require"] ?? null);
  response.writeHead(302, { Location: `http://127.0.0.1:${targetAddress.port}/view` });
  response.end();
});
await new Promise((resolveListen) => origin.listen(0, "127.0.0.1", resolveListen));
const sourceAddress = origin.address();
if (!sourceAddress || typeof sourceAddress === "string") throw new Error("missing source port");
process.stdout.write(
  `${JSON.stringify({ format: "causal-web-conformance-redirect-fixture-v1", origin: `http://127.0.0.1:${sourceAddress.port}` })}\n`,
);
