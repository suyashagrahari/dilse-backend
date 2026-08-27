import app from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { rebuildBannedContent } from "./services/bannedContent";

const startServer = async () => {
  await connectDB();

  // The hidden-share set lives in memory, so it is rebuilt on every boot.
  // Non-fatal: a failure here must not stop the server from starting.
  await rebuildBannedContent().catch((e) =>
    console.error("[boot] bannedContent rebuild failed", e)
  );

  app.listen(env.PORT, () => {
    console.log(`
  ╔══════════════════════════════════════════╗
  ║       Gifts API Server Running           ║
  ╠══════════════════════════════════════════╣
  ║  Port:    ${String(env.PORT).padEnd(29)}║
  ║  Mode:    ${env.NODE_ENV.padEnd(29)}║
  ║  MongoDB: Connected                      ║
  ╚══════════════════════════════════════════╝
    `);
  });
};

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
