import { Cli } from "incur";
import { expect, it } from "vitest";

import { registerJavaScriptDeobfuscationCommands } from "../../../src/cli/javascriptDeobfuscationCommands.js";
import { createEvidence } from "../../../src/domain/evidence.js";
import { AnalysisOutputError } from "../../../src/domain/analysisErrorCore.js";
import { ProviderCleanupError } from "../../../src/domain/providerCleanupError.js";
import { ok } from "../../../src/domain/result.js";
import { silentLogger } from "../../../src/logger.js";

it("retains completed deobfuscation Evidence when final close fails", async () => {
  const evidence = createEvidence(
    { path: "/tmp/input.js", sha256: "a".repeat(64), format: "javascript" },
    { id: "js-redox", name: "Fixture js-redox", version: "0.1.1" },
    {
      operation: "deobfuscate_javascript_source",
      parameters: {},
      result: { status: "unchanged" },
      confidence: "derived",
    },
  );
  const cli = Cli.create("javascript-deobfuscation-cleanup-test", {
    sync: false,
  });
  registerJavaScriptDeobfuscationCommands(
    cli,
    silentLogger,
    {},
    {
      deobfuscate: async () => ok(evidence),
      close: async () => {
        throw new ProviderCleanupError(
          "js-redox",
          ["js-redox artifact handles"],
          { reason: "cleanup retry failed" },
          { operation: "deobfuscate_javascript_source" },
        );
      },
    },
  );

  let stdout = "";
  await cli.serve(
    [
      "deobfuscate-javascript-source",
      "/tmp/input.js",
      "/tmp/output",
      "--format",
      "json",
    ],
    {
      stdout: (text) => {
        stdout += text;
      },
      exit: () => {},
    },
  );

  expect(JSON.parse(stdout)).toMatchObject({
    code: "cleanup_incomplete",
    details: {
      resources: ["js-redox artifact handles"],
      partial_observation: { evidence_id: evidence.evidence_id },
    },
  });
});

it("returns completed deobfuscation Evidence when final close resolves cleanup-only failure", async () => {
  const evidence = createEvidence(
    { path: "/tmp/input.js", sha256: "b".repeat(64), format: "javascript" },
    { id: "js-redox", name: "Fixture js-redox", version: "0.1.1" },
    {
      operation: "deobfuscate_javascript_source",
      parameters: {},
      result: { status: "unchanged" },
      confidence: "derived",
    },
  );
  const failure = new AnalysisOutputError(
    "deobfuscate_javascript_source",
    "verified artifact descriptor cleanup remains incomplete",
    {
      cleanup: {
        reason: "fixture retained verification descriptor",
        resources: ["fixture-verification-descriptor"],
      },
      partialObservation: evidence,
      cleanupOnly: true,
    },
  );
  const cli = Cli.create("javascript-deobfuscation-cleanup-resolved-test", {
    sync: false,
  });
  registerJavaScriptDeobfuscationCommands(
    cli,
    silentLogger,
    {},
    {
      deobfuscate: async () => ({ ok: false as const, error: failure }),
      close: async () => {
        failure.resolveCleanup();
      },
    },
  );

  let stdout = "";
  await cli.serve(
    [
      "deobfuscate-javascript-source",
      "/tmp/input.js",
      "/tmp/output",
      "--format",
      "json",
    ],
    {
      stdout: (text) => {
        stdout += text;
      },
      exit: () => {},
    },
  );

  expect(JSON.parse(stdout)).toMatchObject({
    evidence_id: evidence.evidence_id,
    operation: "deobfuscate_javascript_source",
    authority: "shipped-artifact",
    confidence: "derived",
  });
  expect(failure.cleanupIncomplete).toBe(false);
});
