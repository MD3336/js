// === المكتبات ===
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');

// === إعداد Supabase ===
const SUPABASE_URL = "https://fkjnjiqewakjfggozjxz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZram5qaXFld2FramZnZ296anh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0ODQwMDUsImV4cCI6MjA3MTA2MDAwNX0.3p6GCTasy8luARLuCoROJ3BilSzjdOIfLjo7-g0PDBg";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === إعداد Telegram Bot ===
const token = "7132216283:AAFD9ABqmpd8juzxX96D3I7HS5eECS_-g2E";
const bot = new TelegramBot(token); // بدون polling

// === Express Web Server ===
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('Bot is running!'));

const PORT = process.env.PORT || 3000;
const URL = "https://js-m5q0.onrender.com"; // رابط موقعك على Render

// === Webhook ===
bot.setWebHook(`${URL}/bot${token}`);

app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// === متغيرات عامة ===
const userState = {};
const chatPairs = {};
const waitingUsers = [];
const ignoredUsers = new Set();
const activeUsers = new Set();
const adminIds = [1298076494, 215790261];

// === دوال قاعدة البيانات ===
async function isBanned(userId) {
    const { data } = await supabase.from('banned_users').select('*').eq('user_id', userId);
    return data.length > 0;
}

async function getUser(userId) {
    const { data } = await supabase.from('users').select('*').eq('id', userId);
    return data[0];
}

async function addUser(userId, name, gender) {
    const existing = await getUser(userId);
    if (!existing) await supabase.from('users').insert([{ id: userId, name, gender }]);
}

async function updateUserName(userId, name) {
    await supabase.from('users').update({ name }).eq('id', userId);
}

async function addReport(reporterId, reportedId, reason, photo=null) {
    await supabase.from('reported_users').insert([{ reporter_id: reporterId, reported_id: reportedId, reason, photo }]);
}

async function getAllReports() {
    const { data } = await supabase.from('reported_users').select('*');
    return data;
}

async function banUser(userId) {
    await supabase.from('banned_users').insert([{ user_id: userId }]);
}

async function unbanUser(userId) {
    await supabase.from('banned_users').delete().eq('user_id', userId);
}

// === دوال البحث والمغادرة ===
function chunkArray(array, size) {
    const result = [];
    for (let i=0; i<array.length; i+=size) result.push(array.slice(i, i+size));
    return result;
}

async function findChat(userId) {
    if (chatPairs[userId]) return bot.sendMessage(userId, 'أنت بالفعل في دردشة');

    let otherUser;
    for (let i=0; i<waitingUsers.length; i++){
        if(!ignoredUsers.has(waitingUsers[i])){
            otherUser = waitingUsers.splice(i,1)[0];
            break;
        }
    }

    if(otherUser){
        chatPairs[userId] = otherUser;
        chatPairs[otherUser] = userId;
        activeUsers.add(userId);
        activeUsers.add(otherUser);
        const opts = { reply_markup: { inline_keyboard: [[{ text:'مغادرة', callback_data:'leave_chat' }]] } };
        Promise.all([getUser(userId), getUser(otherUser)]).then(([user, other])=>{
            bot.sendMessage(userId, `لقد وجدنا 🫣 ${other.name} لك يمكنكما التحدث الآن`, opts);
            bot.sendMessage(otherUser, `لقد وجدنا 🫣 ${user.name} لك يمكنكما التحدث الآن`, opts);
        });
    } else {
        if(!waitingUsers.includes(userId)) waitingUsers.push(userId);
        bot.sendMessage(userId,'جار 🔍 البحث عن حدا 🕑');
        setTimeout(()=>checkWaitingUsers(userId),30000);
    }
}

function checkWaitingUsers(userId){
    if(waitingUsers.includes(userId)){
        waitingUsers.splice(waitingUsers.indexOf(userId),1);
        const opts = { reply_markup:{ inline_keyboard:[[ {text:'دور منيح 👀', callback_data:'find_chat'}]] }};
        bot.sendMessage(userId,"شكلو ما حدا بدو يحكي معك 😂",opts);
    }
}

async function leaveChat(userId){
    if(!chatPairs[userId]) return;
    const otherId = chatPairs[userId];
    delete chatPairs[userId];
    delete chatPairs[otherId];
    activeUsers.delete(userId);
    activeUsers.delete(otherId);

    ignoredUsers.add(userId);
    ignoredUsers.add(otherId);
    setTimeout(()=>{ ignoredUsers.delete(userId); ignoredUsers.delete(otherId); },10000);

    Promise.all([getUser(userId), getUser(otherId)]).then(([user, other])=>{
        bot.sendMessage(userId,"ليش غادرت 🤨");
        bot.sendMessage(otherId,`لقد غادر ${user.name} هذه الدردشة 🤬`);
        const opts = { reply_markup:{ inline_keyboard:[[ {text:'دور على شي حدا😐', callback_data:'find_chat'}]] }};
        bot.sendMessage(userId,"شو رأيك تدور على شي حدا تحكي معو 😋",opts);
        bot.sendMessage(otherId,"شو رأيك ارجع ادورلك على شي حدا 🥹",opts);
    });
}

// === Callback Queries ===
bot.on('callback_query', async cb=>{
    const userId = cb.message.chat.id;
    const data = cb.data;

    if(await isBanned(userId)) return bot.sendMessage(userId,"أنت محظور من استخدام البوت 😐");

    if(data==='find_chat') findChat(userId);
    else if(data==='leave_chat') leaveChat(userId);
    else if(data==='view_reports'){
        const reports = await getAllReports();
        if(reports.length===0) return bot.sendMessage(userId,"لا يوجد بلاغات حاليا");
        for(let r of reports){
            const reporter = await getUser(r.reporter_id);
            const reported = await getUser(r.reported_id);
            const msgText = `بلاغ جديد:\nمقدم البلاغ: ${reporter.name} (ID:${r.reporter_id})\nالمستخدم المبلغ عنه: ${reported.name} (ID:${r.reported_id})\nالسبب: ${r.reason}`;
            for(let admin of adminIds){
                bot.sendMessage(admin,msgText);
                if(r.photo) bot.sendPhoto(admin,r.photo);
            }
        }
    }
});

// === الرسائل ===
bot.on('message', async msg=>{
    const userId = msg.chat.id;
    const text = msg.text;
    if(!text) return;

    if(userState[userId]){
        const step = userState[userId].step;
        if(step==='awaiting_name'){
            userState[userId].name = text;
            bot.sendMessage(userId,"الآن، أرسل جنسك (ذكر/أنثى):");
            userState[userId].step='awaiting_gender';
        } else if(step==='awaiting_gender'){
            if(text.toLowerCase()==='ذكر' || text.toLowerCase()==='أنثى'){
                await addUser(userId,userState[userId].name,text.toLowerCase());
                delete userState[userId];
                const opts = { reply_markup:{ inline_keyboard:[[ {text:'أبدا بحث', callback_data:'find_chat'}]] }};
                bot.sendMessage(userId,`تم التسجيل بنجاح! مرحبًا ${text}`,opts);
            } else bot.sendMessage(userId,"من فضلك أرسل جنسك (ذكر/أنثى):");
        }
        return;
    }

    if(chatPairs[userId]){
        const otherId = chatPairs[userId];
        const user = await getUser(userId);
        bot.sendMessage(otherId,`${user.name}: ${text}`);
    }
});
