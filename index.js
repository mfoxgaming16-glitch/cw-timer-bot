const express = require("express");
const {
  Client,
  GatewayIntentBits,
  Partials,
} = require("discord.js");

// =========================
// BASIC SETUP
// =========================
console.log("========================================");
console.log("INDEX JS VERSION LOADED");
console.log("Node version:", process.version);
console.log("DISCORD_TOKEN exists:", !!process.env.DISCORD_TOKEN);
console.log("CHANNEL_ID exists:", !!process.env.CHANNEL_ID);
console.log("TZ:", process.env.TZ || "not set");
console.log("========================================");

// Set your timezone in Render environment if you want:
// TZ=America/Toronto
const TIMEZONE = process.env.TZ || "America/Toronto";

// Put your Discord channel ID in Render env as CHANNEL_ID
const CHANNEL_ID = process.env.CHANNEL_ID || "YOUR_CHANNEL_ID_HERE";

// =========================
// DISCORD CLIENT
// =========================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
});

// =========================
// EXPRESS WEB SERVER
// =========================
const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.status(200).send("Bot is alive");
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    botReady: client.isReady ? client.isReady() : false,
    user: client.user ? client.user.tag : null,
    time: new Date().toISOString(),
    timezone: TIMEZONE,
  });
});

app.listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});

// =========================
// GLOBAL ERROR LOGGING
// =========================
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("warning", (warning) => {
  console.warn("Node Warning:", warning);
});

client.on("error", (err) => {
  console.error("Discord Client Error:", err);
});

client.on("shardError", (err) => {
  console.error("Discord Shard Error:", err);
});

client.on("debug", (msg) => {
  // Uncomment this if you want very detailed Discord logs:
  // console.log("DEBUG:", msg);
});

// =========================
// EVENT SCHEDULES
// Edit these to your exact times
// Format: "HH:MM" in 24-hour local time for your TIMEZONE
// =========================

const EVENTS = [
  // Crimson Moon example
  {
    name: "Crimson Moon",
    times: [
      "00:00",
      "08:00",
      "16:00",
    ],
    message: "🌙 **Crimson Moon is starting now!** Get ready and jump in!",
  },

  // Spider example
  {
    name: "Spider",
    times: [
      "04:00",
      "12:00",
      "20:00",
    ],
    message: "🕷️ **Spider event is starting now!** Time to rally up!",
  },

  // Dragon example
  {
    name: "Dragon",
    times: [
      "04:00",
      "12:00",
      "20:00",
    ],
    message: "🐉 **Dragon event is starting now!** Get in position!",
  },
];

// =========================
// OPTIONAL REMINDER OFFSETS
// Sends reminder before event
// Example: 10 = 10 minutes before
// =========================
const REMINDER_MINUTES = [10, 5];

// =========================
// INTERNAL DUPLICATE PROTECTION
// =========================
const sentKeys = new Set();

// Clean old sent keys every hour so memory does not grow forever
setInterval(() => {
  const now = Date.now();
  for (const key of sentKeys) {
    const parts = key.split("|");
    const timestamp = Number(parts[parts.length - 1]);
    if (!Number.isNaN(timestamp) && now - timestamp > 6 * 60 * 60 * 1000) {
      sentKeys.delete(key);
    }
  }
}, 60 * 60 * 1000);

// =========================
// TIME HELPERS
// =========================
function getNowParts() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
    hhmm: `${map.hour}:${map.minute}`,
    ymd: `${map.year}-${map.month}-${map.day}`,
  };
}

function subtractMinutesFromHHMM(hhmm, minutesToSubtract) {
  const [hourStr, minuteStr] = hhmm.split(":");
  let total = Number(hourStr) * 60 + Number(minuteStr);
  total -= minutesToSubtract;

  while (total < 0) total += 24 * 60;

  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// =========================
// SEND MESSAGE SAFELY
// =========================
async function sendMessageSafely(content) {
  try {
    if (!client.isReady()) {
      console.log("Bot is not ready yet. Skipping send.");
      return;
    }

    if (!CHANNEL_ID || CHANNEL_ID === "YOUR_CHANNEL_ID_HERE") {
      console.log("CHANNEL_ID is missing or still placeholder.");
      return;
    }

    const channel = await client.channels.fetch(CHANNEL_ID);

    if (!channel) {
      console.log("Could not fetch channel.");
      return;
    }

    if (!channel.isTextBased()) {
      console.log("Channel is not text-based.");
      return;
    }

    await channel.send(content);
    console.log("Message sent:", content);
  } catch (err) {
    console.error("Failed to send message:", err);
  }
}

// =========================
// TIMER CHECKER
// =========================
async function checkEvents() {
  try {
    const now = getNowParts();

    for (const event of EVENTS) {
      for (const eventTime of event.times) {
        // Main event send
        if (now.hhmm === eventTime) {
          const key = `main|${event.name}|${now.ymd}|${eventTime}|${Date.now() - (Date.now() % 60000)}`;
          if (!sentKeys.has(key)) {
            sentKeys.add(key);
            console.log(`[MATCH] ${event.name} main event at ${eventTime} (${TIMEZONE})`);
            await sendMessageSafely(event.message);
          }
        }

        // Reminder sends
        for (const minsBefore of REMINDER_MINUTES) {
          const reminderTime = subtractMinutesFromHHMM(eventTime, minsBefore);

          if (now.hhmm === reminderTime) {
            const reminderKey = `reminder|${event.name}|${now.ymd}|${eventTime}|${minsBefore}|${Date.now() - (Date.now() % 60000)}`;
            if (!sentKeys.has(reminderKey)) {
              sentKeys.add(reminderKey);
              console.log(
                `[MATCH] ${event.name} reminder ${minsBefore} min before ${eventTime} (${TIMEZONE})`
              );
              await sendMessageSafely(
                `⏰ **${event.name} starts in ${minsBefore} minutes!**`
              );
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error in checkEvents():", err);
  }
}

// =========================
// READY EVENT
// =========================
client.once("ready", async () => {
  console.log("========================================");
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Bot user ID: ${client.user.id}`);
  console.log(`Using timezone: ${TIMEZONE}`);
  console.log("========================================");

  // Run once on startup
  await checkEvents();

  // Check every 15 seconds
  setInterval(checkEvents, 15 * 1000);
});

// =========================
// LOGIN
// =========================
console.log("REACHED DISCORD LOGIN LINE");

client.login(process.env.DISCORD_TOKEN)
  .then(() => {
    console.log("Discord login promise resolved");
  })
  .catch((err) => {
    console.error("Discord login failed:");
    console.error(err);
  });
