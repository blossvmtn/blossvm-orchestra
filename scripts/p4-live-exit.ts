import { hermesLiaise, hermesStatus } from "../src/server/orchestra/hermes";
import { assertValidClipboardMarkdown } from "../src/server/orchestra/packets";

async function main() {
  const status = await hermesStatus();
  console.log("status", JSON.stringify(status, null, 2));

  const result = await hermesLiaise({
    useFixture: true,
    intent: "summarize_lanes",
  });
  console.log("deterministic", result.deterministic);
  console.log("model", result.model);
  console.log("warnings", result.warnings);
  const parsed = assertValidClipboardMarkdown(result.markdown);
  console.log("parsed kind", parsed.kind);
  console.log("markdown bytes", result.markdown.length);
  console.log("--- preview ---");
  console.log(result.markdown.slice(0, 600));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
