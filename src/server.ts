import app from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";

const startServer = async () => {
  await connectDB();

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
