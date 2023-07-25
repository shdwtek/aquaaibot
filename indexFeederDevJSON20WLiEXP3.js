require('dotenv').config();
const tmi = require('tmi.js');
const http = require('http');
const generator = require('./textGenerator');
const os = require('node:os');
const reputation = {};
const querystring = require('querystring');
const fs = require('fs');
const now = new Date();
const { Chart } = require('chart.js');
const axios = require('axios');
const localTime = now.toLocaleTimeString();
let isLurking = false; // Flag variable to track the lurking status
let lurkStartTime = null; // Variable to store the start time of lurking
const temperatureHistoryFile = '/var/www/html/chart/temperature_log.json';
let temperatureHistory = loadTemperatureHistory();
let fetchTimeout; // Variable to store the timeout ID for debouncing
// Create an object to store the feeding data
let feedingData = {};
const reminders = []; // Array to store the reminders
// Define a Map to store user message history
const userMessageHistory = new Map();
// Define a variable to store the water level data
// let waterLevel = '';
const waterLevel = "Ok"; // Replace with the actual water level value ("Lo" or "Ok")
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
/*
// Create a variable to store the last fed data
let lastFedData = {};
*/
let humidityData = [];
let waterLevelData = [];
let airTempData = [];
let lastFedData = {
  lastFedTime: null,
  timeSinceLastFed: null
};
// Function to generate the current date
function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Function to calculate the time since the last fed time
function getTimeSinceLastFed() {
    const now = new Date();
    const lastFedTime = new Date(lastFedData.lastFedTime); // Convert the stored time string to a Date object
    const timeSinceLastFed = Math.floor((now - lastFedTime) / 1000); // Time difference in seconds
    return timeSinceLastFed;
}

// Function to update the feed counter
function updateFeedCounter() {
    const timeFed = getTimeSinceLastFed();

    const postTime = `timeFed=${encodeURIComponent(timeFed)}`;
    
    const phpPostRequest = http.request({
        hostname: process.env.HOSTNAME,
        port: 80,
        path: '/update_feed_counter.php',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postTime)
        }
       }, (phpResponse) => {
       //   console.log(`PHP Response: ${phpResponse.statusCode}`);
      }); 
phpPostRequest.on('error', (error) => {
 console.error(error);
});
phpPostRequest.write(postTime);
phpPostRequest.end();

console.log(postTime);
    setTimeout(updateFeedCounter, 1000); // Update the counter every second
}

// Function to retrieve tank data from the URL
async function getTankData() {
  try {
    const response = await axios.get(process.env.TEMPURL); // Replace URL with correct address
    const tankData = response.data.replace(/<[^>]+>/g, ' ').trim().replace(/ +/g, ' ').split(' ');
    const waterLevel = tankData[4];
   
    console.log(waterLevel);
    return waterLevel;
  } catch (error) {
    console.warn('Error retrieving tank data:', error);
    return null;
  }
}
// Function to retrieve air temp data from the URL
async function getAirTempData() {
  try {
    const response = await axios.get(process.env.TEMPURL); // Replace URL with correct address
    const airData = response.data.replace(/<[^>]+>/g, ' ').trim().replace(/ +/g, ' ').split(' ');
   
    const airTemp = airData[2];
  //  console.log(airTemp);
    return airTemp;
  } catch (error) {
    console.warn('Error retrieving air temp data:', error);
    return null;
  }
}
// Function to retrieve humidity data from the URL
async function getHumidityData() {
    try {
      const response = await axios.get(process.env.TEMPURL); // Replace URL with correct address
      const humidityData = response.data.replace(/<[^>]+>/g, ' ').trim().replace(/ +/g, ' ').split(' ');
     
      const hum = humidityData[3];
    
      return hum;
    } catch (error) {
      console.warn('Error retrieving humidity data:', error);
      return null;
    }
}
// Function to write water level data to a JSON file
function writeWaterLevelData() {
  const currentDate = getCurrentDate();

  getTankData().then((waterLevel) => {
    if (waterLevel !== null) {
      const data = { date: currentDate, level: waterLevel };

      fs.readFile('/var/www/html/chart/waterlevel_data.json', 'utf8', (err, fileData) => {
        if (err) {
          console.warn('Unable to read water level data:', err);
          return;
        }

        if (fileData.trim() !== '') {
          waterLevelData = JSON.parse(fileData);
        }

        waterLevelData.push(data);

        fs.writeFile('/var/www/html/chart/waterlevel_data.json', JSON.stringify(waterLevelData), 'utf8', (err) => {
          if (err) {
            console.warn('Unable to write water level data:', err);
            return;
          }

        //  console.log(`Water level data appended: ${JSON.stringify(data)}`);
        });
      });
    }
  });
}



// Schedule the water level data update task to run once a day
const updateInterval = 24 * 60 * 60 * 1000; // 24 hours
setInterval(writeWaterLevelData, updateInterval);

function getCurrentDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Function to write air temp data to a JSON file
function writeAirTempData() {
  const currentDateTime = getCurrentDateTime();

  getAirTempData().then((airTemp) => {
    if (airTemp !== null) {
      const data = { date: currentDateTime, temp: airTemp };

      fs.readFile('/var/www/html/chart/airtemp.json', 'utf8', (err, fileData) => {
        if (err) {
          console.warn('Unable to read air temp data:', err);
          return;
        }

        if (fileData.trim() !== '') {
          airTempData = JSON.parse(fileData);
        }

        airTempData.push(data);

        if (airTempData.length > 100) {
          airTempData = airTempData.slice(-100);
        }

        fs.writeFile('/var/www/html/chart/airtemp.json', JSON.stringify(airTempData), 'utf8', (err) => {
          if (err) {
            console.warn('Unable to write air temp data:', err);
            return;
          }

        //  console.log(`Air temp data appended: ${JSON.stringify(data)}`);
        });
      });
    }
  });
}
// Schedule the air temp data update task to run every 5 minutes
const updateDataInterval = 5 * 60 * 1000; // 5 minutes
setInterval(writeAirTempData, updateDataInterval);

// Function to write air temp data to a JSON file
function writeHumidityData() {
    const currentDateTime = getCurrentDateTime();
  
    getHumidityData().then((hum) => {
      if (hum !== null) {
        const data = { date: currentDateTime, humidity: hum };
  
        fs.readFile('/var/www/html/chart/humidity.json', 'utf8', (err, fileData) => {
          if (err) {
            console.warn('Unable to read humidity data:', err);
            return;
          }
  
          if (fileData.trim() !== '') {
            humidityData = JSON.parse(fileData);
          }
  
          humidityData.push(data);
  
          if (humidityData.length > 100) {
            humidityData = humidityData.slice(-100);
          }
  
          fs.writeFile('/var/www/html/chart/humidity.json', JSON.stringify(humidityData), 'utf8', (err) => {
            if (err) {
              console.warn('Unable to write humidity data:', err);
              return;
            }
  
          //  console.log(`Humidity data appended: ${JSON.stringify(data)}`);
          });
        });
      }
    });
  }
  // Schedule the air temp data update task to run every 5 minutes
  const updateHumDataInterval = 5 * 60 * 1000; // 5 minutes
  setInterval(writeHumidityData, updateHumDataInterval);

/*
// Water Level Testing
const updateInterval = 60 * 1000; // 1 minute
setInterval(writeWaterLevelData, updateInterval);
*/
// Function to generate the water level chart HTML page
function generateLevelChartHtml(data) {
  // Generate the necessary HTML content for the chart page
  const chartHtml = `<!DOCTYPE html>
    <html>
    <head>
      <title>Water Level Chart</title>
      <!-- Include Chart.js library -->
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    </head>
    <body>
      <!-- Add a canvas element for the chart -->
      <canvas id="levelChart"></canvas>

      <script>
        const levelData = ${JSON.stringify(data)};

        // Prepare the water level data for the chart
        const dates = levelData.map(entry => entry.date);
        const waterLevels = levelData.map(entry => entry.level === 'Ok' ? 1 : 0);

        // Set up a canvas element in your HTML
        const canvas = document.getElementById('levelChart');

        // Initialize Chart.js instance
        const chart = new Chart(canvas, {
          type: 'line',
          data: {
            labels: dates,
            datasets: [{
              label: 'Water Level',
              data: waterLevels,
              borderColor: 'blue',
              fill: false
            }]
          },
          options: {
            // Configure chart options, such as title, axes, tooltips, etc.
            scales: {
              y: {
               ticks: {
                callback: function(value) {
                 return value === 1 ? 'Ok' : 'Lo';
                  }
                }
              }
            }
          }
        });

        // Render the chart
        chart.render();
      </script>
    </body>
    </html>
  `;

  return chartHtml;
}

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

client.on('message', async (channel, tags, message, self, understate) => {

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
      hostname: process.env.LOCALIP, // Replace with correct hostname IP
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
// Write the last feed time data to the JSON file
fs.writeFile('last_feed_data.json', JSON.stringify(lastFeedTime), (err) => {
  if (err) {
    console.error('Error writing last feed data to file:', err);
  }
});
	
    // Post Last Username to Feed Fish

     const postUser = `username=${encodeURIComponent(tags.username)}`;

     const phpRequest = http.request({
       hostname: process.env.HOSTNAME,
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

// Function to calculate the average of air temperature readings
function calculateAverageAirTemp(airTempData) {
    const totalTemp = airTempData.reduce((sum, reading) => sum + reading.temp, 0);
    const averageTemp = totalTemp / airTempData.length;
    return averageTemp.toFixed(2);
  }
  
  // Function to handle the !airtemp command
  function handleAirTempCommand(numReadingsOrAvg) {
  // Add handling for 'avg' argument
  if (numReadingsOrAvg === 'avg') {
    fs.readFile('/var/www/html/chart/airtemp.json', 'utf8', (err, fileData) => {
      if (err) {
        console.warn('Unable to read air temp data:', err);
        return;
      }

      if (fileData.trim() === '') {
        client.say(channel, `@${tags.username}, no air temperature data available.`);
        return;
      }

      airTempData = JSON.parse(fileData);

      // Convert temperature readings to numbers for average calculation
      for (let i = 0; i < airTempData.length; i++) {
        airTempData[i].temp = Number(airTempData[i].temp);
      }

      // Calculate the average temperature
      const numReadings = Math.min(airTempData.length, 100);
      const totalTemperature = airTempData.slice(-numReadings).reduce((sum, data) => sum + data.temp, 0);
      const averageTemperature = totalTemperature / numReadings;

      client.say(channel, `@${tags.username}, the average air temperature of the last ${numReadings} readings is ${averageTemperature.toFixed(2)}°F.`);
    });
    } else {
      
      // Validate the input argument (numReadingsOrAvg) to be a number between 1 and 100
      const numReadings = parseInt(numReadingsOrAvg);
      if (isNaN(numReadings) || numReadings < 1 || numReadings > 100) {
        client.say(channel, `@${tags.username}, please provide a number between 1 and 100, or 'avg' for the average.`);
        return;
      }
  
      fs.readFile('/var/www/html/chart/airtemp.json', 'utf8', (err, fileData) => {
        if (err) {
          console.warn('Unable to read air temp data:', err);
          return;
        }
  
        if (fileData.trim() === '') {
          client.say(channel, `@${tags.username}, no air temperature data available.`);
          return;
        }
  
        airTempData = JSON.parse(fileData);
  
        // Get the last numReadings entries from the airTempData array
        const lastReadings = airTempData.slice(-numReadings);
  
        // Build the message to be displayed in the chat
        let message = `@${tags.username}, the last ${numReadings} air temperature readings are:`;
        lastReadings.forEach((reading) => {
          const { date, temp } = reading;
          message += ` [Date: ${date}, Temperature: ${temp}]`;
        });
  
        // Send the message to the Twitch chat
        client.say(channel, message);
      });
    }
  }

// Command handler for the !airtemp command
if (command === 'airtemp') {
  if (args.length !== 1) {
    client.say(channel, `@${tags.username}, please provide the number of readings you want to see (1-100), or 'avg' for the average.`);
  } else {
    const arg = args[0].toLowerCase();
    handleAirTempCommand(arg);
  }
}

// Function to handle the !humidity command
function handleHumidityCommand(numReadingsOrAvg) {
    if (numReadingsOrAvg === 'avg') {
      fs.readFile('/var/www/html/chart/humidity.json', 'utf8', (err, fileData) => {
        if (err) {
          console.warn('Unable to read humidity data:', err);
          return;
        }
  
        if (fileData.trim() === '') {
          client.say(channel, `@${tags.username}, no humidity data available.`);
          return;
        }
  
        humidityData = JSON.parse(fileData);
  
        // Convert humidity readings to numbers for average calculation
        for (let i = 0; i < humidityData.length; i++) {
          humidityData[i].humidity = Number(humidityData[i].humidity);
        }
  
        // Calculate the average humidity
        const numReadings = Math.min(humidityData.length, 100);
        const totalHumidity = humidityData.slice(-numReadings).reduce((sum, data) => sum + data.humidity, 0);
        const averageHumidity = totalHumidity / numReadings;
  
        client.say(channel, `@${tags.username}, the average humidity of the last ${numReadings} readings is ${averageHumidity.toFixed(2)}%.`);
      });
    } else {
      fs.readFile('/var/www/html/chart/humidity.json', 'utf8', (err, fileData) => {
        if (err) {
          console.warn('Unable to read humidity data:', err);
          return;
        }
  
        if (fileData.trim() === '') {
          client.say(channel, `@${tags.username}, no humidity data available.`);
          return;
        }
  
        const humidityData = JSON.parse(fileData);
  
        let numReadings = parseInt(numReadingsOrAvg);
  
        if (isNaN(numReadings) || numReadings < 1) {
          numReadings = 1;
        }
  
        numReadings = Math.min(numReadings, humidityData.length);
  
        const readings = humidityData.slice(-numReadings).map(data => data.humidity);
        client.say(channel, `@${tags.username}, the last ${numReadings} humidity readings are: ${readings.join(', ')}%.`);
      });
    }
  }
  
// Command handler for the !humidity command
if (command === 'humidity') {
    if (args.length !== 1) {
      client.say(channel, `@${tags.username}, please provide the number of readings you want to see (1-100), or 'avg' for the average.`);
    } else {
      const arg = args[0].toLowerCase();
      handleHumidityCommand(arg);
    }
  }
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

// Handle !levelchart command
if (command === 'levelchart') {
  // Read the water level data from the JSON file
  fs.readFile('/var/www/html/chart/waterlevel_data.json', 'utf8', (error, data) => {
    if (error) {
      console.error('Error reading water level data:', error);
      client.say(channel, `Error occurred while retrieving water level data.`);
      return;
    }

   // let waterLevelData;
    try {
      waterLevelData = JSON.parse(data);
    } catch (parseError) {
      console.error('Error parsing water level data:', parseError);
      client.say(channel, `Error occurred while parsing water level data.`);
      return;
    }

    if (waterLevelData.length === 0) {
      client.say(channel, `No water level data available.`);
      return;
    }

    // Generate the chart HTML
    const chartHtml = generateLevelChartHtml(waterLevelData);

    // Generate a unique filename for the chart HTML page
    const filename = `levelchart_${Date.now()}.html`;
    const chartFilePath = `/var/www/html/chart/${filename}`;

    // Write the chart HTML file
    fs.writeFile(chartFilePath, chartHtml, 'utf8', (writeError) => {
      if (writeError) {
        console.error('Error writing chart HTML:', writeError);
        client.say(channel, `Error occurred while generating the chart.`);
      } else {
        const chartUrl = process.env.LVLCHARTURL.replace('${filename}', filename); // Replace with the actual URL where the HTML file will be hosted
        client.say(channel, `Water level chart: ${chartUrl}`);
      }
    });
  });
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
      hostname: process.env.WANIP,
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
  doRequest(process.env.TEMPURL)
    .then((tankTemp) => {
      tankTemp = tankTemp.replace(/<[^>]+>/g, ' ').trim().replace(/ +/, ' ').split(' ');

      const currentTemperature = tankTemp[0];
      const timestamp = Math.floor(Date.now() / 1000);
      const temperatureEntry = { temperature: currentTemperature, timestamp };
      temperatureHistory.push(temperatureEntry);
      const maxTemperatureEntries = 100;
      if (temperatureHistory.length > maxTemperatureEntries) {
        temperatureHistory = temperatureHistory.slice(-maxTemperatureEntries);
      }

      // Save the updated temperature history to the JSON file
      saveTemperatureHistory(temperatureHistory);
    })
    .catch((error) => {
      console.error('Error fetching temperature data:', error);
    })
    .finally(() => {
      // Schedule the next fetch after a specific time interval (e.g., 5 minutes)
      fetchTimeout = setTimeout(fetchAndStoreTemperature, 300000);
    });
}

// Schedule the initial fetch and store
fetchTimeout = setTimeout(fetchAndStoreTemperature, 0);


// Function to save the temperature history to the JSON file
function saveTemperatureHistory(history) {
  const data = JSON.stringify(history);
  fs.writeFileSync(temperatureHistoryFile, data, 'utf8');
}

// Handle !watertemp command
if (command === 'watertemp') {
  if (args[0] === 'avg') {
    if (temperatureHistory.length > 0) { 

    const numericTemperatures = temperatureHistory
       .map(entry => parseFloat(entry.temperature));

   if (numericTemperatures.length > 0) {
    // Calculate the average water temperature
     const sumOfTemperatures = numericTemperatures.reduce((sum, temp) => sum + temp, 0);
     const averageTemperature = sumOfTemperatures / numericTemperatures.length;

    // Round the average temperature to two decimal places
    const roundedAverageTemperature = averageTemperature.toFixed(2);
    console.log(roundedAverageTemperature);
    client.say(channel, `@${tags.username}, The average water temperature is ${roundedAverageTemperature}°F.`);
    }
   }
  }  else if (args[0] === 'current') {
    if (temperatureHistory.length > 0) {
        const currentEntry = temperatureHistory[temperatureHistory.length - 1];
        const currentTemperature = Number(currentEntry.temperature);

        if(!isNaN(currentTemperature)) {
           const formattedTemperature = currentTemperature.toFixed(2);
 
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
            const chartUrl = process.env.CHARTURL.replace('${chartFileName}', chartFileName); // Replace with the actual URL where the HTML file will be hosted
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

  // Handle !waterlevel command
  if (command === 'waterlevel') {
    const waterLevel = await getTankData();
    if (waterLevel !== null) {
      writeWaterLevelData(waterLevel);
      client.say(channel, `Water level recorded: ${waterLevel}`);
    } else {
      client.say(channel, 'Unable to retrieve water level data.');
    }
  }
  

// Handle !commandlist command
if (command === 'commandlist' || command === 'commands') {
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
    '!airtemp avg|1-100 - Get the latest air temp data.',
    '!humidity avg|1-100 - Get the latest humidity data.',
    '!waterlevel - Check water level reading.',
    '!levelchart - Water level chart.',
    '!chart 2-100 - Water temperature chart.',
    '!remindme time[m|h] message [Ex: !remindme 30m Take a break] - Set a reminder message.'
 ];

  const formattedCommands = commands.map(cmd => `${cmd}`).join(', ');
  const message = `available commands ${formattedCommands}`;

  const commandList = commands.join(', ');
  client.say(channel, `@${tags.username}, The ${message}`);
}

  // Handle any message containing 'aquaaibot' (case-insensitive)
  if(message.match(new RegExp(process.env.TWITCH_BOT_USERNAME, 'i')) && tags.username !== process.env.TWITCH_BOT_USERNAME) {
    (async () => {
      var tankData = await doRequest(process.env.TEMPURL); // Replace URL with correct address
      tankData = tankData.replace(/<[^>]+>/g, ' ').trim().replace(/ +/, ' ').split(' ');

    // Check if the user is already in the message history
    if (!userMessageHistory.has(tags.username)) {
      // If not, create a new entry for the user
      userMessageHistory.set(tags.username, []);
    }

    // Get the user's message history
    const messageHistory = userMessageHistory.get(tags.username);

    // Add the current message to the user's message history
    messageHistory.push(message);

    // Keep only the last 50 messages in the history
    if (messageHistory.length > 50) {
      messageHistory.shift(); // Remove the oldest message
    }
      
      // Access the user's message history
      const history = userMessageHistory.get(tags.username);

      // Generate AI response based on the message history
      const prompt = history.join('\n'); // Concatenate the message history into a single prompt
      const maxTokens = 150; // Set the maximum number of tokens for the generated response


      var time = os.uptime();
      var day = parseInt(time / 86400);
      var promptText = process.env.OPENAI_PROMPT
        .replace(/\{botname\}/g, tags['display-name'])
        .replace('{message}', args.join(' ')).trim()
        .replace('{temp}', tankData[0] + '°F')
        .replace('{tds}', tankData[1] + 'PPM')
        .replace('{air}', tankData[2] + '°F')
      // .replace('{tss}', tankData[2] + 'PPM')
        .replace('{level}', tankData[4])
        .replace('{humidity}', tankData[3] + ' percent')
        .replace('{uptime}', day + ' days')
        .replace('{timeFed}', timeSinceLastFed);
        //.replace('{time}', localTime);

      // Add a period if necessary so the bot doesn't try to complete the prompt.
      if (!['.','?'].includes(promptText.slice(-1))) {
        promptText = `${promptText}.}`;
      }
      client.say(channel, `@${tags.username}, ${await generator.generate(promptText)}`);
    })();
    return;
  }
});

