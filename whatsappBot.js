const { default: makeWASocket, DisconnectReason, useSingleFileAuthState } = require('@adiwajshing/baileys');
const axios = require('axios');
const hf = require('@huggingface/inference');
const cron = require('node-cron');
const { state, saveState } = useSingleFileAuthState('./auth_info.json');

// Initialize Hugging Face Inference API
const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;  // Your Hugging Face API key
const huggingFace = new hf.HfInference(HUGGINGFACE_API_KEY);

// Function to summarize text using Hugging Face
async function summarizeText(text) {
    const summary = await huggingFace.summarization({ inputs: text });
    return summary[0].summary_text;
}

// Function to fetch top tech news
async function getTechNews() {
    const NEWS_API_KEY = process.env.NEWS_API_KEY;  // Your NewsAPI key
    const response = await axios.get('https://newsapi.org/v2/top-headlines', {
        params: { category: 'technology', country: 'us', apiKey: NEWS_API_KEY }
    });
    return response.data.articles.slice(0, 3);  // Return the top 3 articles
}

// Function to fetch and summarize top news
async function getSummarizedNews() {
    const articles = await getTechNews();
    let summarizedNews = '';

    for (const article of articles) {
        const summary = await summarizeText(article.description || article.title);
        summarizedNews += `Title: ${article.title}\nSummary: ${summary}\nLink: ${article.url}\n\n`;
    }
    return summarizedNews;
}

// Start WhatsApp bot connection
async function startBot() {
    const socket = makeWASocket({ auth: state });

    // Save session when disconnected or QR changes
    socket.ev.on('creds.update', saveState);

    // Handle disconnection
    socket.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                startBot();
            }
        }
    });

    // When a message is received
    socket.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        const chatId = msg.key.remoteJid;

        if (msg.message?.conversation.toLowerCase() === 'news') {
            const summarizedNews = await getSummarizedNews();
            await socket.sendMessage(chatId, { text: summarizedNews });
        }
    });

    // Schedule daily tech news at 8 AM
    cron.schedule('0 8 * * *', async () => {
        const summarizedNews = await getSummarizedNews();
        const chatId = 'YOUR_WHATSAPP_NUMBER@s.whatsapp.net';  // Replace with your WhatsApp number
        await socket.sendMessage(chatId, { text: `Good morning! Here’s your daily tech update:\n\n${summarizedNews}` });
    });
}

// Start the bot
startBot();
