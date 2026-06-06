import express from "express";
import {
  AUTH_DIR,
  getSocket,
  setGroupJid,
  startWhatsApp,
  state,
} from "./connection.js";

const PORT = Number(process.env.WHATSAPP_BRIDGE_PORT ?? 8001);

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    connected: state.connected,
    phone: state.phone,
    groupJid: state.groupJid,
    pairingCode: state.pairingCode,
    hasQr: Boolean(state.lastQr),
    lastError: state.lastError,
  });
});

app.get("/groups", async (_req, res) => {
  const sock = getSocket();
  if (!sock || !state.connected) {
    res.status(503).json({ error: "WhatsApp not connected" });
    return;
  }
  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups).map((g) => ({
      id: g.id,
      subject: g.subject,
      participants: g.participants?.length ?? 0,
    }));
    list.sort((a, b) => a.subject.localeCompare(b.subject));
    res.json({ groups: list });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to list groups",
    });
  }
});

app.post("/configure", (req, res) => {
  const jid = (req.body?.groupJid as string | undefined)?.trim();
  if (!jid || !jid.endsWith("@g.us")) {
    res.status(400).json({ error: "groupJid required (format: 120363…@g.us)" });
    return;
  }
  setGroupJid(jid);
  console.log(`📌 Crew group set: ${jid}`);
  res.json({ groupJid: jid });
});

app.post("/send", async (req, res) => {
  const message = (req.body?.message as string | undefined)?.trim();
  const groupJid = (req.body?.groupJid as string | undefined)?.trim() || state.groupJid;

  if (!message) {
    res.status(400).json({ error: "message required" });
    return;
  }

  const sock = getSocket();
  if (!sock || !state.connected) {
    res.status(503).json({ error: "WhatsApp not connected — scan QR or enter pairing code" });
    return;
  }

  if (!groupJid) {
    res.status(400).json({
      error: "No group configured. GET /groups then POST /configure with groupJid",
    });
    return;
  }

  try {
    await sock.sendMessage(groupJid, { text: message });
    console.log(`💬 Sent to ${groupJid}: ${message.slice(0, 80)}…`);
    res.json({ sent: true, groupJid, channel: "WhatsApp" });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Send failed",
    });
  }
});

async function main() {
  console.log(`Altis WhatsApp bridge → auth: ${AUTH_DIR}`);
  console.log(`Phone: +${state.phone ?? "not set — add WHATSAPP_PHONE to .env"}`);
  if (state.groupJid) {
    console.log(`Default group: ${state.groupJid}`);
  }

  await startWhatsApp();

  app.listen(PORT, () => {
    console.log(`WhatsApp bridge API http://localhost:${PORT}`);
    console.log("  GET  /health");
    console.log("  GET  /groups");
    console.log("  POST /configure { groupJid }");
    console.log("  POST /send { message, groupJid? }");
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
