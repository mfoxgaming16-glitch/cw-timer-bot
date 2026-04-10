const express = require("express");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Colors,
} = require("discord.js");
const cron = require("node-cron");

const app = express();

// 🔥 IMPORTANT SETTINGS
const TOKEN = process.env.TOKEN;
const CHANNEL_ID = "1480284500494647538"; // <-- YOUR CHANNEL ID
const TIME_ZONE = "America/Toronto";
const PORT = process.env.PORT || 3000;
const ALERT_DELETE_MS = 60 * 1000;

// --------------------
// KEEP-ALIVE SERVER
// --------------------
app.get("/", (req, res) => {
  res.send("CW Timer bot is alive!");
});

app.listen(PORT, () => {
  console.log("Keep-alive server running");
});

// --------------------
// DISCORD CLIENT
// --------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let crimsonMessageId = null;
let dragonMessageId = null;

// --------------------
// TIME HELPERS
// --------------------
function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

function getEvent(hours, duration) {
  const now = new Date();
  let next = null;

  for (let d = 0; d < 2; d++) {
    for (let h of hours) {
      let start = new Date(now);
      start.setHours(h, 0, 0, 0);
      start.setDate(start.getDate() + d);

      let end = new Date(start.getTime() + duration * 3600000);

      if (now >= start && now < end) {
        return { active: true, start, end };
      }

      if (!next && start > now) {
        next = { active: false, start, end };
      }
    }
  }

  return next;
}

// --------------------
// EMBED BUILDER
// --------------------
function buildEmbed(title, emoji, status, schedule, duration, hype) {
  if (!status) {
    return new EmbedBuilder()
      .setTitle(title)
      .setColor(Colors.Red)
      .setDescription("Error loading event");
  }

  if (status.active) {
    return new EmbedBuilder()
      .setTitle(`${emoji} ${title} LIVE`)
      .setColor(Colors.Green)
      .setDescription(hype)
      .addFields(
        {
          name: "Ends",
          value: `<t:${toUnix(status.end)}:R>\n<t:${toUnix(status.end)}:F>`,
        },
        {
          name: "Schedule",
          value: schedule,
        },
        {
          name: "Duration",
          value: duration,
        },
      );
  }

  return new EmbedBuilder()
    .setTitle(`${emoji} ${title}`)
    .setColor(Colors.Blue)
    .addFields(
      {
        name: "Starts",
        value: `<t:${toUnix(status.start)}:R>\n<t:${toUnix(status.start)}:F>`,
      },
      {
        name: "Ends",
        value: `<t:${toUnix(status.end)}:F>`,
      },
      {
        name: "Schedule",
        value: schedule,
      },
      {
        name: "Duration",
        value: duration,
      },
    );
}

// --------------------
// SEND / EDIT MESSAGE
// --------------------
async function sendOrEdit(id, payload) {
  const channel = await client.channels.fetch(CHANNEL_ID);

  if (!id) {
    const msg = await channel.send(payload);
    return msg.id;
  }

  try {
    const msg = await channel.messages.fetch(id);
    await msg.edit(payload);
    return id;
  } catch {
    const msg = await channel.send(payload);
    return msg.id;
  }
}

// --------------------
// ALERT MESSAGE
// --------------------
async function alert(msg) {
  const channel = await client.channels.fetch(CHANNEL_ID);

  const sent = await channel.send({
    content: `@everyone ${msg}`,
    allowedMentions: { parse: ["everyone"] },
  });

  setTimeout(() => sent.delete().catch(() => {}), ALERT_DELETE_MS);
}

// --------------------
// CRIMSON MOON
// --------------------
const CRIMSON_HOURS = [1, 9, 17];

async function updateCrimson() {
  const e = getEvent(CRIMSON_HOURS, 1);

  const embed = buildEmbed(
    "Crimson Moon",
    "🌕",
    e,
    "1AM / 9AM / 5PM",
    "1 hour",
    "🔥 Get in now!",
  );

  crimsonMessageId = await sendOrEdit(crimsonMessageId, { embeds: [embed] });
}

async function startCrimson() {
  await updateCrimson();
  await alert("🌕 Crimson Moon is LIVE!");
}

// --------------------
// DRAGON / SPIDER
// --------------------
const DRAGON_HOURS = [4, 12, 20];

async function updateDragon() {
  const e = getEvent(DRAGON_HOURS, 2);

  const embed = buildEmbed(
    "Dragon / Spider",
    "🐉",
    e,
    "4AM / 12PM / 8PM",
    "2 hours",
    "🔥 Go now!",
  );

  dragonMessageId = await sendOrEdit(dragonMessageId, { embeds: [embed] });
}

async function startDragon() {
  await updateDragon();
  await alert("🐉 Dragon/Spider is OPEN!");
}

// --------------------
// READY
// --------------------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await updateCrimson();
  await updateDragon();

  // CRIMSON START
  cron.schedule("0 1 * * *", startCrimson, { timezone: TIME_ZONE });
  cron.schedule("0 9 * * *", startCrimson, { timezone: TIME_ZONE });
  cron.schedule("0 17 * * *", startCrimson, { timezone: TIME_ZONE });

  // CRIMSON END
  cron.schedule("0 2 * * *", updateCrimson, { timezone: TIME_ZONE });
  cron.schedule("0 10 * * *", updateCrimson, { timezone: TIME_ZONE });
  cron.schedule("0 18 * * *", updateCrimson, { timezone: TIME_ZONE });

  // DRAGON START
  cron.schedule("0 4 * * *", startDragon, { timezone: TIME_ZONE });
  cron.schedule("0 12 * * *", startDragon, { timezone: TIME_ZONE });
  cron.schedule("0 20 * * *", startDragon, { timezone: TIME_ZONE });

  // DRAGON END
  cron.schedule("0 6 * * *", updateDragon, { timezone: TIME_ZONE });
  cron.schedule("0 14 * * *", updateDragon, { timezone: TIME_ZONE });
  cron.schedule("0 22 * * *", updateDragon, { timezone: TIME_ZONE });
});

// --------------------
// COMMANDS
// --------------------
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const cmd = msg.content.toLowerCase();

  if (cmd === "!refresh") {
    await updateCrimson();
    await updateDragon();
    msg.reply("✅ Refreshed");
  }
});

client.login(TOKEN);
