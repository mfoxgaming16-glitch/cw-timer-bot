const { Client, GatewayIntentBits } = require("discord.js");

const token = (process.env.DISCORD_TOKEN || "").trim();

console.log("Token exists:", !!token);
console.log("Token length:", token.length);
console.log("Preview:", token ? `${token.slice(0, 4)}...${token.slice(-4)}` : "missing");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("error", console.error);
client.on("warn", console.warn);

if (!token) {
  console.error("No token found");
  process.exit(1);
}

client.login(token).catch(err => {
  console.error("Login failed:", err);
});
