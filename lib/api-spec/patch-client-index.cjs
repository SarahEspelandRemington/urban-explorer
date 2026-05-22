"use strict";
// Appended by: lib/api-spec/patch-client-index.cjs (run as postcodegen hook)
// Orval regenerates lib/api-client-react/src/index.ts but omits the hand-written
// mutator module (custom-fetch.ts). This script re-adds the export so that
// consumers of @workspace/api-client-react can reach setBaseUrl, setAuthTokenGetter,
// and related utilities through the package barrel.
const fs = require("fs");
const path = require("path");

const indexPath = path.resolve(
  __dirname,
  "../../lib/api-client-react/src/index.ts",
);
const content = fs.readFileSync(indexPath, "utf8");
if (!content.includes("./custom-fetch")) {
  fs.appendFileSync(indexPath, 'export * from "./custom-fetch";\n');
  console.log(
    "[patch-client-index] Added custom-fetch export to api-client-react/src/index.ts",
  );
}
