/**
 * Variant architecture (Task M): the production builder (buildCopyGenRequest)
 * has no variant parameter and never will. "control" is simply its
 * unmodified output. Any treatment variant is a pure post-processing
 * transform applied here, strictly inside tools/prompt-eval — experimental
 * branching never enters production request construction.
 */
import type { CopyGenChatRequest } from "../../artifacts/api-server/src/lib/copyGenRequestBuilder";

export type EvalVariantTransform = (
  request: CopyGenChatRequest,
) => CopyGenChatRequest;

export const CONTROL_VARIANT: EvalVariantTransform = (request) => request;

/**
 * Registered variants. Add treatment variants here as new pure transforms
 * over the control request — e.g. a shallow copy with one system-prompt
 * substring swapped, or one request parameter changed. Never add a branch
 * inside copyGenRequestBuilder.ts to produce a variant.
 */
export const VARIANTS: Record<string, EvalVariantTransform> = {
  control: CONTROL_VARIANT,
};
