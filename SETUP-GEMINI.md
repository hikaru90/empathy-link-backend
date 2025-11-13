# Gemini AI Setup Instructions

## 1. Install the Gemini SDK

Run this command in the backend directory:

```bash
npm install @google/genai
```

## 2. Get Your Gemini API Key

1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the API key

## 3. Add API Key to Environment

Open `.env` file and replace `your_api_key_here` with your actual API key:

```
GEMINI_API_KEY=your_actual_api_key_here
```

## 4. Restart the Server

Stop the server (Ctrl+C) and start it again:

```bash
npm run dev
```

## Testing

Once set up, you can test the chat functionality:

1. Open the Expo app
2. Navigate to the Chat tab
3. Type a message and send
4. You should get an AI response using Gemini!

## What's Implemented

- ✅ Gemini AI integration with retry logic
- ✅ Chat history management with sliding window
- ✅ System prompts based on conversation path
- ✅ User preferences (answer length, tone, NVC level)
- ✅ Encrypted chat storage
- ✅ Error handling with helpful messages

## Configuration

The AI is configured with:
- **Model:** gemini-2.5-flash (fast and efficient)
- **Temperature:** 0.7 (balanced creativity)
- **Max tokens:** 8192
- **History window:** Last 20 messages (to stay within context limits)
- **Retries:** 3 attempts with exponential backoff

## Troubleshooting

**"AI service not configured"**
- Make sure you added GEMINI_API_KEY to .env
- Restart the server after adding the key

**"API key" errors**
- Check that your API key is valid
- Verify it's not expired
- Make sure there are no extra spaces in .env

**"quota" or "limit" errors**
- You might have exceeded the free tier limits
- Wait a few minutes and try again
- Consider upgrading your Gemini account

**Rate limiting**
- The system will automatically retry with exponential backoff
- If it persists, wait a few minutes
