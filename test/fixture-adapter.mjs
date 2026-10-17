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
  if (input.profile === "context-reduction-v1") {
    const retained_indices = wrong ? [] : input.case.evidence.map((_item, index) => index);
    process.stdout.write(`${JSON.stringify({ id: input.case.id, retained_indices })}\n`);
    return;
  }
  if (input.profile === "http-client-confirmation-v1") {
    const result = {
      client_accepts_constrained_success: wrong
        ? !input.case.client_accepts_constrained_success
        : input.case.client_accepts_constrained_success,
      ...(input.case.client_accepts_causal_confirmation === undefined
        ? {}
        : { client_accepts_causal_confirmation: input.case.client_accepts_causal_confirmation }),
    };
    process.stdout.write(`${JSON.stringify({ id: input.case.id, result })}\n`);
    return;
  }
  if (input.profile === "http-observer-v1") {
    const result = { ...input.case.expected };
    if (wrong) result.status = result.status === 200 ? 500 : 200;
    process.stdout.write(`${JSON.stringify({ id: input.case.id, result })}\n`);
    return;
  }
  process.stdout.write(
    `${JSON.stringify({
      id: input.case.id,
      outcome: wrong ? "accept" : input.case.expected,
    })}\n`,
  );
});
