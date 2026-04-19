const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

console.log("STARTING BOT...");

const token = (process.env.DISCORD_TOKEN || "").trim();
const PORT = process.env.PORT || 10000;

console.log("Token exists:", !!token);
console.log("Token length:", token.length);

// Tiny web server for Render
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is alive");
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// Discord bot
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

if (!token) {
  console.error("NO TOKEN FOUND");
  process.exit(1);
}
client.on("debug", (msg) => {
  if (
    msg.toLowerCase().includes("gateway") ||
    msg.toLowerCase().includes("session")
  ) {
    console.log("DEBUG:", msg);
  }
});

console.log("Attempting login...");

(async () => {
  try {
    await client.login(token);
    console.log("Login promise resolved");
  } catch (err) {
    console.error("LOGIN ERROR CAUGHT:");
    console.error(err);
  }
})();
