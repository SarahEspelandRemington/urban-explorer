import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { CURRENT_CACHE_VERSIONS } from "../lib/cacheVersions";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({
    status: "ok",
    environment: process.env["NODE_ENV"] ?? "unknown",
    cacheVersions: CURRENT_CACHE_VERSIONS,
  });
  res.json(data);
});

export default router;
