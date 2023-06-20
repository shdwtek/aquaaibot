const tmi = require('tmi.js');
const http = require('http');
const generator = require('./textGenerator');
const os = require('node:os');
const reputation = {};
const querystring = require('querystring');
const fs = require('fs');

let isLurking = false;
// Create an object to store the feeding data
let feedingData = {};

// Create a variable to store the last fed data
let lastFedData = {};

// Load the feeding data from the JSON file, if available
fs.readFile('feeding_data.json', 'utf8', (err, data) => {
  if (!err) {
    if (data) {
      try {
        feedingData = JSON.parse(data);
      } catch (parseError) {
        console.error('Error parsing feeding data:', parseError);
      }
    }
  } else if (err.code !== 'ENOENT') {
    console.error('Error reading feeding data from file:', err);
  }
});

// Load the last fed data from the JSON file, if available
fs.readFile('last_fed_data.json', 'utf8', (err, data) => {
  if (!err) {
    if (data) {
      try {
        lastFedData = JSON.parse(data);
      } catch (parseError) {
        console.error('Error parsing last fed data:', parseError);
      }
    }
  } else if (err.code !== 'ENOENT') {
    console.error('Error reading last fed data from file:', err);
  }
});

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

// Connect to Twitch
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

// Fish Feeding Time Keeper

const eightHoursInMilliseconds = 8 * 60 * 60 * 1000; // convert 8 hours to milliseconds
var lastFeedTime = 0;

let timeSinceLastFed = '';

client.on('message', (channel, tags, message, self, understate) => {

  const args = message.slice(1).split(' ');
  const command = args.shift().toLowerCase();

  // Handle !feedfish
  if (command === 'feedfish') {
    const currentTime = new Date().getTime();
    if (currentTime - lastFeedTime < eightHoursInMilliseconds) {
      client.say(channel, `@${tags.username} You can only feed the fish once every 8 hours!`);
      return;
    }

    // Connect to Feeder Arduino

    const request = http.request({
      hostname: 'localhost', // Replace with correct hostname IP
      port: 8082, // Replace with correct Port
      path: '/H',
      method: 'GET'
    }, (response) => {
      client.say(channel, `@${tags.username} Thanks for feeding the fish!`);
 
     lastFeedTime = currentTime; // Update the last feed time
	
	 // Update the feeding data for the username
    if (feedingData[tags.username]) {
      feedingData[tags.username].count++;
      feedingData[tags.username].time = currentTime; // Update the time property
    } else {
      feedingData[tags.username] = {
        count: 1,
        time: currentTime
      };
    }

// Write the feeding data to the JSON file
fs.writeFile('feeding_data.json', JSON.stringify(feedingData), (err) => {
  if (err) {
    console.error('Error writing feeding data to file:', err);
  }
});

	
    // Post Last Username to Feed Fish

     const postUser = `username=${encodeURIComponent(tags.username)}`;

     const phpRequest = http.request({
       hostname: 'localhost',
       port: 80,
       path: '/postUser.php',
       method: 'POST',
       headers: {
         'Content-Type': 'application/x-www-form-urlencoded',
         'Content-Length': Buffer.byteLength(postUser)
      }
     }, (phpResponse) => {
        console.log(`PHP Response: ${phpResponse.statusCode}`);
    });
        
    phpRequest.on('error', (error) => {
      console.error(error);
    });

    phpRequest.write(postUser);
    phpRequest.end();

   // client.say(channel, '!lastfed');
    });
    request.on('error', (error) => {
      client.say(channel, `@${tags.username} There was an error reaching the feeder.`);
      console.error(error);
    });
    request.end();
    return;
  }
  

// Handle !lurk command
if (command === 'lurk') {
  if (isLurking) {
    isLurking = false;
    client.say(channel, `@${tags.username} Ok! Lurking disabled!`);
  } else {
    isLurking = true;
    client.say(channel, `@${tags.username} Ok! Lurking enabled!`);
  }
}


// Handle !lastfed
if (command === 'lastfed') {
  const currentTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const lastFedDate = new Date(lastFeedTime).toLocaleString('en-US', { timeZone: 'America/New_York' });
  const diff = new Date(currentTime) - new Date(lastFedDate);
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  timeSinceLastFed = `${hours}h ${minutes}m ${seconds}s`;

  // Update the last fed data
  lastFedData.lastFedTime = lastFedDate;
  lastFedData.timeSinceLastFed = timeSinceLastFed;

  // Write the last fed data to the JSON file
  fs.writeFile('last_fed_data.json', JSON.stringify(lastFedData), (err) => {
    if (err) {
      console.error('Error writing last fed data to file:', err);
    }
  });

    // Post Fed Recently Data
    let fedWithin8Hours = hours < 8 ? 'yes' : 'no';

    const postFedData = querystring.stringify({ fedWithin8Hours: fedWithin8Hours });
    const options = {
      hostname: 'localhost',
      path: '/postFedData.php',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': postFedData.length
     }
   };

   const req = http.request(options, (res) => {
     console.log(`statusCode: ${res.statusCode}`);
     res.on('data', (d) => {
       process.stdout.write(d);
     });
    });
     req.on('error', (error) => {
       console.error(error);
     });
     req.write(postFedData);
     req.end();


    client.say(channel, `@${tags.username} The fish were last fed on ${lastFedDate.toLocaleString()} (${timeSinceLastFed} ago).`);

    return;
}

// Handle !feedingdata command
if (command === 'feedingdata') {
  const username = tags.username;
  if (feedingData[username]) {
    const { count, time } = feedingData[username];
    const lastFedTime = new Date(time).toLocaleString();

    client.say(channel, `@${username}, You have fed the fish ${count} time(s). Last fed on ${lastFedTime}.`);
  } else {
    client.say(channel, `@${username}, You have not fed the fish yet.`);
  }
}

// Handle !userfeedingdata command
if (command === 'userfeedingdata') {
  const targetUser = args[0]; // Extract the target user from the command arguments

  if (feedingData[targetUser]) {
    const { count, time } = feedingData[targetUser];
    const lastFedTime = new Date(time).toLocaleString();

    client.say(channel, `Feeding data for ${targetUser}: ${count} time(s). Last fed on ${lastFedTime}.`);
  } else {
    client.say(channel, `${targetUser} has not fed the fish yet.`);
  }

  return;
}



// Handle !topfeeders command
if (command === 'topfeeders') {
  const sortedUsernames = Object.keys(feedingData).sort((a, b) => feedingData[b].count - feedingData[a].count);
  const top3Usernames = sortedUsernames.slice(0, 3);

  if (top3Usernames.length > 0) {
    let response = 'Top 3 Feeders: ';
    top3Usernames.forEach((username, index) => {
      const count = feedingData[username].count;
      response += `${index + 1}. ${username} (${count} time(s))`;
      if (index < top3Usernames.length - 1) {
        response += ', ';
      }
    });
    client.say(channel, response);
  } else {
    client.say(channel, 'No feeding data available.');
  }
}

// Handle !commandlist command
if (command === 'commandlist') {
  const commands = [
    '!feedfish - Feed the fish',
    '!lurk - Enable lurking',
    '!lastfed - Get the last feeding time',
    '!feedingdata - Get feeding data for your username',
    '!topfeeders - Get the top 3 feeders',
    '!highcam - Changes main view to top of aquarium',
    '!lowcam - Changes main view to bottom of aquarium',
    '!userfeedingdata username - Get the feeding data per user.'
 ];
  const commandList = commands.join(', ');
  client.say(channel, `@${tags.username}, Available commands: ${commandList}`);
}

  // Handle any message containing 'aquaaibot' (case-insensitive)
  if(message.match(new RegExp(process.env.TWITCH_BOT_USERNAME, 'i'))) {
    (async () => {
      var tankData = await doRequest('http://localhost/temp.html'); // Replace URL with correct address
      tankData = tankData.replace(/<[^>]+>/g, ' ').trim().replace(/ +/, ' ').split(' ');

     //  const localTime = now.toLocaleTimeString();

      var time = os.uptime();
      var day = parseInt(time / 86400);
      var promptText = process.env.OPENAI_PROMPT
        .replace(/\{botname\}/g, tags['display-name'])
        .replace('{message}', args.join(' ')).trim()
        .replace('{temp}', tankData[0] + '°F')
        .replace('{tds}', tankData[1] + 'PPM')
        .replace('{tss}', tankData[2] + 'PPM')
        .replace('{level}', tankData[3])
        .replace('{uptime}', day + 'days')
        .replace('{timeFed}', timeSinceLastFed)
      //  .replace('{time}', localTime);

      // Add a period if necessary so the bot doesn't try to complete the prompt.
      if (!['.','?'].includes(promptText.slice(-1))) {
        promptText = `${promptText}.}`;
      }
      client.say(channel, `@${tags.username}, ${await generator.generate(promptText)}`);
    })();
    return;
  }

});

