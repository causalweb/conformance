let source = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  source += chunk;
});
process.stdin.on("end", () => {
  const input = JSON.parse(source);
  const wrong = process.argv.includes("--wrong");
  if (input.profile === "prefix-evaluation-v1") {
    const response = input.case.kind
      ? { id: input.case.id, outcome: wrong ? "accept" : input.case.expected }
      : {
          id: input.case.id,
          outcomes: wrong ? [{ outcome: "failed" }] : input.case.expected,
          aggregate_success: wrong
            ? false
            : input.case.expected.every((outcome) => outcome.outcome === "satisfied"),
        };
    process.stdout.write(`${JSON.stringify(response)}\n`);
    return;
  }
  process.stdout.write(
    `${JSON.stringify({
      id: input.case.id,
      outcome: wrong ? "accept" : input.case.expected,
    })}\n`,
  );
});
