import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { CURRENT_CACHE_VERSIONS } from "../lib/cacheVersions";

const router: IRouter = Router();

router.get("/healthz", (req, res) => {
  const verbose = req.query["verbose"] === "true";
  const data = HealthCheckResponse.parse(
    verbose
      ? {
          status: "ok",
          environment: process.env["NODE_ENV"] ?? "unknown",
          cacheVersions: CURRENT_CACHE_VERSIONS,
        }
      : { status: "ok" },
  );
  res.json(data);
});

export default router;
