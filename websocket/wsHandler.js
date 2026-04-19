/**
 * WebSocket : chat temps réel (JWT, chat_message, join/leave conversation).
 * S'attache au serveur HTTP existant (pas de port dédié).
 */
import { WebSocketServer } from "ws";
import { jwtVerify } from "jose";
import { prisma } from "../lib/prisma.js";

/** @type {Map<string, Set<{ ws: import('ws').WebSocket, userId: string, clientId: string | null, conversationId: string | null }>>} */
const connections = new Map();

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required");
  return new TextEncoder().encode(secret);
}

async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      userId: payload.userId ?? payload.sub ?? payload.id,
      clientId: payload.clientId ?? null,
      role: payload.role ?? null,
    };
  } catch {
    return null;
  }
}

function broadcastToConversation(conversationId, payload, excludeWs = null) {
  for (const set of connections.values()) {
    for (const conn of set) {
      if (
        conn.conversationId === conversationId &&
        conn.ws !== excludeWs &&
        conn.ws.readyState === 1
      ) {
        conn.ws.send(JSON.stringify(payload));
      }
    }
  }
}

/**
 * @param {import('http').Server} server
 */
export function initWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", async (ws, req) => {
    const url = new URL(req.url ?? "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    if (!token) {
      ws.close(4000, "Missing token");
      return;
    }

    const auth = await verifyToken(token);
    if (!auth?.userId) {
      ws.close(4001, "Invalid token");
      return;
    }

    const userId = String(auth.userId);
    const isAdmin = String(auth.role ?? "").toUpperCase() === "ADMIN";

    // Toujours résoudre le clientId depuis la base de données, même si le JWT
    // en contient un, pour éviter qu'un token forgé revendique un clientId arbitraire.
    let clientId = null;
    if (!isAdmin) {
      const client = await prisma.client.findUnique({ where: { userId } });
      clientId = client?.id ?? null;
    }

    const conn = { ws, userId, clientId, conversationId: null };
    if (!connections.has(userId)) connections.set(userId, new Set());
    connections.get(userId).add(conn);

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "chat_message") {
          const { conversationId, content } = msg.payload ?? {};
          if (!conversationId || !content?.trim()) {
            ws.send(
              JSON.stringify({
                type: "error",
                payload: { message: "conversationId and content required" },
              })
            );
            return;
          }

          const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
          });
          if (!conv || (!isAdmin && conv.clientId !== clientId)) {
            ws.send(
              JSON.stringify({ type: "error", payload: { message: "Unauthorized" } })
            );
            return;
          }

          const created = await prisma.chatMessage.create({
            data: {
              conversationId,
              senderType: isAdmin ? "ADMIN" : "CLIENT",
              content: content.trim(),
            },
          });

          const payload = {
            type: "chat_message",
            payload: {
              id: created.id,
              conversationId: created.conversationId,
              senderType: created.senderType,
              content: created.content,
              createdAt: created.createdAt.toISOString(),
            },
          };
          broadcastToConversation(conversationId, payload);
        }

        if (msg.type === "join_conversation") {
          const { conversationId } = msg.payload ?? {};
          if (conversationId) {
            const conv = await prisma.conversation.findUnique({
              where: { id: conversationId },
            });
            if (conv && (isAdmin || conv.clientId === clientId)) {
              conn.conversationId = conversationId;
            }
          }
        }

        if (msg.type === "leave_conversation") {
          conn.conversationId = null;
        }
      } catch (e) {
        ws.send(
          JSON.stringify({
            type: "error",
            payload: { message: e?.message ?? "Invalid message" },
          })
        );
      }
    });

    ws.on("close", () => {
      const set = connections.get(userId);
      if (set) {
        set.delete(conn);
        if (set.size === 0) connections.delete(userId);
      }
    });
  });

  return wss;
}
