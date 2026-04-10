const express = require("express");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Colors,
} = require("discord.js");
const cron = require("node-cron");

const app = express();

const TOKEN = process.env.TOKEN;
const CHANNEL_ID = "1480284500494647538";
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
  console.log(`Keep-alive server running on port ${PORT}`);
});

// --------------------
// DISCORD BOT
// --------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// --------------------
// IN-MEMORY STATE
// --------------------
const state = {
  crimsonMessageId: null,
  dragonMessageId: null,
  crimsonLastRenderKey: null,
  dragonLastRenderKey: null,
  crimsonLastAlertKey: null,
  dragonLastAlertKey: null,
};

// --------------------
// EVENT CONFIG
// --------------------
const EVENTS = {
  crimson: {
    key: "crimson",
    title: "Crimson Moon",
    liveTitle: "Crimson Moon is LIVE!!",
    activeEmoji: "🌕",
    inactiveEmoji: "🌙",
    activeColor: Colors.Gold,
    inactiveColor: Colors.DarkGold,
    hours: [1, 9, 17],
    durationHours: 1,
    scheduleText: "🌑 1:00 AM\n🕘 9:00 AM\n🕔 5:00 PM",
    openLabel: "Starts",
    closeLabel: "Ends",
    liveLine: "🔥 The moon is shining — get in now!",
    alertText: "@everyone 🌕 **Crimson Moon is LIVE!!**",
  },
  dragon: {
    key: "dragon",
    title: "Dragon/Spider",
    liveTitle: "Dragon/Spider is OPEN!!",
    activeEmoji: "🐉",
    inactiveEmoji: "🕷️",
    activeColor: Colors.Green,
    inactiveColor: Colors.DarkGreen,
    hours: [4, 12, 20],
    durationHours: 2,
    scheduleText: "🕓 4:00 AM\n🕛 12:00 PM\n🕗 8:00 PM",
    openLabel: "Opens",
    closeLabel: "Closes",
    liveLine: "🔥 Head to Dragon/Spider now!",
    alertText: "@everyone 🐉🕷️ **Dragon/Spider is now OPEN!!**",
  },
};

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
    hourCycle: "h23",
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
    second: out.second,
  };
}

function addDaysToYMD(year, month, day, daysToAdd) {
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + daysToAdd);

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
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
    hourCycle: "h23",
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

function formatTorontoLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
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
        end: window.end,
      };
    }
  }

  for (const window of windows) {
    if (window.start > now) {
      return {
        isActive: false,
        start: window.start,
        end: window.end,
      };
    }
  }

  return null;
}

function getWindowKey(status) {
  if (!status) return null;
  return `${toUnix(status.start)}-${toUnix(status.end)}`;
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

function createEventEmbed(config, status) {
  if (!status) {
    return new EmbedBuilder()
      .setTitle(config.title)
      .setDescription("⚠️ Could not calculate the next event window.")
      .setColor(Colors.Red)
      .setFooter({ text: `Server timezone: ${TIME_ZONE}` })
      .setTimestamp();
  }

  if (status.isActive) {
    return new EmbedBuilder()
      .setTitle(`${config.activeEmoji} ${config.liveTitle}`)
      .setDescription(config.liveLine)
      .setColor(config.activeColor)
      .addFields(
        {
          name: "Status",
          value: "🟢 **LIVE NOW**",
          inline: true,
        },
        {
          name: config.closeLabel,
          value: `<t:${toUnix(status.end)}:R>\n<t:${toUnix(status.end)}:F>`,
          inline: true,
        },
        {
          name: "Progress",
          value: progressBar(status.start, status.end),
          inline: false,
        },
        {
          name: "Server Schedule (Toronto)",
          value: config.scheduleText,
          inline: false,
        },
        {
          name: "Duration",
          value: formatDuration(config.durationHours),
          inline: true,
        },
        {
          name: "Server Timezone",
          value: TIME_ZONE,
          inline: true,
        }
      )
      .setFooter({ text: "Discord timestamps auto-convert for each viewer." })
      .setTimestamp();
  }

  return new EmbedBuilder()
    .setTitle(`${config.inactiveEmoji} ${config.title}`)
    .setColor(config.inactiveColor)
    .addFields(
      {
        name: "Status",
        value: "🕒 **Upcoming**",
        inline: true,
      },
      {
        name: config.openLabel,
        value: `<t:${toUnix(status.start)}:R>\n<t:${toUnix(status.start)}:F>`,
        inline: true,
      },
      {
        name: config.closeLabel,
        value: `<t:${toUnix(status.end)}:F>`,
        inline: true,
      },
      {
        name: "Server Schedule (Toronto)",
        value: config.scheduleText,
        inline: false,
      },
      {
        name: "Duration",
        value: formatDuration(config.durationHours),
        inline: true,
      },
      {
        name: "Server Timezone",
        value: TIME_ZONE,
        inline: true,
      }
    )
    .setFooter({ text: "Discord timestamps auto-convert for each viewer." })
    .setTimestamp();
}

function buildEventPayload(config) {
  const status = getEventStatus(config.hours, config.durationHours);
  const embed = createEventEmbed(config, status);

  return {
    status,
    payload: {
      content: "",
      embeds: [embed],
      allowedMentions: { parse: [] },
    },
  };
}

function buildRenderKey(config, status) {
  if (!status) return `${config.key}:none`;

  return JSON.stringify({
    active: status.isActive,
    start: toUnix(status.start),
    end: toUnix(status.end),
  });
}

// --------------------
// DISCORD HELPERS
// --------------------
async function getChannel() {
  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!channel) {
    throw new Error("Channel not found. Check CHANNEL_ID.");
  }
  return channel;
}

async function postOrUpdate(messageId, payload) {
  const channel = await getChannel();

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

async function sendTemporaryAlert(content) {
  const channel = await getChannel();

  const msg = await channel.send({
    content,
    allowedMentions: { parse: ["everyone"] },
  });

  setTimeout(async () => {
    try {
      await msg.delete();
    } catch (err) {
      console.error("Failed to delete alert message:", err);
    }
  }, ALERT_DELETE_MS);
}

// --------------------
// SYNC LOGIC
// --------------------
async function syncCrimson(force = false) {
  const config = EVENTS.crimson;
  const { status, payload } = buildEventPayload(config);
  const renderKey = buildRenderKey(config, status);
  const windowKey = getWindowKey(status);

  if (force || state.crimsonLastRenderKey !== renderKey) {
    state.crimsonMessageId = await postOrUpdate(state.crimsonMessageId, payload);
    state.crimsonLastRenderKey = renderKey;
  }

  if (status && status.isActive && windowKey && state.crimsonLastAlertKey !== windowKey) {
    await sendTemporaryAlert(config.alertText);
    state.crimsonLastAlertKey = windowKey;
  }
}

async function syncDragon(force = false) {
  const config = EVENTS.dragon;
  const { status, payload } = buildEventPayload(config);
  const renderKey = buildRenderKey(config, status);
  const windowKey = getWindowKey(status);

  if (force || state.dragonLastRenderKey !== renderKey) {
    state.dragonMessageId = await postOrUpdate(state.dragonMessageId, payload);
    state.dragonLastRenderKey = renderKey;
  }

  if (status && status.isActive && windowKey && state.dragonLastAlertKey !== windowKey) {
    await sendTemporaryAlert(config.alertText);
    state.dragonLastAlertKey = windowKey;
  }
}

async function syncAll(force = false) {
  await syncCrimson(force);
  await syncDragon(force);
}

// --------------------
// NEXT EVENT HELPER
// --------------------
function getNextUpcomingEvent() {
  const crimson = getEventStatus(
    EVENTS.crimson.hours,
    EVENTS.crimson.durationHours
  );
  const dragon = getEventStatus(
    EVENTS.dragon.hours,
    EVENTS.dragon.durationHours
  );

  const candidates = [];

  if (crimson) {
    candidates.push({
      name: crimson.isActive ? "Crimson Moon 🌕" : "Crimson Moon 🌙",
      time: crimson.isActive ? crimson.end : crimson.start,
      label: crimson.isActive ? "ends" : "starts",
    });
  }

  if (dragon) {
    candidates.push({
      name: "Dragon/Spider 🐉🕷️",
      time: dragon.isActive ? dragon.end : dragon.start,
      label: dragon.isActive ? "ends" : "starts",
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
    await syncAll(true);
    console.log("Timers posted successfully.");
  } catch (err) {
    console.error("Initial sync failed:", err);
  }

  // Every minute:
  // - updates embeds only if event state changed
  // - sends catch-up alert if service woke up during a live window
  cron.schedule("* * * * *", async () => {
    try {
      await syncAll(false);
    } catch (err) {
      console.error("Minute sync failed:", err);
    }
  }, { timezone: TIME_ZONE });
});

// --------------------
// COMMANDS
// --------------------
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const cmd = message.content.toLowerCase().trim();

  if (cmd === "!refresh") {
    try {
      await syncAll(true);
      await message.reply("✅ Timers refreshed.");
    } catch (err) {
      console.error("Manual refresh failed:", err);
      await message.reply("⚠️ Refresh failed.");
    }
    return;
  }

  if (cmd === "!crimson") {
    const { payload } = buildEventPayload(EVENTS.crimson);
    await message.reply({ embeds: payload.embeds });
    return;
  }

  if (cmd === "!dragon") {
    const { payload } = buildEventPayload(EVENTS.dragon);
    await message.reply({ embeds: payload.embeds });
    return;
  }

  if (cmd === "!next") {
    const nextEvent = getNextUpcomingEvent();

    if (!nextEvent) {
      await message.reply("⚠️ Could not determine the next event.");
      return;
    }

    const unix = toUnix(nextEvent.time);

    const embed = new EmbedBuilder()
      .setTitle("⏳ Next Event")
      .setColor(Colors.Blurple)
      .addFields(
        { name: "Event", value: nextEvent.name, inline: true },
        { name: "Status", value: nextEvent.label, inline: true },
        { name: "Time", value: `<t:${unix}:R>\n<t:${unix}:F>`, inline: false },
        {
          name: "Server Time",
          value: `${formatTorontoLabel(nextEvent.time)} (${TIME_ZONE})`,
          inline: false,
        }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }
});

client.login(TOKEN);
