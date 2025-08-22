const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cron = require('node-cron');
const pm2 = require('pm2');
const { createClient } = require('@supabase/supabase-js');

// Supabase
const SUPABASE_URL = "https://fkjnjiqewakjfggozjxz.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZram5qaXFld2FramZnZ296anh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0ODQwMDUsImV4cCI6MjA3MTA2MDAwNX0.3p6GCTasy8luARLuCoROJ3BilSzjdOIfLjo7-g0PDBg";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables
let bot = null;
const waitingUsers = [];
const activeUsers = new Set();
const ignoredUsers = new Set();
const userState = {};
const adminIds = [1298076494, 215790261]; // أدمنية

// Express
const app = express();
const server = http.createServer(app);
app.get('/', (req,res)=> res.send('Bot is running!'));
server.listen(3000, () => console.log('Server listening on port 3000'));

// WebSocket
const wss = new WebSocket.Server({ server });
wss.on('connection', ws => ws.on('message', msg => console.log('WS:', msg)));

// Cron
cron.schedule('* * * * *', ()=> console.log('Task running every minute'));

// PM2
pm2.connect(err => { if(err) console.error(err); pm2.start({script:'bot.js',name:'telegram-bot'}); });

// Supabase helpers
async function saveUser(userId,name,gender){ await supabase.from('users').upsert({id:userId,name,gender}); }
async function getUser(userId){ const {data} = await supabase.from('users').select('*').eq('id',userId).single(); return data; }
async function banUser(userId){ await supabase.from('users').update({banned:true}).eq('id',userId); }
async function unbanUser(userId){ await supabase.from('users').update({banned:false}).eq('id',userId); }
async function getPartner(userId){ const {data} = await supabase.from('chat_pairs').select('*').eq('user_id',userId).single(); return data?.partner_id||null; }
async function setChatPair(user1,user2){ await supabase.from('chat_pairs').upsert([{user_id:user1,partner_id:user2},{user_id:user2,partner_id:user1}]); }
async function removeChatPair(userId,partnerId){ await supabase.from('chat_pairs').delete().or(`user_id.eq.${userId},user_id.eq.${partnerId}`); }
async function addReport(reporterId,reportedId,reason,photo=null){ await supabase.from('reports').insert({reporter_id:reporterId,reported_id:reportedId,reason,photo}); }
async function getReports(){ const {data} = await supabase.from('reports').select('*'); return data||[]; }
async function clearReports(){ await supabase.from('reports').delete(); }

// Bot
function runBot(){
    const token = "7132216283:AAFD9ABqmpd8juzxX96D3I7HS5eECS_-g2E";
    bot = new TelegramBot(token,{polling:true});

    // Start command
    bot.onText(/\/start/, async msg=>{
        const userId = msg.chat.id;
        const user = await getUser(userId);
        if(user?.banned) return bot.sendMessage(userId,"أنت محظور من استخدام هذا البوت 😐");
        if(!user){
            bot.sendMessage(userId,"مرحبًا! من فضلك أرسل اسمك:");
            userState[userId]={step:'awaiting_name'};
        }else{
            bot.sendMessage(userId,`مرحبًا ${user.name}!`,{reply_markup:{inline_keyboard:[[ {text:'أبدا بحث',callback_data:'find_chat'}]]}});
        }
    });

    // Message handling
    bot.on('message', async msg=>{
        const userId = msg.chat.id;
        if(msg.text.startsWith('/')) return;

        const state=userState[userId];
        if(state){
            if(state.step==='awaiting_name'){
                state.name=msg.text;
                bot.sendMessage(userId,"الآن من فضلك أرسل جنسك (ذكر/أنثى):");
                state.step='awaiting_gender';
            }else if(state.step==='awaiting_gender'){
                if(!['ذكر','أنثى'].includes(msg.text.toLowerCase())) return bot.sendMessage(userId,"من فضلك، أرسل جنسك (ذكر/أنثى):");
                await saveUser(userId,state.name,msg.text.toLowerCase());
                bot.sendMessage(userId,`تم التسجيل بنجاح مرحبًا ${state.name}!`);
                delete userState[userId];
            }else if(state.step==='awaiting_report_reason'){
                state.reason=msg.text;
                bot.sendMessage(userId,"الرجاء إرسال صورة للبلاغ أو اكتب 'لا' إذا لم توجد صورة");
                state.step='awaiting_report_photo';
            }else if(state.step==='awaiting_report_photo'){
                const partnerId = await getPartner(userId);
                let photoId = null;
                if(msg.photo && msg.photo.length>0) photoId = msg.photo[msg.photo.length-1].file_id;
                if(msg.text && msg.text.toLowerCase()==='لا') photoId=null;
                await addReport(userId,partnerId,state.reason,photoId);
                bot.sendMessage(userId,"تم إرسال البلاغ للمشرفين ✅");
                adminIds.forEach(async admin=>{
                    bot.sendMessage(admin,`بلاغ جديد من ${(await getUser(userId))?.name} ضد ${(await getUser(partnerId))?.name || partnerId}\nالسبب: ${state.reason}`);
                    if(photoId) bot.sendPhoto(admin,photoId);
                });
                delete userState[userId];
            }
            return;
        }

        // إرسال الرسائل للشريك
        const partnerId = await getPartner(userId);
        if(partnerId) bot.sendMessage(partnerId, `${(await getUser(userId)).name}: ${msg.text}`);
    });

    // Callback queries
    bot.on('callback_query', async query=>{
        const userId = query.message.chat.id;
        if(query.data==='find_chat') findChat(userId);
        else if(query.data==='leave_chat') leaveChat(userId);
        else if(query.data==='report') { userState[userId]={step:'awaiting_report_reason'}; bot.sendMessage(userId,'أرسل سبب البلاغ'); }
        else if(query.data==='view_reports') viewReports(userId);
        else if(query.data==='clear_reports') {await clearReports(); bot.sendMessage(userId,'تم حذف جميع البلاغات');}
    });

    async function findChat(userId){
        if(waitingUsers.includes(userId) || activeUsers.has(userId)) return;
        if(waitingUsers.length>0){
            let other;
            for(let i=0;i<waitingUsers.length;i++){
                if(!ignoredUsers.has(waitingUsers[i])){
                    other=waitingUsers.splice(i,1)[0]; break;
                }
            }
            if(!other){ waitingUsers.push(userId); bot.sendMessage(userId,'جار البحث عن شريك...'); return; }
            activeUsers.add(userId); activeUsers.add(other);
            await setChatPair(userId,other);
            bot.sendMessage(userId,`تم العثور على شريك دردشة`);
            bot.sendMessage(other,`تم العثور على شريك دردشة`);
        }else{
            waitingUsers.push(userId);
            bot.sendMessage(userId,'جار البحث عن شريك...');
        }
    }

    async function leaveChat(userId){
        const partner = await getPartner(userId);
        if(!partner) return bot.sendMessage(userId,'أنت لست في دردشة');
        await removeChatPair(userId, partner);
        activeUsers.delete(userId);
        activeUsers.delete(partner);

        // إضافة المستخدمين إلى قائمة التجاهل المؤقت
        ignoredUsers.add(userId);
        ignoredUsers.add(partner);
        setTimeout(() => {
            ignoredUsers.delete(userId);
            ignoredUsers.delete(partner);
        }, 10000); // مدة التجاهل المؤقتة 10 ثواني

        bot.sendMessage(userId, 'لقد غادرت الدردشة 😐', {
            reply_markup: { inline_keyboard: [[{ text: 'ابحث عن شريك', callback_data: 'find_chat' }]] }
        });
        bot.sendMessage(partner, `الشريك غادر الدردشة 😢`, {
            reply_markup: { inline_keyboard: [[{ text: 'ابحث عن شريك', callback_data: 'find_chat' }]] }
        });
    }

    async function viewReports(userId) {
        if (!adminIds.includes(userId)) return bot.sendMessage(userId, 'ليس لديك صلاحية');
        const reports = await getReports();
        if (reports.length === 0) return bot.sendMessage(userId, 'لا يوجد بلاغات');
        let text = 'البلاغات:\n\n';
        for (const r of reports) {
            const reporter = await getUser(r.reporter_id);
            const reported = await getUser(r.reported_id);
            text += `مقدم البلاغ: ${reporter?.name || r.reporter_id}\nالمبلغ عنه: ${reported?.name || r.reported_id}\nالسبب: ${r.reason}\n\n`;
        }
        bot.sendMessage(userId, text);
    }

    // Commands for admins
    bot.onText(/\/ban (.+)/, async (msg, match) => {
        const userId = msg.chat.id;
        if (!adminIds.includes(userId)) return;
        const targetId = parseInt(match[1]);
        if (!isNaN(targetId)) {
            await banUser(targetId);
            bot.sendMessage(userId, `تم حظر المستخدم ${targetId}`);
            bot.sendMessage(targetId, 'تم حظرك من قبل المطور');
        }
    });

    bot.onText(/\/unban (.+)/, async (msg, match) => {
        const userId = msg.chat.id;
        if (!adminIds.includes(userId)) return;
        const targetId = parseInt(match[1]);
        if (!isNaN(targetId)) {
            await unbanUser(targetId);
            bot.sendMessage(userId, `تم فك حظر المستخدم ${targetId}`);
            bot.sendMessage(targetId, 'تم فك الحظر عنك من قبل المطور. يمكنك الآن استخدام البوت');
        }
    });

    bot.onText(/\/broadcast (.+)/, async (msg, match) => {
        const userId = msg.chat.id;
        if (!adminIds.includes(userId)) return;
        const message = match[1];
        const { data: users } = await supabase.from('users').select('id').neq('banned', true);
        users.forEach(u => bot.sendMessage(u.id, `رسالة من المطور: ${message}`));
    });

    // Periodic check to clean waiting users (optional)
    setInterval(() => {
        waitingUsers.forEach((uid, index) => {
            if (ignoredUsers.has(uid)) waitingUsers.splice(index, 1);
        });
    }, 30000);

}

runBot();
