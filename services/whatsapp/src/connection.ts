import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import dotenv from "dotenv";
import pino from "pino";
import qrcode from "qrcode-terminal";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

export const AUTH_DIR = path.resolve(__dirname, "../../../data/whatsapp-auth");

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? "warn" });

export type ConnectionState = {
  connected: boolean;
  pairingCode: string | null;
  lastQr: string | null;
  phone: string | null;
  groupJid: string | null;
  lastError: string | null;
};

export const state: ConnectionState = {
  connected: false,
  pairingCode: null,
  lastQr: null,
  phone: process.env.WHATSAPP_PHONE?.replace(/\D/g, "") ?? null,
  groupJid: process.env.WHATSAPP_GROUP_JID ?? null,
  lastError: null,
};

let sock: WASocket | null = null;
let starting = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function getSocket(): WASocket | null {
  return sock;
}

export function setGroupJid(jid: string | null) {
  state.groupJid = jid;
}

function scheduleReconnect(delayMs: number) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void startWhatsApp();
  }, delayMs);
}

export async function startWhatsApp(): Promise<void> {
  if (starting) return;
  starting = true;

  const { state: authState, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  let pairingRequested = false;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const registered = sock?.authState.creds.registered ?? false;

    if (qr) {
      state.lastQr = qr;
      if (!state.phone || pairingRequested) {
        console.log("\n📱 Scan WhatsApp QR (Linked devices → Link a device):\n");
        qrcode.generate(qr, { small: true });
      }
    }

    if (
      !registered &&
      state.phone &&
      !pairingRequested &&
      (connection === "connecting" || qr)
    ) {
      pairingRequested = true;
      const phone = normalizePhone(state.phone);
      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const code = await sock!.requestPairingCode(phone);
        state.pairingCode = code;
        state.lastError = null;
        console.log(`\n📲 Pairing code for +${phone}: ${code}`);
        console.log("   WhatsApp → Linked devices → Link with phone number\n");
      } catch (err) {
        state.lastError = err instanceof Error ? err.message : "Pairing failed";
        console.error("Pairing code error:", state.lastError);
        if (qr) {
          console.log("Use QR code above instead.\n");
          qrcode.generate(qr, { small: true });
        }
      }
    }

    if (connection === "open") {
      state.connected = true;
      state.pairingCode = null;
      state.lastError = null;
      starting = false;
      console.log("✅ WhatsApp connected via Baileys");
    }

    if (connection === "close") {
      state.connected = false;
      starting = false;
      const status = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;

      if (status === DisconnectReason.loggedOut && registered) {
        state.lastError = "Logged out — delete data/whatsapp-auth and reconnect";
        console.error(state.lastError);
        return;
      }

      if (status === DisconnectReason.restartRequired) {
        console.log("↻ WhatsApp restart after pairing…");
        scheduleReconnect(0);
        return;
      }

      console.log("↻ WhatsApp reconnecting…");
      scheduleReconnect(3000);
    }
  });

  starting = false;
}
