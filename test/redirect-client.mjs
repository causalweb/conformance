let source = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  source += chunk;
});
process.stdin.on("end", async () => {
  try {
    const input = JSON.parse(source);
    const header = `"${input.requirement}"`;
    const response = await fetch(input.url, {
      headers: { "Causal-Require": header },
      redirect: "manual",
    });
    if (response.status !== 302) throw new Error("expected redirect");
    if (process.argv.includes("--forward"))
      await fetch(response.headers.get("location"), {
        headers: { "Causal-Require": header },
      });
    await response.body?.cancel();
    process.stdout.write(
      `${JSON.stringify({ id: input.case.id, result: { client_accepts_constrained_success: process.argv.includes("--accept") } })}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
});
