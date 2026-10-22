import { createHash } from "node:crypto";
import type { CopyGenChatRequest } from "../../artifacts/api-server/src/lib/copyGenRequestBuilder";

/** Short, stable hash of a request's messages, for result-record tagging. */
export function hashPrompt(messages: CopyGenChatRequest["messages"]): string {
  return createHash("sha256")
    .update(JSON.stringify(messages))
    .digest("hex")
    .slice(0, 16);
}
