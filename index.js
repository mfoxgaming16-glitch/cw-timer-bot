const express = require("express");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Colors
} = require("discord.js");
const cron = require("node-cron");

const app = express();

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = "1480284500494647538";
const TIME_ZONE = "America/Toronto";
const PORT = process.env.PORT || 3000;

// Keep alert messages around; set to 0 to never delete them.
const ALERT_DELETE_MS = 60 * 1000;

// --------------------
// KEEP ALIVE
// --------------------
app.get("/", (_req, res) => {
  res.send("CW Timer bot is alive!");
});

app.listen(PORT, () => {
  console.log(`Keep-alive server running on port ${PORT}`);
});

// --------------------
// DISCORD CLIENT
// --------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let crimsonMessageId = null;
let dragonMessageId = null;

// --------------------
// TIMEZONE HELPERS
// --------------------
function getZonedParts(date = new Date(), timeZone = TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = formatter.formatToParts(date);
  const out = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      out[part.type] = Number(part.value);
    }
  }

  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour,
    minute: out.minute,
    second: out.second
  };
}

function addDaysToYMD(year, month, day, daysToAdd) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + daysToAdd);

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate()
  };
}

function makeZonedDate(
  year,
  month,
  day,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone = TIME_ZONE
) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  let guess = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(guess));
    const current = {};

    for (const part of parts) {
      if (part.type !== "literal") {
        current[part.type] = Number(part.value);
      }
    }

    const renderedAsUTC = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second
    );

    const targetAsUTC = Date.UTC(year, month - 1, day, hour, minute, second);
    guess += targetAsUTC - renderedAsUTC;
  }

  return new Date(guess);
}

function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

function formatDuration(hours) {
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

// --------------------
// EVENT WINDOW LOGIC
// --------------------
function buildWindows(hours, durationHours) {
  const now = new Date();
  const torontoToday = getZonedParts(now, TIME_ZONE);
  const windows = [];

  for (let dayOffset = -1; dayOffset <= 2; dayOffset++) {
    const ymd = addDaysToYMD(
      torontoToday.year,
      torontoToday.month,
      torontoToday.day,
      dayOffset
    );

    for (const hour of hours) {
      const start = makeZonedDate(
        ymd.year,
        ymd.month,
        ymd.day,
        hour,
        0,
        0,
        TIME_ZONE
      );

      const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      windows.push({ start, end });
    }
  }

  windows.sort((a, b) => a.start - b.start);
  return windows;
}

function getEventStatus(hours, durationHours) {
  const now = new Date();
  const windows = buildWindows(hours, durationHours);

  for (const window of windows) {
    if (now >= window.start && now < window.end) {
      return {
        isActive: true,
        start: window.start,
        end: window.end
      };
    }
  }

  for (const window of windows) {
    if (window.start > now) {
      return {
        isActive: false,
        start: window.start,
        end: window.end
      };
    }
  }

  return null;
}

// --------------------
// EMBED HELPERS
// --------------------
function progressBar(start, end, length = 12) {
  const now = Date.now();
  const total = end.getTime() - start.getTime();
  const elapsed = Math.max(0, Math.min(now - start.getTime(), total));
  const filled = total > 0 ? Math.round((elapsed / total) * length) : 0;

  return "🟩".repeat(filled) + "⬜".repeat(length - filled);
}

function createEventEmbed({
  title,
  liveTitle,
  activeEmoji,
  inactiveEmoji,
  activeColor,
  inactiveColor,
  scheduleText,
  durationHours,
  status,
  hypeLine,
  openLabel,
  closeLabel
}) {
  if (!status) {
    return new EmbedBuilder()
      .setTitle(title)
      .setDescription("⚠️ Could not calculate the next event window.")
      .setColor(Colors.Red)
      .setFooter({ text: `Server timezone: ${TIME_ZONE}` })
      .setTimestamp();
  }

  if (status.isActive) {
    return new EmbedBuilder()
      .setTitle(`${activeEmoji} ${liveTitle}`)
      .setDescription(hypeLine)
      .setColor(activeColor)
      .addFields(
        {
          name: "Status",
          value: "🟢 **LIVE NOW**",
          inline: true
        },
        {
          name: closeLabel,
          value: `<t:${toUnix(status.end)}:R>\n<t:${toUnix(status.end)}:F>`,
          inline: true
        },
        {
          name: "Progress",
          value: progressBar(status.start, status.end),
          inline: false
        },
        {
          name: "Server Schedule (Toronto)",
          value: scheduleText,
          inline: false
        },
        {
          name: "Duration",
          value: formatDuration(durationHours),
          inline: true
        },
        {
          name: "Server Timezone",
          value: TIME_ZONE,
          inline: true
        }
      )
      .setFooter({ text: "Discord timestamps auto-convert for each viewer." })
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setTitle(`${inactiveEmoji} ${title}`)
    .setColor(inactiveColor)
    .addFields(
      {
        name: "Status",
        value: "🕒 **Upcoming**",
        inline: true
      },
      {
        name: openLabel,
        value: `<t:${toUnix(status.start)}:R>\n<t:${toUnix(status.start)}:F>`,
        inline: true
      },
      {
        name: closeLabel,
        value: `<t:${toUnix(status.end)}:F>`,
        inline: true
      },
      {
        name: "Server Schedule (Toronto)",
        value: scheduleText,
        inline: false
      },
      {
        name: "Duration",
        value: formatDuration(durationHours),
        inline: true
      },
      {
        name: "Server Timezone",
        value: TIME_ZONE,
        inline: true
      }
    )
    .setFooter({ text: "Discord timestamps auto-convert for each viewer." })
    .setTimestamp();
}

// --------------------
// MESSAGE HELPER
// --------------------
async function postOrUpdate(messageId, payload) {
  const channel = await client.channels.fetch(CHANNEL_ID);

  if (!channel) {
    throw new Error("Channel not found. Check CHANNEL_ID.");
  }

  if (!messageId) {
    const msg = await channel.send(payload);
    return msg.id;
  }

  try {
    const msg = await channel.messages.fetch(messageId);
    await msg.edit(payload);
    return messageId;
  } catch {
    const newMsg = await channel.send(payload);
    return newMsg.id;
  }
}

async function sendTemporaryAlert(content, embeds = []) {
  const channel = await client.channels.fetch(CHANNEL_ID);

  if (!channel) {
    throw new Error("Channel not found. Check CHANNEL_ID.");
  }

  const msg = await channel.send({
    content,
    embeds,
    allowedMentions: { parse: ["everyone"] }
  });

  if (ALERT_DELETE_MS > 0) {
    setTimeout(async () => {
      try {
        await msg.delete();
      } catch (err) {
        console.error("Failed to delete alert message:", err);
      }
    }, ALERT_DELETE_MS);
  }
}

// --------------------
// CRIMSON MOON
// --------------------
const CRIMSON_HOURS = [1, 9, 17];
const CRIMSON_DURATION_HOURS = 1;

function getCrimsonStatus() {
  return getEventStatus(CRIMSON_HOURS, CRIMSON_DURATION_HOURS);
}

function buildCrimsonPayload() {
  const status = getCrimsonStatus();

  const embed = createEventEmbed({
    title: "Crimson Moon",
    liveTitle: "Crimson Moon is LIVE!!",
    activeEmoji: "🌕",
    inactiveEmoji: "🌙",
    activeColor: Colors.Gold,
    inactiveColor: Colors.DarkGold,
    scheduleText: "🌑 1:00 AM\n🕘 9:00 AM\n🕔 5:00 PM",
    durationHours: CRIMSON_DURATION_HOURS,
    status,
    hypeLine: "🔥 The moon is shining — get in now!",
    openLabel: "Starts",
    closeLabel: "Ends"
  });

  return {
    content: "",
    embeds: [embed],
    allowedMentions: { parse: [] }
  };
}

async function updateCrimson() {
  crimsonMessageId = await postOrUpdate(crimsonMessageId, buildCrimsonPayload());
}

async function startCrimsonEvent() {
  await updateCrimson();
  await sendTemporaryAlert(
    "@everyone 🌕 **Crimson Moon is LIVE!!**",
    buildCrimsonPayload().embeds
  );
}

async function endCrimsonEvent() {
  await updateCrimson();
}

// --------------------
// DRAGON / SPIDER
// --------------------
const DRAGON_HOURS = [4, 12, 20];
const DRAGON_DURATION_HOURS = 2;

function getDragonStatus() {
  return getEventStatus(DRAGON_HOURS, DRAGON_DURATION_HOURS);
}

function buildDragonPayload() {
  const status = getDragonStatus();

  const embed = createEventEmbed({
    title: "Dragon/Spider",
    liveTitle: "Dragon/Spider is OPEN!!",
    activeEmoji: "🐉",
    inactiveEmoji: "🕷️",
    activeColor: Colors.Green,
    inactiveColor: Colors.DarkGreen,
    scheduleText: "🕓 4:00 AM\n🕛 12:00 PM\n🕗 8:00 PM",
    durationHours: DRAGON_DURATION_HOURS,
    status,
    hypeLine: "🔥 Head to Dragon/Spider now!",
    openLabel: "Opens",
    closeLabel: "Closes"
  });

  return {
    content: "",
    embeds: [embed],
    allowedMentions: { parse: [] }
  };
}

async function updateDragon() {
  dragonMessageId = await postOrUpdate(dragonMessageId, buildDragonPayload());
}

async function startDragonEvent() {
  await updateDragon();
  await sendTemporaryAlert(
    "@everyone 🐉🕷️ **Dragon/Spider is now OPEN!!**",
    buildDragonPayload().embeds
  );
}

async function endDragonEvent() {
  await updateDragon();
}

// --------------------
// NEXT EVENT HELPER
// --------------------
function getNextUpcomingEvent() {
  const crimson = getCrimsonStatus();
  const dragon = getDragonStatus();
  const candidates = [];

  if (crimson) {
    candidates.push({
      name: crimson.isActive ? "Crimson Moon 🌕" : "Crimson Moon 🌙",
      time: crimson.isActive ? crimson.end : crimson.start,
      label: crimson.isActive ? "ends" : "starts"
    });
  }

  if (dragon) {
    candidates.push({
      name: "Dragon/Spider 🐉🕷️",
      time: dragon.isActive ? dragon.end : dragon.start,
      label: dragon.isActive ? "ends" : "starts"
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.time - b.time);
  return candidates[0];
}

// --------------------
// STARTUP
// --------------------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  try {
    await updateCrimson();
    await updateDragon();
    console.log("Timers posted successfully.");
  } catch (err) {
    console.error("Initial posting failed:", err);
  }

  // Crimson Moon
  cron.schedule("0 1 * * *", async () => {
    try {
      await startCrimsonEvent();
    } catch (err) {
      console.error("Crimson 1 AM update failed:", err);
    }
  }, { timezone: TIME_ZONE });

  cron.schedule("0 9 * * *", async () => {
    try {
      await startCrimsonEvent();
    } catch (err) {
      console.error("Crimson 9 AM update failed:", err);
    }
  }, { timezone: TIME_ZONE });

  cron.schedule("0 17 * * *", async () => {
    try {
      await startCrimsonEvent();
    } catch (err) {
      console.error("Crimson 5 PM update failed:", err);
    }
  }, { timezone: TIME_ZONE });

  cron.schedule("0 2 * * *", async () => {
    try {
      await endCrimsonEvent();
    } catch (err) {
      console.error("Crimson 2 AM refresh failed:", err);
    }
  }, { timezone: TIME_ZONE });

  cron.schedule("0 10 * * *", async () => {
    try {
      await endCrimsonEvent();
    } catch (err) {
      console.error("Crimson 10 AM refresh failed:", err);
    }
  }, { timezone: TIME_ZONE });

  cron.schedule("0 18 * * *", async () => {
    try {
      await endCrimsonEvent();
    } catch (err) {
      console.error("Crimson 6 PM refresh failed:", err);
    }
  }, { timezone: TIME_ZONE });

  // Dragon / Spider
  cron.schedule("0 4 * * *", async () => {
    try {
      await startDragonEvent();
    } catch (err) {
      console.error("Dragon 4 AM update failed:", err);
    }
  }, { timezone: TIME_ZONE });

  cron.schedule("0 12 * * *", async () => {
    try {
      await startDragonEvent();
    } catch (err) {
      console.error("Dragon 12 PM update failed:", err);
    }
  }, { timezone: TIME_ZONE });

  cron.schedule("0 20 * * *", async () => {
    try {
      await startDragonEvent();
    } catch (err) {
      console.error("Dragon 8 PM update failed:", err);
    }
  }, { timezone: TIME_ZONE });

  cron.schedule("0 6 * * *", async () => {
    try {
      await endDragonEvent();
    } catch (err) {
      console.error("Dragon 6 AM refresh failed:", err);
    }
  }, { timezone: TIME_ZONE });

  cron.schedule("0 14 * * *", async () => {
    try {
      await endDragonEvent();
    } catch (err) {
      console.error("Dragon 2 PM refresh failed:", err);
    }
  }, { timezone: TIME_ZONE });

  cron.schedule("0 22 * * *", async () => {
    try {
      await endDragonEvent();
    } catch (err) {
      console.error("Dragon 10 PM refresh failed:", err);
    }
  }, { timezone: TIME_ZONE });
});

// --------------------
// COMMANDS
// --------------------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const cmd = message.content.toLowerCase().trim();

  if (cmd === "!pingall") {
    const crimsonEmbed = buildCrimsonPayload().embeds[0];
    const dragonEmbed = buildDragonPayload().embeds[0];

    await message.channel.send({
      content: "@everyone 🚨 **Event update!**",
      embeds: [crimsonEmbed, dragonEmbed],
      allowedMentions: { parse: ["everyone"] }
    });
    return;
  }

  if (cmd === "!refresh") {
    try {
      await updateCrimson();
      await updateDragon();
      await message.reply("✅ Timers refreshed.");
    } catch (err) {
      console.error("Manual refresh failed:", err);
      await message.reply("⚠️ Refresh failed.");
    }
    return;
  }

  if (cmd === "!next") {
    const nextEvent = getNextUpcomingEvent();

    if (!nextEvent) {
      await message.reply("⚠️ Could not determine the next event.");
      return;
    }

    const unix = toUnix(nextEvent.time);

    await message.reply(
      `⏳ **Next Event: ${nextEvent.name}**\n${nextEvent.label}: <t:${unix}:R> | <t:${unix}:F>\nServer timezone: ${TIME_ZONE}`
    );
  }
});

client.login(TOKEN);
