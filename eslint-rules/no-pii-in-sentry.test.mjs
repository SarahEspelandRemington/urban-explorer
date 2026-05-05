/**
 * Tests for the local/no-pii-in-sentry ESLint rule.
 * Run with: node eslint-rules/no-pii-in-sentry.test.mjs
 */

import { RuleTester } from "eslint";
import { noPiiInSentry } from "./no-pii-in-sentry.mjs";

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022 },
});

tester.run("no-pii-in-sentry", noPiiInSentry, {
  valid: [
    { code: 'captureMessage("walk started");' },
    { code: "captureMessage(`Error code ${404}`);" },
    { code: "captureMessage(`place visited ${place.placeId}`);" },
    { code: "captureMessage(`count is ${place.placeCount}`);" },
    { code: 'addWalkBreadcrumb("narration fetched");' },
    { code: "captureException(err);" },
    { code: 'captureException(new Error("static message"));' },
    { code: "captureMessage(`summary count ${n}`);" },
    { code: "captureException(err, { extra: { name: place.name } });" },
  ],
  invalid: [
    {
      code: "captureMessage(`Failed for ${place.name}`);",
      errors: [{ messageId: "piiInterpolation", data: { field: "name" } }],
    },
    {
      code: "addWalkBreadcrumb(`visited ${place.narration}`);",
      errors: [{ messageId: "piiInterpolation", data: { field: "narration" } }],
    },
    {
      code: "captureException(new Error(`Place ${place.name} not found`));",
      errors: [{ messageId: "piiInterpolation", data: { field: "name" } }],
    },
    {
      code: "captureMessage(`summary: ${place.summary}`);",
      errors: [{ messageId: "piiInterpolation", data: { field: "summary" } }],
    },
    {
      code: "captureMessage(`at ${loc.lat}, ${loc.lon}`);",
      errors: [
        { messageId: "piiInterpolation", data: { field: "lat" } },
        { messageId: "piiInterpolation", data: { field: "lon" } },
      ],
    },
    {
      code: "captureMessage(`for ${narration}`);",
      errors: [{ messageId: "piiInterpolation", data: { field: "narration" } }],
    },
  ],
});

console.log("no-pii-in-sentry: all tests passed.");
