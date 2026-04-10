const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const cron = require("node-cron");

const app = express();
const TOKEN = process.env.TOKEN;
const CHANNEL_ID = "1480284500494647538";
const TIME_ZONE = "America/Toronto";
const PORT = process.env.PORT || 3000;

// --------------------
// KEEP ALIVE SERVER
// --------------------
app.get("/", (req, res) => {
  res.send("Bot is alive!");
});

app.listen(PORT, () => {
  console.log("Keep-alive server running");
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

let crimsonMessageId = null;
let dragonMessageId = null;

// --------------------
// TIME HELPERS
// --------------------
function getNow() {
  return new Date();
}

function toUnix(date) {
  return Math.floor(date.getTime() / 1000);
}

// --------------------
// EVENT LOGIC
// --------------------
function getNextEvent(hours, duration) {
  const now = getNow();

  let closest = null;

  for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
    for (let h of hours) {
      let d = new Date(now);
      d.setHours(h, 0, 0, 0);
      d.setDate(d.getDate() + dayOffset);

      let end = new Date(d.getTime() + duration * 60 * 60 * 1000);

      if (now >= d && now < end) {
        return { active: true, start: d, end };
      }

      if (!closest || d < closest.start) {
        if (d > now) {
          closest = { active: false, start: d, end };
        }
      }
    }
  }

  return closest;
}

// --------------------
// CRIMSON MOON
// --------------------
const CRIMSON_HOURS = [1, 9, 17];
const CRIMSON_DURATION = 1;

function buildCrimson(ping = false) {
  const e = getNextEvent(CRIMSON_HOURS, CRIMSON_DURATION);
  const tag = ping ? "@everyone\n" : "";

  if (e.active) {
    return `${tag}🌕 **Crimson Moon is LIVE!!**

🔥 Get in now!
⏳ Ends: <t:${toUnix(e.end)}:R> | <t:${toUnix(e.end)}:F>

**Schedule (Toronto)**
1:00 AM / 9:00 AM / 5:00 PM
Duration: 1 hour`;
  } else {
    return `${tag}🌙 **Crimson Moon**

⏰ Starts: <t:${toUnix(e.start)}:R> | <t:${toUnix(e.start)}:F>
⏳ Ends: <t:${toUnix(e.end)}:F>

**Schedule (Toronto)**
1:00 AM / 9:00 AM / 5:00 PM
Duration: 1 hour`;
  }
}

// --------------------
// DRAGON / SPIDER
// --------------------
const DRAGON_HOURS = [4, 12, 20];
const DRAGON_DURATION = 2;

function buildDragon(ping = false) {
  const e = getNextEvent(DRAGON_HOURS, DRAGON_DURATION);
  const tag = ping ? "@everyone\n" : "";

  if (e.active) {
    return `${tag}🐉🕷️ **Dragon/Spider is OPEN!!**

🔥 Go now!
⏳ Closes: <t:${toUnix(e.end)}:R> | <t:${toUnix(e.end)}:F>

**Schedule (Toronto)**
4:00 AM / 12:00 PM / 8:00 PM
Duration: 2 hours`;
  } else {
    return `${tag}🐉🕷️ **Dragon/Spider**

⏰ Opens: <t:${toUnix(e.start)}:R> | <t:${toUnix(e.start)}:F>
⏳ Closes: <t:${toUnix(e.end)}:F>

**Schedule (Toronto)**
4:00 AM / 12:00 PM / 8:00 PM
Duration: 2 hours`;
  }
}

// --------------------
// MESSAGE HANDLER
// --------------------
async function postOrEdit(id, content) {
  const channel = await client.channels.fetch(CHANNEL_ID);

  if (!id) {
    const msg = await channel.send(content);
    return msg.id;
  }

  try {
    const msg = await channel.messages.fetch(id);
    await msg.edit(content);
    return id;
  } catch {
    const msg = await channel.send(content);
    return msg.id;
  }
}

// --------------------
// UPDATE FUNCTIONS
// --------------------
async function updateCrimson(ping = false) {
  crimsonMessageId = await postOrEdit(crimsonMessageId, buildCrimson(ping));
}

async function updateDragon(ping = false) {
  dragonMessageId = await postOrEdit(dragonMessageId, buildDragon(ping));
}

// --------------------
// BOT READY
// --------------------
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  await updateCrimson(false);
  await updateDragon(false);

  // CRIMSON START
  cron.schedule("0 1 * * *", () => updateCrimson(true), {
    timezone: TIME_ZONE,
  });
  cron.schedule("0 9 * * *", () => updateCrimson(true), {
    timezone: TIME_ZONE,
  });
  cron.schedule("0 17 * * *", () => updateCrimson(true), {
    timezone: TIME_ZONE,
  });

  // CRIMSON END REFRESH
  cron.schedule("0 2 * * *", () => updateCrimson(false), {
    timezone: TIME_ZONE,
  });
  cron.schedule("0 10 * * *", () => updateCrimson(false), {
    timezone: TIME_ZONE,
  });
  cron.schedule("0 18 * * *", () => updateCrimson(false), {
    timezone: TIME_ZONE,
  });

  // DRAGON START
  cron.schedule("0 4 * * *", () => updateDragon(true), { timezone: TIME_ZONE });
  cron.schedule("0 12 * * *", () => updateDragon(true), {
    timezone: TIME_ZONE,
  });
  cron.schedule("0 20 * * *", () => updateDragon(true), {
    timezone: TIME_ZONE,
  });

  // DRAGON END REFRESH
  cron.schedule("0 6 * * *", () => updateDragon(false), {
    timezone: TIME_ZONE,
  });
  cron.schedule("0 14 * * *", () => updateDragon(false), {
    timezone: TIME_ZONE,
  });
  cron.schedule("0 22 * * *", () => updateDragon(false), {
    timezone: TIME_ZONE,
  });
});

// --------------------
// COMMANDS
// --------------------
client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const cmd = msg.content.toLowerCase();

  if (cmd === "!refresh") {
    await updateCrimson(false);
    await updateDragon(false);
    msg.reply("✅ Refreshed");
  }

  if (cmd === "!next") {
    const c = getNextEvent(CRIMSON_HOURS, CRIMSON_DURATION);
    const d = getNextEvent(DRAGON_HOURS, DRAGON_DURATION);

    const next = c.start < d.start ? c : d;

    msg.reply(`⏳ Next event: <t:${toUnix(next.start)}:R>`);
  }
});

client.login(TOKEN);
