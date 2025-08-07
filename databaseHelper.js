// In lambda/databaseHelper.js

const { DynamoDBClient, PutItemCommand, QueryCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");


// The name of the table we created in the AWS Console.
const TABLE_NAME = "whendiditasks";

// Initialize the DynamoDB Client.
// By default, it will use the credentials and region of the Lambda function.
const dbClient = new DynamoDBClient({});

/**
 * Saves a new task to the DynamoDB table.
 * @param {string} userId - The unique ID for the Alexa user.
 * @param {string} activityText - The text of the activity being logged.
 * @returns {Promise<void>}
 */
async function saveTask(userId, activityText) {
    const timestamp = Date.now();

    const params = {
        TableName: TABLE_NAME,
        Item: {
            'userId': { S: userId },
            'timestamp': { N: timestamp.toString() },
            'text': { S: activityText }
        }
    };

    try {
        console.log(`Attempting to save task for userId: ${userId}`);
        const command = new PutItemCommand(params);
        await dbClient.send(command);
        console.log("Successfully saved task to DynamoDB.");
    } catch (error) {
        console.error("Error saving to DynamoDB:", JSON.stringify(error, null, 2));
        // We re-throw the error so the calling handler knows something went wrong.
        throw error;
    }
}

/**
 * Fetches all tasks for a specific user, sorted by the most recent first.
 * @param {string} userId - The unique ID for the Alexa user.
 * @returns {Promise<Array<Object>>} - A promise that resolves to an array of task objects.
 */
async function getTasks(userId) {
    const params = {
        TableName: TABLE_NAME,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: {
            ":uid": { S: userId }
        },
        ScanIndexForward: false // This sorts the results in descending order (newest first).
    };

    try {
        console.log(`Fetching tasks for userId: ${userId}`);
        const command = new QueryCommand(params);
        const data = await dbClient.send(command);
        
        // The data from DynamoDB is verbose. We need to "unmarshall" it into a simple array of objects.
        const tasks = data.Items.map(item => ({
            text: item.text.S,
            timestamp: Number(item.timestamp.N)
        }));
        
        console.log(`Found ${tasks.length} tasks.`);
        return tasks;
        
    } catch (error) {
        console.error("Error fetching from DynamoDB:", JSON.stringify(error, null, 2));
        throw error;
    }
}

/**
 * Deletes a single task from DynamoDB using its primary key (userId and timestamp).
 * @param {string} userId - The unique ID for the Alexa user.
 * @param {number} timestamp - The precise timestamp of the task to delete.
 * @returns {Promise<void>}
 */
async function deleteTask(userId, timestamp) {
    const params = {
        TableName: TABLE_NAME,
        Key: {
            'userId': { S: userId },
            'timestamp': { N: timestamp.toString() }
        }
    };
    try {
        console.log(`Attempting to delete task at timestamp: ${timestamp}`);
        const command = new DeleteItemCommand(params);
        await dbClient.send(command);
        console.log("Successfully deleted task.");
    } catch (error) {
        console.error("Error deleting item from DynamoDB:", error);
        throw error;
    }
}

/**
 * Deletes all tasks for a given user.
 * @param {string} userId - The unique ID for the Alexa user.
 * @returns {Promise<void>}
 */
async function deleteAllTasks(userId) {
    // First, get all the tasks to identify what we need to delete.
    const tasksToDelete = await getTasks(userId);

    if (tasksToDelete.length === 0) {
        console.log("No tasks to delete.");
        return;
    }

    // DynamoDB's BatchWriteItem is complex, so for simplicity, we'll delete them one by one.
    // This is perfectly fine for the small number of items in a personal skill.
    for (const task of tasksToDelete) {
        const params = {
            TableName: TABLE_NAME,
            Key: {
                'userId': { S: userId },
                'timestamp': { N: task.timestamp.toString() }
            }
        };
        const command = new DeleteItemCommand(params);
        await dbClient.send(command);
    }
    console.log(`Successfully deleted ${tasksToDelete.length} tasks.`);
}

// Make these functions available to our index.js file.
module.exports = { saveTask, getTasks, deleteTask, deleteAllTasks };