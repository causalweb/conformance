import { createServer } from "node:http";

const wrong = process.argv.includes("--wrong");
const requirements = ["fixture-one", "fixture-two"];
const server = createServer((request, response) => {
  if (request.url?.startsWith("/fixture/")) {
    const body = JSON.stringify({ requirements });
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    });
    response.end(body);
    return;
  }
  if (wrong) {
    response.writeHead(500, { "X-CausalWeb-Conformance-Read-Calls": "0", Connection: "close" });
    response.end();
    return;
  }
  if (request.url === "/ordinary") {
    response.writeHead(204, { "X-CausalWeb-Conformance-Read-Calls": "0", Connection: "close" });
    response.end();
    return;
  }
  const causalFields = request.rawHeaders.filter(
    (_, index) => index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === "causal-require",
  );
  if (causalFields.length !== 2) {
    response.writeHead(400, { "X-CausalWeb-Conformance-Read-Calls": "0", Connection: "close" });
    response.end();
    return;
  }
  const body = JSON.stringify({
    outcomes: [
      { index: 0, outcome: "unsatisfied", retryable: true },
      { index: 1, outcome: "unsatisfied", retryable: true },
    ],
  });
  response.writeHead(412, {
    "Causal-Result": "unsatisfied",
    "Cache-Control": "no-store",
    "Content-Type": "application/problem+json",
    "Content-Length": Buffer.byteLength(body),
    "X-CausalWeb-Conformance-Read-Calls": "1",
    Connection: "close",
  });
  response.end(body);
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server lacks an address");
  process.stdout.write(
    `${JSON.stringify({ format: "causal-web-conformance-transport-server-v1", origin: `http://127.0.0.1:${address.port}` })}\n`,
  );
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
