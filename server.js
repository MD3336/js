// === المكتبات ===
const TelegramBot = require('node-telegram-bot-api');

// === توكن البوت ===
const token = "8200705833:AAHiJUK6y4FCaN4FQaaRVCmq3odt1Axqr50";
const bot = new TelegramBot(token, { polling: true });

// === رسالة البداية ===
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `أهلا بك! هذا بوت تجريبي.`);
});

// === أي رسالة يرسلها المستخدم ===
bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    // تجاهل الرسائل التي هي أوامر
    if (msg.text.startsWith('/')) return;

    // إعادة إرسال الرسالة مع تعليق
    bot.sendMessage(chatId, `لقد أرسلت: "${msg.text}"`);
});

// === للتأكد من تشغيل البوت ===
console.log("بوت التجربة يعمل الآن...");
