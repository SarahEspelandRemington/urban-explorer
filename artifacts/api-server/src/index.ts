import app from "./app";
import { logger } from "./lib/logger";
import { startPhotoCacheCleanup } from "./lib/cleanupPhotoCache";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startPhotoCacheCleanup();
});

function shutdown(signal: string) {
  logger.info({ signal }, "Graceful shutdown initiated");
  server.close(() => {
    logger.info("Server closed — exiting");
    process.exit(0);
  });
  // Force-exit after 4 s so Replit can rebind the port quickly.
  setTimeout(() => {
    logger.warn("Forced exit after shutdown timeout");
    process.exit(0);
  }, 4000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
