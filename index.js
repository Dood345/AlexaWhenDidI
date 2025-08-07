// In lambda/index.js

const Alexa = require('ask-sdk-core');
// Bringing our helpers into the main file
const { getAnswerFromTasks, findTaskToDelete } = require('./geminiService.js');
const { saveTask, getTasks, deleteTask, deleteAllTasks } = require('./databaseHelper.js');

// This handler runs when the user says "Alexa, open When Did I"
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = 'Welcome to When Did I. You can log an activity by saying, "log that I watered the plants", or ask a question like, "when did I last water the plants?"';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

// HANDLER 1: UPDATED LOGIC
const LogActivityIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LogActivityIntent';
    },
    async handle(handlerInput) {
        // Get the value of the {activity} slot that the user spoke
        const activity = Alexa.getSlotValue(handlerInput.requestEnvelope, 'activity');
        // Get the unique user ID to keep data separate
        const userId = handlerInput.requestEnvelope.session.user.userId;
        
        let speakOutput = '';

        if (activity) {
            try {
                // Call our helper function to save the task to DynamoDB
                await saveTask(userId, activity);
                speakOutput = `Okay, I've logged that you ${activity}.`;
            } catch (error) {
                console.error("Error in LogActivityIntentHandler:", error);
                speakOutput = "I'm sorry, I had a problem saving that activity. Please try again.";
            }
        } else {
            speakOutput = "I didn't quite catch the activity. Please try again, for example by saying 'log that I watered the plants'.";
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

// HANDLER 2: UPDATED LOGIC
// Updated QueryActivityIntentHandler with timezone support
// Updated QueryActivityIntentHandler with "searching" message
const QueryActivityIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'QueryActivityIntent';
    },
    async handle(handlerInput) {
        const query = Alexa.getSlotValue(handlerInput.requestEnvelope, 'query');
        const date = Alexa.getSlotValue(handlerInput.requestEnvelope, 'date');
        const userId = handlerInput.requestEnvelope.session.user.userId;

        let speakOutput = '';
        let userQuestion = '';

        // Determine the type of question the user asked
        if (query) {
            userQuestion = query;
        } else if (date) {
            userQuestion = `What did I do on ${date}?`;
        }
        
        if (userQuestion) {
            try {
                // First, give immediate feedback that we're processing
                const searchingMessage = "<speak>Let me search through your activity log.</speak>";
                
                // Use progressive response to give immediate feedback
                // This tells the user we're working on it while we process
                if (handlerInput.requestEnvelope.context.System.apiAccessToken) {
                    try {
                        const requestId = handlerInput.requestEnvelope.request.requestId;
                        const apiEndpoint = handlerInput.requestEnvelope.context.System.apiEndpoint;
                        const token = handlerInput.requestEnvelope.context.System.apiAccessToken;
                        
                        const progressiveResponse = {
                            header: {
                                requestId: requestId
                            },
                            directive: {
                                type: "VoicePlayer.Speak",
                                speech: searchingMessage
                            }
                        };

                        //console.log("Sending progressive response to:", `${apiEndpoint}/v1/directives`);
                        //console.log("Progressive payload:", JSON.stringify(progressiveResponse, null, 2));
                        
                        const response = await fetch(`${apiEndpoint}/v1/directives`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify(progressiveResponse)
                        });

                        //console.log("Progressive response status:", response.status);
                        //console.log("Progressive response ok:", response.ok);
                        
                        console.log("Progressive response sent successfully");
                    } catch (progressiveError) {
                        console.log("Progressive response failed, continuing without it:", progressiveError.message);
                    }
                }

                // Extract user's timezone
                let userTimezone = 'America/Chicago';
                try {
                    const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
                    const apiEndpoint = handlerInput.requestEnvelope.context.System.apiEndpoint;
                    const apiAccessToken = handlerInput.requestEnvelope.context.System.apiAccessToken;
                    
                    if (deviceId && apiEndpoint && apiAccessToken) {
                        const timezoneApiUrl = `${apiEndpoint}/v2/devices/${deviceId}/settings/System.timeZone`;
                        const response = await fetch(timezoneApiUrl, {
                            headers: { 'Authorization': `Bearer ${apiAccessToken}` }
                        });
                        
                        if (response.ok) {
                            userTimezone = (await response.text()).replace(/"/g, '');
                            console.log(`Retrieved user timezone: ${userTimezone}`);
                        }
                    }
                } catch (error) {
                    console.log(`Error getting user timezone: ${error.message}. Using default.`);
                }

                // 1. Fetch all tasks for this user from the database
                const tasks = await getTasks(userId);
                
                // 2. Send the user's question, their tasks, and timezone to Gemini
                const geminiResponse = await getAnswerFromTasks(userQuestion, tasks, userTimezone);
                
                // 3. The answer from Gemini becomes what Alexa says
                speakOutput = geminiResponse.answer;

            } catch (error) {
                console.error("Error in QueryActivityIntentHandler:", error);
                speakOutput = "I'm sorry, I had a problem getting an answer for you. Please try again.";
            }
        } else {
            speakOutput = "I didn't quite catch your question. Please try again.";
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

// Updated Delete Handlers with Confirmation

const DeleteTaskIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'DeleteTaskIntent';
    },
    async handle(handlerInput) {
        const taskToDeleteQuery = Alexa.getSlotValue(handlerInput.requestEnvelope, 'taskToDelete');
        const userId = handlerInput.requestEnvelope.session.user.userId;
        let speakOutput = '';
        
        if (taskToDeleteQuery) {
            try {
                // Step 1: Get all tasks
                const allTasks = await getTasks(userId);
                
                if (allTasks.length > 0) {
                    // Step 2: Ask Gemini to find the right one
                    const timestampToDelete = await findTaskToDelete(taskToDeleteQuery, allTasks);

                    if (timestampToDelete) {
                        // Step 3: If found, ask for confirmation
                        const taskToDelete = allTasks.find(t => t.timestamp === timestampToDelete);
                        
                        // Get user's timezone for better date formatting
                        let userTimezone = 'America/New_York';
                        try {
                            const deviceId = handlerInput.requestEnvelope.context.System.device.deviceId;
                            const apiEndpoint = handlerInput.requestEnvelope.context.System.apiEndpoint;
                            const apiAccessToken = handlerInput.requestEnvelope.context.System.apiAccessToken;
                            
                            if (deviceId && apiEndpoint && apiAccessToken) {
                                const timezoneApiUrl = `${apiEndpoint}/v2/devices/${deviceId}/settings/System.timeZone`;
                                const response = await fetch(timezoneApiUrl, {
                                    headers: { 'Authorization': `Bearer ${apiAccessToken}` }
                                });
                                if (response.ok) {
                                    userTimezone = (await response.text()).replace(/"/g, '');
                                }
                            }
                        } catch (error) {
                            console.log(`Error getting timezone for delete confirmation: ${error.message}`);
                        }
                        
                        const taskDate = new Date(taskToDelete.timestamp);
                        const formattedDate = taskDate.toLocaleString('en-US', {
                            weekday: 'long',
                            month: 'long', 
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true,
                            timeZone: userTimezone
                        });
                        
                        // Store the timestamp in session attributes for the confirmation handler
                        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
                        sessionAttributes.pendingDeleteTimestamp = timestampToDelete;
                        sessionAttributes.pendingDeleteText = taskToDelete.text;
                        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
                        
                        speakOutput = `I found the task "${taskToDelete.text}" from ${formattedDate}. Should I delete it? Say yes to delete or no to cancel.`;
                        
                        return handlerInput.responseBuilder
                            .speak(speakOutput)
                            .reprompt("Should I delete this task? Say yes to delete or no to cancel.")
                            .getResponse();
                            
                    } else {
                        speakOutput = `I'm sorry, I couldn't find a task related to "${taskToDeleteQuery}" in your log.`;
                    }
                } else {
                    speakOutput = "You don't have any tasks to delete.";
                }
            } catch (error) {
                console.error("Error in DeleteTaskIntentHandler:", error);
                speakOutput = "Sorry, I had a problem finding that task.";
            }
        } else {
            speakOutput = "I'm not sure which task you want to delete. Please be more specific, for example, say 'delete my task about watering plants'.";
        }

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

// New handler for confirmation responses
const ConfirmDeleteIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent' 
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent')
            && handlerInput.attributesManager.getSessionAttributes().pendingDeleteTimestamp;
    },
    async handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const userId = handlerInput.requestEnvelope.session.user.userId;
        let speakOutput = '';

        if (intentName === 'AMAZON.YesIntent') {
            // User confirmed deletion
            try {
                await deleteTask(userId, sessionAttributes.pendingDeleteTimestamp);
                speakOutput = `Okay, I've deleted the task "${sessionAttributes.pendingDeleteText}".`;
            } catch (error) {
                console.error("Error confirming task deletion:", error);
                speakOutput = "Sorry, I had a problem deleting that task.";
            }
        } else {
            // User cancelled deletion
            speakOutput = "Okay, I won't delete that task.";
        }

        // Clear the pending deletion from session
        delete sessionAttributes.pendingDeleteTimestamp;
        delete sessionAttributes.pendingDeleteText;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const ClearAllTasksIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ClearAllTasksIntent';
    },
    async handle(handlerInput) {
        const userId = handlerInput.requestEnvelope.session.user.userId;
        let speakOutput = '';

        try {
            await deleteAllTasks(userId);
            speakOutput = 'Okay, I have cleared all of your tasks. You now have a clean slate.';
        } catch (error) {
            console.error("Error in ClearAllTasksIntentHandler:", error);
            speakOutput = "Sorry, I had a problem clearing your tasks.";
        }
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = `You can do four things with When Did I. 
        First, you can log an activity, like 'log that I watered the roses'. 
        Second, you can ask a question, like 'when did I last water the plants?'. 
        Third, you can delete a specific task by saying, 'delete my task about the bills'. 
        And finally, if you want a clean slate, you can say, 'clear all tasks'. 
        What would you like to do?`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
        return handlerInput.responseBuilder.getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`Error handled: ${error.stack}`);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

// The skill building logic.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        LogActivityIntentHandler,
        QueryActivityIntentHandler,
        DeleteTaskIntentHandler,
        ConfirmDeleteIntentHandler,
        ClearAllTasksIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler
    )
    .addErrorHandlers(
        ErrorHandler
    )
    .lambda();