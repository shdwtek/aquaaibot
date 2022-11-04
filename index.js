const tmi = require('tmi.js');
const generator = require('./textGenerator');

const reputation ={};
const client = new tmi.Client({
  options: { debug: true },
  connection: {
    secure: true,
    reconnect: true
  },
  identity: {
    username: 'aquaaibot',
    password: process.env.TWITCH_OAUTH_TOKEN
  },
  channels: [ 'shdwtek' ]
});

client.connect();

client.on('message', (channel, tags, message, self) => {
  if(self || !message.startsWith('@')) {
    return;
  }

  const args = message.slice(1).split(' ');
  const command = args.shift().toLowerCase();

    if(command === 'aquaaibot') {
    (async () => {
      const prompt = args.join(' ');
      client.say(channel, `@${tags.username}, ${await generator.generate(prompt)}`);
    })();
  }
});
