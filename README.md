# When Did I? - An AI-Powered Memory Assistant for Alexa

<p align="center">
  <img src="https://img.shields.io/badge/platform-Alexa-blue.svg" alt="Platform Alexa">
  <img src="https://img.shields.io/badge/tech-Node.js-green.svg" alt="Tech Node.js">
  <img src="https://img.shields.io/badge/database-DynamoDB-orange.svg" alt="Database DynamoDB">
  <img src="https://img.shields.io/badge/AI-Google%20Gemini-purple.svg" alt="AI Google Gemini">
  <img src="https://img.shields.io/github/license/YOUR_USERNAME/YOUR_REPO_NAME" alt="License">
</p>

Ever forget when you last watered the plants, paid a bill, or called a relative? **When Did I?** is a smart, voice-powered logbook for Amazon Alexa that takes the mental load off remembering life's small but important tasks.

This skill uses the Google Gemini API to understand natural language queries, allowing users to log and retrieve activities without needing to remember specific phrases or dates.

<!-- A GIF demonstrating the skill in action would be perfect here -->

## ✨ Key Features

- **🗣️ Natural Language Logging:** Simply tell Alexa what you've done.
  - *"Alexa, tell When Did I that I replaced the air filter."*
  - *"Alexa, tell When Did I I paid the electric bill."*

- **🧠 AI-Powered Queries:** Ask questions naturally and get intelligent answers. The skill uses an LLM to find the most relevant entry, even if your question doesn't match the log word-for-word.
  - *"Alexa, ask When Did I when did I last deal with the car?"*
  - *"Alexa, ask When Did I if I fed the dog today?"*

- **📅 Date-Based Summaries:** Review your activities for a specific day or relative timeframe.
  - *"Alexa, ask When Did I what I did yesterday?"*
  - *"Alexa, ask When Did I what I did on August 5th?"*

- **🗑️ Smart Deletion:** Remove specific entries with AI-powered matching and user confirmation.
  - *"Alexa, ask When Did I to delete my task about the air filter."*

- **🧹 Full Log Clearing:** Start fresh with a simple command to clear all your tasks.
  - *"Alexa, ask When Did I to clear all tasks."*

- **⏳ Progressive Responses:** Get immediate feedback like "Let me check..." while the skill processes longer requests, improving the user experience.

- **🌐 Timezone Aware:** Automatically uses your device's timezone for accurate, localized timestamps.

## 🛠️ Tech Stack

- **Backend:** Node.js on AWS Lambda
- **Voice Platform:** Alexa Skills Kit (ASK) SDK v2 for Node.js
- **Database:** Amazon DynamoDB for persistent, user-specific storage.
- **Natural Language Understanding:** Google Gemini API for intelligent querying and task matching.
- **Permissions:** AWS IAM for secure access between services.

## ⚙️ Setup and Deployment

### Prerequisites

- [Amazon Developer Account](https://developer.amazon.com/)
- [AWS Account](https://aws.amazon.com/)
- [Node.js](https://nodejs.org/) (v18.x or later recommended)
- [AWS CLI](https://aws.amazon.com/cli/), configured with your credentials.
- [Google AI Studio](https://aistudio.google.com/) or Google Cloud project to obtain a Gemini API Key.

### 1. Backend Setup (AWS)

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
    cd YOUR_REPO_NAME
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Create DynamoDB Table:**
    Create a DynamoDB table to store user tasks.
    - **Table Name:** `when-did-i-tasks` (or your choice)
    - **Primary Key:** `userId` (String)

4.  **Create IAM Role for Lambda:**
    Create an IAM role that your Lambda function will use. Attach the following policies:
    - `AWSLambdaBasicExecutionRole` (for CloudWatch logs)
    - A custom inline policy granting access to your DynamoDB table:
      ```json
      {
          "Version": "2012-10-17",
          "Statement": [
              {
                  "Effect": "Allow",
                  "Action": [
                      "dynamodb:GetItem",
                      "dynamodb:PutItem",
                      "dynamodb:UpdateItem",
                      "dynamodb:DeleteItem",
                      "dynamodb:Query"
                  ],
                  "Resource": "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/YOUR_TABLE_NAME"
              }
          ]
      }
      ```

5.  **Configure Environment Variables:**
    Create a `.env` file in the `lambda` directory and add your credentials.
    ```
    # .env
    GEMINI_API_KEY="your_google_gemini_api_key"
    DYNAMODB_TABLE_NAME="when-did-i-tasks"
    ```

6.  **Deploy the Lambda Function:**
    Zip the contents of the `lambda` directory and upload it to a new AWS Lambda function.
    - **Runtime:** Node.js 18.x
    - **Handler:** `index.handler`
    - **Execution Role:** Use the IAM role you created in the previous step.
    - **Add a trigger:** Select "Alexa Skills Kit".

### 2. Frontend Setup (Alexa Developer Console)

1.  Create a new Alexa skill in the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask).
2.  Choose **Custom** model and **Provision your own** backend.
3.  Go to the **Interaction Model > JSON Editor** tab and paste the contents of `skill-package/interactionModels/custom/en-US.json`.
4.  In the **Endpoint** section, paste the ARN of the Lambda function you deployed.
5.  Under the **Permissions** tab, enable **"System > Timezone"**.
6.  Save the model, build it, and start testing!

## 🎤 Usage

You can interact with the skill in two primary ways:

#### Method 1: Open and Interact (Conversational)

1.  **You:** "Alexa, open When Did I"
2.  **Alexa:** "Welcome to When Did I. What would you like to log or ask?"
3.  **You:** "Log that I watered the roses" or "When did I last pay rent?"

#### Method 2: Direct Commands (One-Shot)

1.  **You:** "Alexa, tell When Did I that I watered the garden"
2.  **Alexa:** "Okay, I've logged that you watered the garden."

---

*Later that week...*

**You:** "Alexa, ask When Did I when I last tended to the plants?"
**Alexa:** *(Progressive Response)* "Let me search through your activity log... *(Final Response)* You logged 'watered the garden' on Tuesday, August 6th at 2:30 PM."

## 🤝 Contributing

Contributions are welcome! Please feel free to fork the repository, make changes, and submit a pull request. For major changes, please open an issue first to discuss what you would like to change.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
