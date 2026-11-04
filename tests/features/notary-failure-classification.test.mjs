// Notarization retry policy (2026-11-04): an upload aborted on part 22 of
// 285 MB with `Network.NWError error 60` and discarded a 40-minute Mac chain.
// A transient failure is worth another attempt; a verdict is not.
//
// The strings below are the real ones: the 2026-11-04 abort as notarytool
// printed it, and the verdict lines Apple returns for a bad signature.
import { createFeatureTest } from "../helpers/feature-test-harness.mjs";
import { classifyNotaryFailure } from "../../tooling/lib/notary-failure.mjs";

const test = createFeatureTest("notary-failure-classification");

// --- The failure that cost the chain ---------------------------------------
const uploadAbort = `Error: abortedUpload(resumeRequest: SotoS3.S3.ResumeMultipartUploadRequest(uploadRequest: SotoS3.S3.CreateMultipartUploadRequest(acl: nil, bucket: "notary-submissions-prod", key: "prod/AROARQRX7CZS3PRF6ZA5L:46bda90e"), uploadId: "BMIaJZhHMHgx", completedParts: [SotoS3.S3.CompletedPart(eTag: Optional("\\"f517394c8f20956a853faf75a18873e5\\""), partNumber: Optional(22))]), error: The operation couldn’t be completed. (Network.NWError error 60 - Operation timed out))`;
test.assert(classifyNotaryFailure(uploadAbort) === "transient", "the 2026-11-04 aborted upload is transient");

// --- Other shapes of "the network gave up", not "Apple said no" -------------
for (const [output, label] of [
  ["Error: Could not connect to the server.", "connection refused"],
  ["The request timed out.", "notarytool request timeout"],
  ["upload failed: stream error", "stream error"],
  ["Error Domain=NSURLErrorDomain Code=-1005", "connection dropped"],
]) {
  test.assert(classifyNotaryFailure(output) === "transient", `${label} is transient`);
}

// --- Verdicts fail closed, on the first answer ------------------------------
for (const [output, label] of [
  ["  status: Invalid\n  message: The signature of the binary is invalid.", "an Invalid verdict"],
  ["  status: Rejected", "a Rejected verdict"],
  ["The software is not signed with a valid Developer ID.", "an unsigned bundle"],
]) {
  test.assert(classifyNotaryFailure(output) === "verdict", `${label} is a verdict, never retried`);
}

// A log that carries both is a judgement: the verdict wins.
test.assert(
  classifyNotaryFailure("status: Invalid\nNetwork.NWError error 60") === "verdict",
  "a verdict outranks a network line in the same log"
);

// Unknown output is neither: the caller fails it without retrying, because a
// shape nobody classified is not evidence that another attempt would differ.
test.assert(classifyNotaryFailure("something nobody has seen") === "other", "unknown output is not retried");

test.finish();
