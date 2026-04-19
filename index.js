console.log("INDEX JS VERSION LOADED");

require("dotenv").config();

const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("Bot is alive");
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

console.log("DISCORD_TOKEN exists:", !!process.env.DISCORD_TOKEN);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`🔥 Logged in as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.content === "!ping") {
    message.reply("pong 🏓");
  }
});

console.log("REACHED DISCORD LOGIN LINE");

client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log("✅ LOGIN SUCCESS CALLED");
  })
  .catch((err) => {
    console.error("❌ LOGIN ERROR:");
    console.error(err);
  });
