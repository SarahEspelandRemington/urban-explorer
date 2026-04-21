import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { rateLimit } from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

// Trust the Replit / reverse-proxy `X-Forwarded-For` header so that
// express-rate-limit can identify individual clients correctly. Without this,
// every request appears to come from the same loopback IP and the rate limiter
// treats the entire server as a single client.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests to AI endpoints, please try again later." },
});

function requireAuthenticated(req: Request, res: Response, next: NextFunction): void {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

const expensiveEndpoints = [
  "/api/explore/discover",
  "/api/explore/place-detail",
  "/api/explore/place-timeline",
  "/api/explore/walk-narration",
  "/api/explore/deep-narration",
  "/api/explore/suggest-locations",
  "/api/explore/geocode",
  "/api/explore/route",
  "/api/explore/places-along-route",
];

const REQUIRE_AUTH_ON_EXPLORE = true;

app.use("/api", generalLimiter);

for (const path of expensiveEndpoints) {
  if (REQUIRE_AUTH_ON_EXPLORE) {
    app.use(path, aiLimiter, requireAuthenticated);
  } else {
    app.use(path, aiLimiter);
  }
}

app.use("/api", router);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error" });
});

export default app;
