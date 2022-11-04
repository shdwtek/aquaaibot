const tmi = require('tmi.js');
const generator = require('./textGenerator');

const reputation = {};
const client = new tmi.Client({
  options: { debug: true },
  connection: {
    secure: true,
    reconnect: true
  },
  identity: {
    username: process.env.TWITCH_BOT_USERNAME,
    password: process.env.TWITCH_OAUTH_TOKEN
  },
  channels: process.env.TWITCH_CHANNELS_TO_JOIN.split(',')
});

client.connect();

client.on('message', (channel, tags, message, self) => {
  if(self || !message.startsWith('@')) {
    return;
  }

  const args = message.slice(1).split(' ');
  const command = args.shift().toLowerCase();

  if(command === process.env.TWITCH_BOT_USERNAME) {
    (async () => {
      var promptText = process.env.OPENAI_PROMPT
        .replace(/\{botname\}/g, tags['display-name'])
        .replace('{message}', args.join(' '));
      client.say(channel, `@${tags.username}, ${await generator.generate(promptText)}`);
    })();
  }
});
