const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

console.log("STARTING BOT...");

const token = (process.env.DISCORD_TOKEN || "").trim();
const PORT = process.env.PORT || 10000;

console.log("Token exists:", !!token);
console.log("Token length:", token.length);

const app = express();

app.get("/", (req, res) => {
  res.send("Bot is alive");
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", () => {
  console.log(`SUCCESS LOGGED IN: ${client.user.tag}`);
});

client.on("error", (err) => {
  console.error("Client error:", err);
});

client.on("warn", (msg) => {
  console.warn("Client warn:", msg);
});

client.on("shardReady", (id) => {
  console.log(`Shard ${id} ready`);
});

client.on("shardDisconnect", (event, id) => {
  console.log(`Shard ${id} disconnected with code ${event.code}`);
});

client.on("shardError", (err, id) => {
  console.error(`Shard ${id} error:`, err);
});

client.on("shardReconnecting", (id) => {
  console.log(`Shard ${id} reconnecting`);
});

client.on("debug", (msg) => {
  const text = msg.toLowerCase();
  if (
    text.includes("gateway") ||
    text.includes("identify") ||
    text.includes("heartbeat") ||
    text.includes("session") ||
    text.includes("shard")
  ) {
    console.log("DEBUG:", msg);
  }
});

if (!token) {
  console.error("NO TOKEN FOUND");
  process.exit(1);
}

(async () => {
  try {
    console.log("Attempting login...");
    await client.login(token);
    console.log("Login promise resolved");
  } catch (err) {
    console.error("LOGIN ERROR CAUGHT:");
    console.error(err);
  }
})();
