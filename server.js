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

// ------------------- WebSocket لإدارة الدردشة -------------------
let waitingUsers = [];
let pairedUsers = {};
let recentlyLeftPairs = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // تسجيل مستخدم جديد في Supabase
  socket.on("register_user", async ({ username, password }) => {
    try {
      const res = await axios.post(
        `${SUPABASE_URL}/users`,
        { username, password },
        {
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );
      socket.emit("register_success", res.data);
    } catch (err) {
      socket.emit("register_error", err.response?.data || err.message);
    }
  });

  // البحث عن شريك للدردشة
  socket.on("find_partner", () => {
    let partner = waitingUsers.find(
      (u) =>
        !(recentlyLeftPairs[`${socket.id}-${u}`] ||
          recentlyLeftPairs[`${u}-${socket.id}`])
    );
    if (partner) {
      waitingUsers = waitingUsers.filter((u) => u !== partner);
      pairedUsers[socket.id] = partner;
      pairedUsers[partner] = socket.id;

      io.to(socket.id).emit("partner_found", partner);
      io.to(partner).emit("partner_found", socket.id);
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

  // مغادرة الشريك
  socket.on("leave_partner", () => {
    let partner = pairedUsers[socket.id];
    if (partner) {
      recentlyLeftPairs[`${socket.id}-${partner}`] = Date.now();
      setTimeout(
        () => delete recentlyLeftPairs[`${socket.id}-${partner}`],
        5 * 60 * 1000
      );

      delete pairedUsers[socket.id];
      delete pairedUsers[partner];
      io.to(partner).emit("partner_left");
    }
  });

  // إرسال واستقبال الرسائل
  socket.on("send_message", (msg) => {
    let partner = pairedUsers[socket.id];
    if (partner) io.to(partner).emit("receive_message", msg);
  });

  socket.on("disconnect", () => {
    let partner = pairedUsers[socket.id];
    if (partner) io.to(partner).emit("partner_left");
    waitingUsers = waitingUsers.filter((u) => u !== socket.id);
    delete pairedUsers[socket.id];
  });
});

// ------------------- REST API إضافي (اختياري) -------------------
// مثال: الحصول على جميع المنتجات من Supabase
app.get("/api/products", async (req, res) => {
  try {
    const response = await axios.get(`${SUPABASE_URL}/products`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
    });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------- تشغيل السيرفر -------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
