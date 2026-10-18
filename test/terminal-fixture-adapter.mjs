import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let source = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  source += chunk;
});
process.stdin.on("end", async () => {
  const input = JSON.parse(source);
  if (process.argv.includes("--slow-start") && input.step.id === "TF-SETUP-A")
    await new Promise((resolve) => setTimeout(resolve, 5500));
  if (
    input.profile !== "terminal-failure-draft-v1" ||
    !["a", "b", "a-v2"].includes(input.step.partition)
  )
    throw new Error("invalid terminal fixture input");
  if (
    input.step.partition === "a-v2" &&
    (input.step.contract !== "reference-orders/v2" || input.step.schema !== "orders/v2")
  )
    throw new Error("invalid terminal fixture contract");
  const path = join(input.workspace, `${input.step.partition}.json`);
  const { operation, position, id } = input.step;
  let state;
  let outcome;
  if (operation === "setup") {
    if (existsSync(path)) throw new Error("partition already exists");
    state = { frontier: 1, failed: false, audit_count: 0 };
    outcome = "ready";
  } else {
    if (!existsSync(path)) throw new Error("partition does not exist");
    state = JSON.parse(readFileSync(path, "utf8"));
    if (operation === "mark") {
      if (!state.failed) state.audit_count += 1;
      state.failed = true;
      outcome = "recorded";
    } else if (operation === "resolve") {
      if (state.failed) state.audit_count += 1;
      state.failed = false;
      outcome = "resolved";
    } else if (operation === "account") {
      state.frontier = 4;
      outcome = "applied";
    } else if (operation === "observe") {
      outcome =
        Number(position) <= state.frontier
          ? "satisfied"
          : state.failed && Number(position) >= 3
            ? "failed"
            : "unsatisfied";
    } else throw new Error("invalid terminal fixture operation");
  }
  writeFileSync(path, JSON.stringify(state));
  if (process.argv.includes("--wrong") && id === "TF-002-A") outcome = "unsatisfied";
  process.stdout.write(`${JSON.stringify({ id, outcome, audit_count: state.audit_count })}\n`);
});
