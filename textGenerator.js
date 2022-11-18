require('dotenv').config();
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

async function generate(promptText) {
  const completion = await openai.createCompletion({
    model: process.env.OPENAI_MODEL,
    prompt: promptText,
    max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS),
    temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
    frequency_penalty: parseFloat(process.env.OPENAI_FREQ_PENALTY),
  });

  // Try 3 times to get a non-conversational response...
  if (completion.data.choices[0].text.match(/:.+:/g)) {
    console.log('OpenAI being dumb...');
    const completion = await openai.createCompletion({
      model: process.env.OPENAI_MODEL,
      prompt: promptText,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
      frequency_penalty: parseFloat(process.env.OPENAI_FREQ_PENALTY),
    });
  }
  if (completion.data.choices[0].text.match(/:.+:/g)) {
    console.log('OpenAI being dumb...');
    const completion = await openai.createCompletion({
      model: process.env.OPENAI_MODEL,
      prompt: promptText,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
      frequency_penalty: parseFloat(process.env.OPENAI_FREQ_PENALTY),
    });
  }
  if (completion.data.choices[0].text.match(/:.+:/g)) {
    console.log('OpenAI being dumb...');
    const completion = await openai.createCompletion({
      model: process.env.OPENAI_MODEL,
      prompt: promptText,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS),
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE),
      frequency_penalty: parseFloat(process.env.OPENAI_FREQ_PENALTY),
    });
  }

  return completion.data.choices[0].text;
}

module.exports = { generate };
