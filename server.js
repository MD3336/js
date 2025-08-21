// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const axios = require("axios");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(cors());

// ------------------- إعدادات Supabase -------------------
const SUPABASE_URL = "https://fkjnjiqewakjfggozjxz.supabase.co/rest/v1";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZram5qaXFld2FramZnZ296anh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0ODQwMDUsImV4cCI6MjA3MTA2MDAwNX0.3p6GCTasy8luARLuCoROJ3BilSzjdOIfLjo7-g0PDBg";

// headers الجاهزة
const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

// ------------------- WebSocket -------------------
let waitingUsers = []; // مستخدمين ناطرين
let pairedUsers = {}; // الأزواج الحاليين

io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  // تسجيل مستخدم جديد
  socket.on("register_user", async ({ username, password }) => {
    try {
      const res = await axios.post(
        `${SUPABASE_URL}/users`,
        { username, password },
        { headers }
      );
      socket.emit("register_success", res.data);
    } catch (err) {
      socket.emit("register_error", err.response?.data || err.message);
    }
  });

  // البحث عن شريك
  socket.on("find_partner", async () => {
    let partner = waitingUsers.find((u) => u !== socket.id);
    if (partner) {
      // نطلعهم من قائمة الانتظار
      waitingUsers = waitingUsers.filter((u) => u !== partner);

      // نربطهم ببعض
      pairedUsers[socket.id] = partner;
      pairedUsers[partner] = socket.id;

      io.to(socket.id).emit("partner_found", partner);
      io.to(partner).emit("partner_found", socket.id);

      // نخزن بـ recent_pairs (DB)
      try {
        await axios.post(
          `${SUPABASE_URL}/recent_pairs`,
          { user1_id: socket.id, user2_id: partner },
          { headers }
        );
      } catch (dbErr) {
        console.log("DB error:", dbErr.response?.data || dbErr.message);
      }
    } else {
      waitingUsers.push(socket.id);
      setTimeout(() => {
        if (waitingUsers.includes(socket.id)) {
          waitingUsers = waitingUsers.filter((u) => u !== socket.id);
          socket.emit("no_partner_found");
        }
      }, 10000);
    }
  });

  // إرسال رسالة
  socket.on("send_message", async (msg) => {
    let partner = pairedUsers[socket.id];
    if (partner) {
      io.to(partner).emit("receive_message", msg);

      // نحفظ الرسالة بالـ DB
      try {
        await axios.post(
          `${SUPABASE_URL}/messages`,
          {
            sender_id: socket.id,
            receiver_id: partner,
            message: msg,
          },
          { headers }
        );
      } catch (dbErr) {
        console.log("DB save error:", dbErr.response?.data || dbErr.message);
      }
    }
  });

  // مغادرة الشريك
  socket.on("leave_partner", () => {
    let partner = pairedUsers[socket.id];
    if (partner) {
      delete pairedUsers[socket.id];
      delete pairedUsers[partner];
      io.to(partner).emit("partner_left");
    }
  });

  // قطع الاتصال
  socket.on("disconnect", () => {
    let partner = pairedUsers[socket.id];
    if (partner) io.to(partner).emit("partner_left");

    waitingUsers = waitingUsers.filter((u) => u !== socket.id);
    delete pairedUsers[socket.id];
  });
});

// ------------------- تشغيل السيرفر -------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
