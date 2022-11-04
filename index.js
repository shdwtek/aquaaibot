const tmi = require('tmi.js');
const generator = require('./textGenerator');
const http = require('http');

const reputation = {};

function doRequest(url) {
  return new Promise(function (resolve, reject) {
    http.get(url, function(response) {
      var data = '';
      response.on('data', function (chunk) {
          data += chunk;
      });
      response.on('end', async function () {
        resolve(data);
      });
      response.on('error', async function (error) {
        reject(error);
      });
    });
  });
}

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
      var tankTemp = await doRequest('http://shdwtek.net/temp.html');
      tankTemp = tankTemp.replace(/<[^>]+>/g, ' ').trim().replace(/ +/, ' ');
      var promptText = process.env.OPENAI_PROMPT
        .replace(/\{botname\}/g, tags['display-name'])
        .replace('{message}', args.join(' ')).trim()
        .replace('{temp}', tankTemp + '°F');
      // Add a period if necessary so the bot doesn't try to complete the prompt.
      if (!['.','?'].includes(promptText.slice(-1))) {
        promptText = `${promptText}.}`;
      }
      client.say(channel, `@${tags.username}, ${await generator.generate(promptText)}`);
    })();
  }
});
