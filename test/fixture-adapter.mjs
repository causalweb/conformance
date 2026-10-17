let source = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  source += chunk;
});
process.stdin.on("end", () => {
  const input = JSON.parse(source);
  const wrong = process.argv.includes("--wrong");
  process.stdout.write(
    `${JSON.stringify({
      id: input.case.id,
      outcome: wrong ? "accept" : input.case.expected,
    })}\n`,
  );
});
