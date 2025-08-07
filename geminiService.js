// geminiService.js for AWS Lambda with timezone handling

const { GoogleGenAI } = require("@google/genai");

// Using the recommended model name as per guidelines.
const GEMINI_MODEL_NAME = 'gemini-2.5-flash';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("FATAL: API_KEY environment variable is not set for Gemini API. The function will not work correctly.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY || "MISSING_API_KEY_PLACEHOLDER" });

/**
 * Generates an answer based on user query and task history using Gemini API.
 * @param {string} userQuery The user's question.
 * @param {Array<{id: string, text: string, timestamp: number}>} tasks The list of logged tasks.
 * @param {string} userTimezone The user's timezone (e.g., "America/Chicago")
 * @returns {Promise<{answer: string, sources: Array}>} The generated answer and any sources.
 */
async function getAnswerFromTasks(userQuery, tasks, userTimezone = 'America/Chicago') {
  if (!API_KEY) {
    return { 
      answer: "Error: API_KEY for Gemini API is not configured. Please set the API_KEY environment variable in the Lambda function configuration.", 
      sources: [] 
    };
  }

  console.log(`Using user timezone: ${userTimezone}`);
  
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: userTimezone
  });

  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: userTimezone
  });

  const formattedTasks = tasks && tasks.length > 0
    ? tasks.map(task => {
        const taskDate = new Date(task.timestamp);
        const formattedDateTime = taskDate.toLocaleString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: userTimezone
        });
        return `- "${task.text}" was logged on ${formattedDateTime}.`;
      }).join('\n')
    : "No tasks have been logged yet.";

  const prompt = `
You are an AI assistant for the "When Did I?" app. Your goal is to help users recall when they performed certain tasks or if they performed them on a specific day, based ONLY on the list of tasks they've logged.

Today's date is: ${currentDate}.
Current time is: ${currentTime}.

Here is the list of tasks the user has logged:
${formattedTasks}

Now, please answer the user's question: "${userQuery}"

Guidelines for your response:
1. Base your answer strictly on the provided task list. Do not make assumptions or use external knowledge.
2. If the user asks "when did I do X?", find all occurrences of X and list the dates/times. If not found, say so.
3. If the user asks "did I do X today?", check if X was logged with today's date (${currentDate}). Answer "Yes, you logged X today at [time]" or "No, you did not log X today according to the list." or "I could not find task X in your log."
4. If the user asks "what did I do on [date]?", find all tasks logged on that specific date and list them. If none are found, state that no activities were logged on that day.
5. If the task list is empty and the user asks a question, state that no tasks have been logged.
6. Keep your answers concise and directly address the question.
7. If a task description is vague, and the query is specific, you might need to indicate that a direct match wasn't found but similar tasks were.
8. When mentioning times, use the user's local timezone context.
`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_NAME,
      contents: prompt,
      config: {
        tools: userQuery.toLowerCase().includes("weather") || userQuery.toLowerCase().includes("news") || userQuery.toLowerCase().includes("current events") ? [{googleSearch: {}}] : []
      }
    });
    
    const answer = response.text;
    const sources = response.candidates || [];
    return { answer, sources };

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    let errorMessage = "An error occurred while trying to get an answer from Gemini.";
    if (error instanceof Error) {
        errorMessage = `Error: ${error.message}`;
    }
    if (typeof error === 'string' && error.includes('API key not valid')) {
        errorMessage = "Error: The provided API_KEY is not valid. Please check your configuration.";
    }
    return { answer: errorMessage, sources: [] };
  }
}

/**
 * Asks Gemini to find the timestamp of the single best task match from a list.
 */
async function findTaskToDelete(deleteQuery, tasks) {
  if (!API_KEY || tasks.length === 0) {
      return null;
  }

  const formattedTasksForPrompt = tasks.map(task => 
      `{ "timestamp": ${task.timestamp}, "text": "${task.text}" }`
  ).join('\n');

  const prompt = `
You are an AI assistant. Your job is to find the single best match from the list of tasks below based on the user's request.
Here is the list of logged tasks in JSON format:
${formattedTasksForPrompt}
The user wants to delete the task related to: "${deleteQuery}"
Your response MUST be ONLY the numeric timestamp of the single most relevant task. Do not include any other text. If no reasonable match is found, respond with the word "null".`;

  try {
      const response = await ai.models.generateContent({
          model: GEMINI_MODEL_NAME,
          contents: prompt,
          config: {
            tools: deleteQuery.toLowerCase().includes("weather") || deleteQuery.toLowerCase().includes("news") || deleteQuery.toLowerCase().includes("current events") ? [{googleSearch: {}}] : []
          }
      });

      const responseText = response.text;
      console.log(`Gemini identified timestamp for deletion: ${responseText}`);
      
      const timestamp = parseInt(responseText, 10);
      return isNaN(timestamp) ? null : timestamp;

  } catch (error) {
      console.error("Error asking Gemini to find task for deletion:", error);
      return null;
  }
}

// Exporting both functions for index.js to use
module.exports = { getAnswerFromTasks, findTaskToDelete };