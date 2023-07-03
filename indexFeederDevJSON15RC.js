const tmi = require('tmi.js'); // Twitch Messaging
const http = require('http');
const generator = require('./textGenerator'); // OpenAi Generator
const os = require('node:os');
const reputation = {};
const querystring = require('querystring');
const fs = require('fs'); // File System Read-Write
const now = new Date();
const localTime = now.toLocaleTimeString(); // Server Time Tracker
let isLurking = false; // Flag variable to track the lurking status
let lurkStartTime = null; // Variable to store the start time of lurking
const temperatureHistoryFile = '/var/www/html/chart/temperature_log.json';
let temperatureHistory = loadTemperatureHistory();
let fetchTimeout; // Variable to store the timeout ID for debouncing
// Create an object to store the feeding data
let feedingData = {};
const reminders = []; // Array to store the reminders

let lastFedData = {
  lastFedTime: null,
  timeSinceLastFed: null
};

// Function to load the temperature history from the JSON file
function loadTemperatureHistory() {
  try {
    const data = fs.readFileSync(temperatureHistoryFile, 'utf8');
    if (data.trim() === '') {
      // If the file is empty, return an empty array
      return [];
    }
    return JSON.parse(data);
  } catch (error) {
    console.warn('Unable to load temperature history:', error);
    return [];
  }
}

// Function to save the temperature history to the JSON file
function saveTemperatureHistory(history) {
  const data = JSON.stringify(history);
  fs.writeFileSync(temperatureHistoryFile, data, 'utf8');
}

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
    http.get(url, function (response) {
      var data = '';
      response.on('data', function (chunk) {
        data += chunk;
      });
      response.on('end', function () {
        resolve(data);
      });
      response.on('error', function (error) {
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

// Function to write the last fed data to the JSON file
function writeLastFedDataToFile() {
  fs.writeFile('last_fed_data.json', JSON.stringify(lastFedData), (err) => {
    if (err) {
      console.error('Error writing last fed data to file:', err);
    }
  });
}

// Fish Feeding Time Keeper

const eightHoursInMilliseconds = 8 * 60 * 60 * 1000; // convert 8 hours to milliseconds
var lastFeedTime = 0;

let timeSinceLastFed = '';

// Load the last fed data from the JSON file, if available
fs.readFile('last_feed_data.json', 'utf8', (err, data) => {
  if (!err) {
    if (data) {
      try {
        lastFeedTime = JSON.parse(data);
      } catch (parseError) {
        console.error('Error parsing last feed time data:', parseError);
      }
    }
  } else if (err.code !== 'ENOENT') {
    console.error('Error reading last feed time data from file:', err);
  }
});

function saveLastFeedData() {
  fs.writeFile('last_feed_data.json', JSON.stringify(lastFeedData), (err) => {
    if (err) {
      console.error('Error writing last feed data to file:', err);
    }
  });
}

client.on('message', (channel, tags, message, self) => {
  const args = message.slice(1).split(' ');
  const command = args.shift().toLowerCase();

  // Handle !feedfish
  if (command === 'feedfish') {
    const currentTime = new Date().getTime();
    if (currentTime - lastFeedData.lastFedTime < eightHoursInMilliseconds) {
      client.say(channel, `@${tags.username} You can only feed the fish once every 8 hours!`);
      return;
    }

    // Connect to the Fish Feeder Arduino
    const feederRequest = http.request({
      hostname: '127.0.0.1', // Replace with correct hostname IP
      port: 8082, // Replace with correct port
      path: '/H',
      method: 'GET'
    }, (feederResponse) => {
      client.say(channel, `@${tags.username} Thanks for feeding the fish!`);

      // Update last feed data
      lastFeedData.lastFedTime = currentTime;
      lastFeedData.timeSinceLastFed = '0h 0m 0s';

      // Save the last feed data to the JSON file
      saveLastFeedData();

      // Rest of the feedfish command logic...
    });

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

    // Post last username to feed fish
    const postUser = `username=${encodeURIComponent(tags.username)}`;

    const phpRequest = http.request({
      hostname: 'localhost', // Replace with proper Host URL
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

    // Request error handling
    feederRequest.on('error', (error) => {
      client.say(channel, `@${tags.username} There was an error reaching the feeder.`);
      console.error(error);
    });
    feederRequest.end();
    return;
  }
});


// Remind Me Code
if (command === 'remindme') {
  const time = args[0];
  const reminder = args.slice(1).join(' ');

  handleRemindMeCommand(message, time, reminder);
}

// Function to handle the !remindme command
function handleRemindMeCommand(message, time, reminder) {
  const timeRegex = /^(\d+)(h|m)$/; // Regular expression to match the time format

  // Check if the time format is valid
  if (!timeRegex.test(time)) {
    client.say(channel, `Invalid time format. Please use 'h' for hours or 'm' for minutes.`);
    return;
  }

  const matches = time.match(timeRegex);
  const duration = parseInt(matches[1]);
  const unit = matches[2];

  let delay;

  // Calculate the delay based on the specified time unit
  if (unit === 'h') {
    delay = duration * 60 * 60 * 1000; // Convert hours to milliseconds
  } else {
    delay = duration * 60 * 1000; // Convert minutes to milliseconds
  }

  const reminderTime = Date.now() + delay;

  // Create the reminder object
  const reminderObj = {
    time: reminderTime,
    message: reminder,
    user: tags.username,
    channel: channel,
  };

  // Add the reminder to the array
  reminders.push(reminderObj);

  // Schedule the reminder
  setTimeout(() => {
    sendReminder(reminderObj);
  }, delay);

  // Send a confirmation message
  client.say(channel, `Reminder set for ${duration}${unit}. I will remind you.`);
}

// Function to send the reminder message
function sendReminder(reminderObj) {
  const { time, message, user, channel } = reminderObj;
  const currentTime = Date.now();
  const timeDiff = new Date(time - currentTime).toISOString().substr(11, 8);

  client.say(channel, `@${user}, you asked me to remind you: "${message}".`);
}

// Handle !lurk command
if (command === 'lurk') {
  if (isLurking) {
    isLurking = false;
    lurkEndTime = new Date();
    const timeElapsed = Math.floor((lurkEndTime - lurkStartTime) / 1000); // Calculate time elapsed in seconds
    const hours = Math.floor(timeElapsed / 3600);
    const minutes = Math.floor((timeElapsed % 3600) / 60);
    const seconds = timeElapsed % 60;
    client.say(channel, `@${tags.username} Ok! Lurking disabled! Time elapsed: ${hours}h ${minutes}m ${seconds}s.`);
  } else {
    isLurking = true;
    lurkStartTime = new Date();
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
  writeLastFedDataToFile()

  /*
    // Write the last fed data to the JSON file
    fs.writeFile('last_fed_data.json', JSON.stringify(lastFedData), (err) => {
      if (err) {
        console.error('Error writing last fed data to file:', err);
      }
    });
  */
  // Post Fed Recently Data
  let fedWithin8Hours = hours < 8 ? 'yes' : 'no';

  const postFedData = querystring.stringify({ fedWithin8Hours: fedWithin8Hours });
  const options = {
    hostname: '127.0.0.1', // Replace with proper IP
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

function fetchAndStoreTemperature() {
  // Clear the previous timeout to avoid multiple simultaneous requests
  clearTimeout(fetchTimeout);

  // Fetch temperature data from the URL
  doRequest('http://localhost/temp.html') // Replace with proper URL
    .then((tankTemp) => {
      tankTemp = tankTemp.replace(/<[^>]+>/g, ' ').trim().replace(/ +/, ' ').split(': ')[1].split(' C')[0];

      const currentTemperature = parseFloat(tankTemp);
      const currentTime = new Date().getTime();

      // Add the current temperature and time to the temperature history
      temperatureHistory.push({ time: currentTime, temperature: currentTemperature });

      // Save the updated temperature history to the JSON file
      saveTemperatureHistory(temperatureHistory);

      // Schedule the next temperature fetch after 5 minutes
      fetchTimeout = setTimeout(fetchAndStoreTemperature, 5 * 60 * 1000);
    })
    .catch((error) => {
      console.error('Error fetching temperature data:', error);
      // Retry the request after 1 minute in case of an error
      fetchTimeout = setTimeout(fetchAndStoreTemperature, 1 * 60 * 1000);
    });
}

// Schedule the initial temperature fetch
fetchAndStoreTemperature();

// Function to save the temperature history to the JSON file
function saveTemperatureHistory(history) {
  const data = JSON.stringify(history);
  fs.writeFileSync(temperatureHistoryFile, data, 'utf8');
}

// Handle !watertemp command
if (command === 'watertemp') {
  if (args[0] === 'avg') {
    if (temperatureHistory.length > 0) {

      const numericTemperatures = temperatureHistory.filter(temp => !isNaN(temp));

      if (numericTemperatures.length > 0) {

        // Calculate the average water temperature
        const averageTemperature = numericTemperatures.reduce((sum, temp) => sum + temp, 0) / numericTemperatures.length;

        // Round the average temperature to two decimal places
        const roundedAverageTemperature = averageTemperature.toFixed(2);

        client.say(channel, `@${tags.username}, The average water temperature is ${roundedAverageTemperature}°F.`);
      }
    }
  } else if (args[0] === 'current') {
    if (temperatureHistory.length > 0) {
      const currentEntry = temperatureHistory[temperatureHistory.length - 1];
      const currentTemperature = Number(currentEntry.temperature);

      if (!isNaN(currentTemperature)) {
        const formattedTemperature = currentTemperature.toFixed(2);
        //  const currentTemperature = temperatureHistory[temperatureHistory.length - 1];
        //  const formattedTemperature = currentTemperature.toFixed(2);
        client.say(channel, `@${tags.username}, The current water temperature is ${formattedTemperature}°F.`);
      } else {
        client.say(channel, `@${tags.username}, Unable to retrieve the current temperature.`);
      }
      // client.say(channel, `@${tags.username}, No current temperature data available.`);
    }
  } else if (args[0] && /^\d+$/.test(args[0])) {
    const numDays = parseInt(args[0], 10);

    if (numDays <= 0) {
      client.say(channel, `@${tags.username}, Please specify a positive number of readings.`);
      return;
    }

    if (numDays > temperatureHistory.length) {
      client.say(channel, `@${tags.username}, Not enough data available for ${numDays} readings.`);
      return;
    }

    // Get the temperatures for the specified number of readings
    const pastTemperatures = temperatureHistory.slice(-numDays);
    const formattedTemperatures = pastTemperatures.map(entry => {
      const timestamp = new Date(entry.timestamp * 1000);
      const formattedTime = timestamp.toLocaleString();
      return `${entry.temperature}°F (${formattedTime})`;
    });
    client.say(channel, `@${tags.username}, Water temperatures for the past ${numDays} reading(s): ${formattedTemperatures.join(', ')}.`); // ('°F, ')}°F .`);
  } else {
    client.say(channel, `@${tags.username}, Invalid command format. Please use '!watertemp avg' for the average water temperature or '!watertemp <numDays>' to get temperatures for the past <numDays> readings(s).`);
  }
}
// Handle !chart command
if (command === 'chart') {
  if (args.length === 1 && /^\d+$/.test(args[0])) {
    const numReadings = parseInt(args[0]);

    // Check if the provided argument is a valid number
    if (isNaN(numReadings) || numReadings < 2 || numReadings > temperatureHistory.length) {
      client.say(channel, `@${tags.username} Please provide a valid number of readings between 2 and ${temperatureHistory.length}.`);
      return;
    }

    // Read the temperature history from the JSON file
    fs.readFile('/var/www/html/chart/temperature_log.json', 'utf8', (error, data) => {
      if (error) {
        console.error('Error reading temperature log:', error);
        client.say(channel, `@${tags.username}, Error occurred while retrieving temperature data.`);
        return;
      }

      let temperatureHistory;
      try {
        temperatureHistory = JSON.parse(data);
      } catch (parseError) {
        console.error('Error parsing temperature log:', parseError);
        client.say(channel, `@${tags.username}, Error occurred while parsing temperature data.`);
        return;
      }

      if (temperatureHistory.length < numReadings) {
        client.say(channel, `@${tags.username}, Not enough temperature readings available.`);
        return;
      }

      // Filter the required number of readings
      const readings = temperatureHistory.slice(-numReadings);

      // Generate a unique filename for the chart HTML page
      const chartFileName = `chart_${Date.now()}.html`;

      const chartFullPath = `/var/www/html/chart/${chartFileName}`;
      // const chartFullPath = `/var/www/html/${chartFileName}`;
      // Write the chart HTML file
      const chartHtml = generateChartHtml(readings);
      // fs.writeFile(chartFileName, chartHtml, 'utf8', (writeError) => {
      fs.writeFile(chartFullPath, chartHtml, 'utf8', (writeError) => {
        if (writeError) {
          console.error('Error writing chart HTML:', writeError);
          client.say(channel, `@${tags.username}, Error occurred while generating the chart.`);
        } else {
          
          const chartUrl = `http://localhost/chart/${chartFileName}`; // Replace with the actual URL where the HTML file will be hosted
          client.say(channel, `@${tags.username}, Here is the chart showing the last ${numReadings} temperature readings: ${chartUrl}`);
        }
      });
    });
  } else {
    client.say(channel, `@${tags.username}, Invalid command syntax. Usage: !chart <readings>`);
  }
}

function generateChartHtml(readings) {
  // Generate the necessary HTML content for the chart page
  const chartHtml = `<!DOCTYPE html>
    <html>
    <head>
      <title>Temperature Chart</title>
      <!-- Include Chart.js library -->
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <!-- Add a canvas element for the chart -->
      <canvas id="chartCanvas"></canvas>

      <script>
        const temperatureHistory = ${JSON.stringify(readings)};

            // Fetch the temperature data from the JSON file
    fetch('temperature_log.json')
      .then(response => response.json())
      .then(temperatureHistory => {
        // Prepare the temperature data for the chart
        const temperatureData = temperatureHistory.map(entry => entry.temperature);
        const timestamps = temperatureHistory.map(entry => formatTimestamp(entry.timestamp)); // Adjust the function to format the timestamp

        // Set up a canvas element in your HTML
        const canvas = document.getElementById('chartCanvas');

        // Initialize Chart.js instance
        const chart = new Chart(canvas, {
          type: 'line',
          data: {
            labels: timestamps,
            datasets: [{
              label: 'Temperature',
              data: temperatureData,
              borderColor: 'blue',
              fill: false
            }]
          },
          options: {
            // Configure chart options, such as title, axes, tooltips, etc.
          }
        });

        // Render the chart
        chart.render();
      })
      .catch(error => {
        console.error('Error loading temperature data:', error);
      });
// Function to format the timestamp
function formatTimestamp(timestamp) {
  const date = new Date(timestamp * 1000); // Convert UNIX timestamp to milliseconds
  const year = date.getFullYear();
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const day = ('0' + date.getDate()).slice(-2);
  const hours = ('0' + date.getHours()).slice(-2);
  const minutes = ('0' + date.getMinutes()).slice(-2);
  const seconds = ('0' + date.getSeconds()).slice(-2);
  return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
}

      </script>
    </body>
    </html>
  `;

  return chartHtml;
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
    '!userfeedingdata username - Get the feeding data per user.',
    '!watertemp avg|current|1-100 (past readings) - Get the latest water temp data.',
    '!remindme time[m|h] message [Ex: !remindme 30m Take a break] - Set a reminder message.'
  ];
  const commandList = commands.join(', ');
  client.say(channel, `@${tags.username}, Available commands: ${commandList}`);
}

// Handle any message containing 'aquaaibot' (case-insensitive)
if (message.match(new RegExp(process.env.TWITCH_BOT_USERNAME, 'i'))) {
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
      .replace('{time}', localTime);

    // Add a period if necessary so the bot doesn't try to complete the prompt.
    if (!['.', '?'].includes(promptText.slice(-1))) {
      promptText = `${promptText}.}`;
    }
    client.say(channel, `@${tags.username}, ${await generator.generate(promptText)}`);
  })();
  return;
}

});
