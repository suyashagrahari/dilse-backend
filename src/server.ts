import app from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { rebuildBannedContent } from "./services/bannedContent";
import { ensureSuperAdmin } from "./services/ensureSuperAdmin";
import { startImapPoller } from "./services/imapPoller.service";
import { startProspectQueue } from "./services/prospectQueue.service";
import { ensureGeoLoaded } from "./services/geo.service";

const startServer = async () => {
  await connectDB();
  // Load (downloading if needed) the IP→country database in the BACKGROUND:
  // boot must not wait on a third-party download. Until it lands, every visitor
  // resolves to INR — exactly the pre-international behaviour.
  void ensureGeoLoaded();

  // The hidden-share set lives in memory, so it is rebuilt on every boot.
  // Non-fatal: a failure here must not stop the server from starting.
  await ensureSuperAdmin();

  await rebuildBannedContent().catch((e) =>
    console.error("[boot] bannedContent rebuild failed", e)
  );

  // Watches the shared mailbox for creators' replies to draft follow-ups. A
  // no-op with no IMAP credentials, which is the default — see the service
  // header. Started AFTER connectDB because its first pass writes.
  startImapPoller();
  // Sends queued prospect outreach one email at a time, under the daily cap.
  startProspectQueue();

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
