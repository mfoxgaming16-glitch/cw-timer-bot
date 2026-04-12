require("dotenv").config();

console.log("DISCORD_TOKEN exists:", !!process.env.DISCORD_TOKEN);
console.log("CHANNEL_ID exists:", !!process.env.CHANNEL_ID);

if (!process.env.DISCORD_TOKEN) {
  throw new Error("Missing DISCORD_TOKEN in environment variables");
}

if (!process.env.CHANNEL_ID) {
  throw new Error("Missing CHANNEL_ID in environment variables");
}

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
} = require("discord.js");
const { DateTime } = require("luxon");
const fs = require("fs");
const path = require("path");
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is alive");
});

app.listen(3000, () => {
  console.log("Web server running on port 3000");
});

const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const TIMEZONE = "America/Toronto";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Clan War settings
const CLAN_WAR_START_ANCHOR = DateTime.fromISO("2026-04-18T20:00:00", {
  zone: TIMEZONE,
});
const CLAN_WAR_DURATION_DAYS = 7;
const CLAN_WAR_CYCLE_DAYS = 14;

// Bot check interval
const CHECK_INTERVAL_MS = 30 * 1000;

// File to store sent reminders so restarts do not resend them
const SENT_FILE = path.join(__dirname, "sent-reminders.json");

// Event schedules in Toronto time
const EVENT_SCHEDULES = {
  "Crimson Moon": {
    icon: "🌙",
    hours: [1, 9, 17],
    durationHours: 1,
  },
  Spider: {
    icon: "🕷️",
    hours: [4, 12, 20],
    durationHours: 2,
  },
  Dragon: {
    icon: "🐉",
    hours: [4, 12, 20],
    durationHours: 2,
  },
};

function loadSentReminders() {
  try {
    if (!fs.existsSync(SENT_FILE)) return {};
    return JSON.parse(fs.readFileSync(SENT_FILE, "utf8"));
  } catch (error) {
    console.error("Failed to load sent reminders:", error);
    return {};
  }
}

let sentReminders = loadSentReminders();

function saveSentReminders() {
  try {
    fs.writeFileSync(SENT_FILE, JSON.stringify(sentReminders, null, 2));
  } catch (error) {
    console.error("Failed to save sent reminders:", error);
  }
}

function alreadySent(key) {
  return Boolean(sentReminders[key]);
}

function markSent(key) {
  sentReminders[key] = new Date().toISOString();
  saveSentReminders();
}

function cleanupOldReminderKeys() {
  const now = Date.now();
  const maxAgeMs = 60 * 24 * 60 * 60 * 1000; // 60 days
  let changed = false;

  for (const [key, timestamp] of Object.entries(sentReminders)) {
    const parsed = new Date(timestamp).getTime();
    if (!Number.isFinite(parsed) || now - parsed > maxAgeMs) {
      delete sentReminders[key];
      changed = true;
    }
  }

  if (changed) {
    saveSentReminders();
  }
}

function discordTimestamp(dt) {
  return `<t:${Math.floor(dt.toSeconds())}:F>`;
}

function discordRelative(dt) {
  return `<t:${Math.floor(dt.toSeconds())}:R>`;
}

function isWithinTriggerWindow(now, target, windowSeconds = 45) {
  const diffSeconds = Math.abs(now.diff(target, "seconds").seconds);
  return diffSeconds <= windowSeconds;
}

function getCurrentOrNextClanWarWindow(now) {
  if (now < CLAN_WAR_START_ANCHOR) {
    return {
      start: CLAN_WAR_START_ANCHOR,
      end: CLAN_WAR_START_ANCHOR.plus({ days: CLAN_WAR_DURATION_DAYS }),
    };
  }

  const diffDays = now.diff(CLAN_WAR_START_ANCHOR, "days").days;
  const cycleIndex = Math.floor(diffDays / CLAN_WAR_CYCLE_DAYS);

  let start = CLAN_WAR_START_ANCHOR.plus({
    days: cycleIndex * CLAN_WAR_CYCLE_DAYS,
  });
  let end = start.plus({ days: CLAN_WAR_DURATION_DAYS });

  if (now >= end) {
    start = start.plus({ days: CLAN_WAR_CYCLE_DAYS });
    end = start.plus({ days: CLAN_WAR_DURATION_DAYS });
  }

  return { start, end };
}

function getActiveClanWarWindow(now) {
  const { start, end } = getCurrentOrNextClanWarWindow(now);

  if (now >= start && now < end) {
    return { active: true, start, end };
  }

  return { active: false, start, end };
}

function getEventsForWindow(windowStart, windowEnd, eventName, config) {
  const events = [];
  let cursor = windowStart.startOf("day");

  while (cursor < windowEnd) {
    for (const hour of config.hours) {
      const start = cursor.set({
        hour,
        minute: 0,
        second: 0,
        millisecond: 0,
      });
      const end = start.plus({ hours: config.durationHours });

      if (start >= windowStart && start < windowEnd) {
        events.push({
          key: `${eventName.toLowerCase().replace(/\s+/g, "-")}-${start.toISO()}`,
          name: eventName,
          icon: config.icon,
          start,
          end,
        });
      }
    }

    cursor = cursor.plus({ days: 1 });
  }

  return events;
}

function getAllEventsForWindow(windowStart, windowEnd) {
  const allEvents = [];

  for (const [eventName, config] of Object.entries(EVENT_SCHEDULES)) {
    allEvents.push(...getEventsForWindow(windowStart, windowEnd, eventName, config));
  }

  return allEvents.sort((a, b) => a.start.toMillis() - b.start.toMillis());
}

function buildClanWarStartEmbed(start, end) {
  return new EmbedBuilder()
    .setTitle("⚔️ Clan War Started")
    .setDescription("Clan War is now active for this week.")
    .addFields(
      {
        name: "Starts",
        value: `${discordTimestamp(start)}\n${discordRelative(start)}`,
        inline: false,
      },
      {
        name: "Ends",
        value: `${discordTimestamp(end)}\n${discordRelative(end)}`,
        inline: false,
      },
      {
        name: "Server Timezone",
        value: TIMEZONE,
        inline: false,
      }
    )
    .setTimestamp();
}

function buildClanWarEndingSoonEmbed(end) {
  return new EmbedBuilder()
    .setTitle("⏳ Clan War Ending Soon")
    .setDescription("Clan War ends in 1 hour.")
    .addFields(
      {
        name: "Ends",
        value: `${discordTimestamp(end)}\n${discordRelative(end)}`,
        inline: false,
      },
      {
        name: "Server Timezone",
        value: TIMEZONE,
        inline: false,
      }
    )
    .setTimestamp();
}

function buildClanWarEndedEmbed(end, nextStart) {
  return new EmbedBuilder()
    .setTitle("🏁 Clan War Ended")
    .setDescription("Clan War has ended for this cycle.")
    .addFields(
      {
        name: "Ended",
        value: `${discordTimestamp(end)}`,
        inline: false,
      },
      {
        name: "Next Clan War Starts",
        value: `${discordTimestamp(nextStart)}\n${discordRelative(nextStart)}`,
        inline: false,
      },
      {
        name: "Server Timezone",
        value: TIMEZONE,
        inline: false,
      }
    )
    .setTimestamp();
}

function buildEventReminderEmbed(event, minutesBefore) {
  return new EmbedBuilder()
    .setTitle(`${event.icon} ${event.name}`)
    .setDescription(`${event.name} starts in ${minutesBefore} minutes.`)
    .addFields(
      {
        name: "Starts",
        value: `${discordTimestamp(event.start)}\n${discordRelative(event.start)}`,
        inline: false,
      },
      {
        name: "Ends",
        value: `${discordTimestamp(event.end)}`,
        inline: false,
      },
      {
        name: "Duration",
        value: `${Math.round(event.end.diff(event.start, "hours").hours)} hour(s)`,
        inline: false,
      },
      {
        name: "Server Timezone",
        value: TIMEZONE,
        inline: false,
      }
    )
    .setTimestamp();
}

function buildEventStartedEmbed(event) {
  return new EmbedBuilder()
    .setTitle(`${event.icon} ${event.name} Started`)
    .setDescription(`${event.name} is live now.`)
    .addFields(
      {
        name: "Started",
        value: `${discordTimestamp(event.start)}\n${discordRelative(event.start)}`,
        inline: false,
      },
      {
        name: "Ends",
        value: `${discordTimestamp(event.end)}`,
        inline: false,
      },
      {
        name: "Duration",
        value: `${Math.round(event.end.diff(event.start, "hours").hours)} hour(s)`,
        inline: false,
      },
      {
        name: "Server Timezone",
        value: TIMEZONE,
        inline: false,
      }
    )
    .setTimestamp();
}

function buildStatusEmbed(now, clanWar, upcomingEvents) {
  const embed = new EmbedBuilder()
    .setTitle("📋 Clan War Timer Status")
    .addFields(
      {
        name: "Current Time",
        value: `${discordTimestamp(now)}\n${discordRelative(now)}`,
        inline: false,
      },
      {
        name: "Clan War Status",
        value: clanWar.active ? "🟢 Active" : "🔴 Inactive",
        inline: false,
      },
      {
        name: "Current / Next Clan War Start",
        value: `${discordTimestamp(clanWar.start)}\n${discordRelative(clanWar.start)}`,
        inline: false,
      },
      {
        name: "Current / Next Clan War End",
        value: `${discordTimestamp(clanWar.end)}\n${discordRelative(clanWar.end)}`,
        inline: false,
      },
      {
        name: "Server Timezone",
        value: TIMEZONE,
        inline: false,
      }
    )
    .setTimestamp();

  if (upcomingEvents.length > 0) {
    embed.addFields({
      name: "Upcoming Events",
      value: upcomingEvents
        .slice(0, 8)
        .map(
          (event) =>
            `${event.icon} **${event.name}** — ${discordTimestamp(event.start)} to ${discordTimestamp(event.end)}`
        )
        .join("\n"),
      inline: false,
    });
  } else {
    embed.addFields({
      name: "Upcoming Events",
      value: "No active event reminders right now.",
      inline: false,
    });
  }

  return embed;
}

async function sendEmbed(channel, embed) {
  try {
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Failed to send embed:", error);
  }
}

async function postTimerStatus(channel) {
  const now = DateTime.now().setZone(TIMEZONE);
  const clanWar = getActiveClanWarWindow(now);

  let upcomingEvents = [];
  if (clanWar.active) {
    upcomingEvents = getAllEventsForWindow(clanWar.start, clanWar.end).filter(
      (event) => event.start > now
    );
  }

  await sendEmbed(channel, buildStatusEmbed(now, clanWar, upcomingEvents));
}

async function runChecks() {
  const now = DateTime.now().setZone(TIMEZONE);
  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);

  if (!channel) {
    console.error("Could not find channel. Check CHANNEL_ID.");
    return;
  }

  cleanupOldReminderKeys();

  const clanWar = getActiveClanWarWindow(now);

  const clanWarStartKey = `clanwar-start-${clanWar.start.toISO()}`;
  if (
    isWithinTriggerWindow(now, clanWar.start) &&
    !alreadySent(clanWarStartKey)
  ) {
    await sendEmbed(channel, buildClanWarStartEmbed(clanWar.start, clanWar.end));
    markSent(clanWarStartKey);
  }

  const clanWarEndingSoonTime = clanWar.end.minus({ hours: 1 });
  const clanWarEndingSoonKey = `clanwar-endingsoon-${clanWar.end.toISO()}`;
  if (
    clanWar.active &&
    isWithinTriggerWindow(now, clanWarEndingSoonTime) &&
    !alreadySent(clanWarEndingSoonKey)
  ) {
    await sendEmbed(channel, buildClanWarEndingSoonEmbed(clanWar.end));
    markSent(clanWarEndingSoonKey);
  }

  const clanWarEndedKey = `clanwar-ended-${clanWar.end.toISO()}`;
  if (
    isWithinTriggerWindow(now, clanWar.end) &&
    !alreadySent(clanWarEndedKey)
  ) {
    const nextStart = clanWar.end.plus({ days: 7 });
    await sendEmbed(channel, buildClanWarEndedEmbed(clanWar.end, nextStart));
    markSent(clanWarEndedKey);
  }

  if (!clanWar.active) {
    return;
  }

  const events = getAllEventsForWindow(clanWar.start, clanWar.end);

  for (const event of events) {
    const oneHourBefore = event.start.minus({ hours: 1 });
    const fifteenMinutesBefore = event.start.minus({ minutes: 15 });

    const oneHourKey = `${event.key}-1h`;
    const fifteenMinuteKey = `${event.key}-15m`;
    const startKey = `${event.key}-start`;

    if (
      isWithinTriggerWindow(now, oneHourBefore) &&
      !alreadySent(oneHourKey)
    ) {
      await sendEmbed(channel, buildEventReminderEmbed(event, 60));
      markSent(oneHourKey);
    }

    if (
      isWithinTriggerWindow(now, fifteenMinutesBefore) &&
      !alreadySent(fifteenMinuteKey)
    ) {
      await sendEmbed(channel, buildEventReminderEmbed(event, 15));
      markSent(fifteenMinuteKey);
    }

    if (
      isWithinTriggerWindow(now, event.start) &&
      !alreadySent(startKey)
    ) {
      await sendEmbed(channel, buildEventStartedEmbed(event));
      markSent(startKey);
    }
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (channel) {
    await postTimerStatus(channel);
  }

  await runChecks();

  setInterval(async () => {
    try {
      await runChecks();
    } catch (error) {
      console.error("Error in scheduled check:", error);
    }
  }, CHECK_INTERVAL_MS);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content === "!timer") {
    await postTimerStatus(message.channel);
  }
});

client.login(TOKEN).catch((err) => {
  console.error("Login failed:", err);
  process.exit(1);
});
