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

// ------------------- WebSocket لإدارة الدردشة -------------------
let waitingUsers = [];
let pairedUsers = {};
let recentlyLeftPairs = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("find_partner", () => {
    let partner = waitingUsers.find(u => !(recentlyLeftPairs[`${socket.id}-${u}`] || recentlyLeftPairs[`${u}-${socket.id}`]));
    if (partner) {
      waitingUsers = waitingUsers.filter(u => u !== partner);
      pairedUsers[socket.id] = partner;
      pairedUsers[partner] = socket.id;

      io.to(socket.id).emit("partner_found", partner);
      io.to(partner).emit("partner_found", socket.id);
    } else {
      waitingUsers.push(socket.id);
      setTimeout(() => {
        if (waitingUsers.includes(socket.id)) {
          waitingUsers = waitingUsers.filter(u => u !== socket.id);
          io.to(socket.id).emit("no_partner_found");
        }
      }, 10000);
    }
  });

  socket.on("leave_partner", () => {
    let partner = pairedUsers[socket.id];
    if (partner) {
      recentlyLeftPairs[`${socket.id}-${partner}`] = Date.now();
      setTimeout(() => delete recentlyLeftPairs[`${socket.id}-${partner}`], 5 * 60 * 1000);

      delete pairedUsers[socket.id];
      delete pairedUsers[partner];
      io.to(partner).emit("partner_left");
    }
  });

  socket.on("send_message", (msg) => {
    let partner = pairedUsers[socket.id];
    if (partner) io.to(partner).emit("receive_message", msg);
  });

  socket.on("disconnect", () => {
    let partner = pairedUsers[socket.id];
    if (partner) io.to(partner).emit("partner_left");
    waitingUsers = waitingUsers.filter(u => u !== socket.id);
    delete pairedUsers[socket.id];
  });
});

// ------------------- تشغيل السيرفر -------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});app.get('/api/orders', (req, res) => {
    const data = readData();
    res.json(data.orders);
});

app.post('/api/orders', (req, res) => {
    const order = req.body;
    const data = readData();
    
    const product = data.products.find(p => p.id === order.productId);
    if (!product) {
        return res.status(404).json({ error: 'المنتج غير موجود' });
    }
    
    if ((data.points[order.userEmail] || 0) < (product.price * 1000)) {
        return res.status(400).json({ error: 'النقاط غير كافية' });
    }
    
    order.id = Date.now().toString();
    order.date = new Date().toISOString();
    order.status = product.delivery === 'auto' ? 'completed' : 'pending';
    order.pointsUsed = product.price * 1000;
    
    data.points[order.userEmail] = (data.points[order.userEmail] || 0) - order.pointsUsed;
    data.orders.push(order);
    
    data.transactions.push({
        type: 'purchase',
        userEmail: order.userEmail,
        amount: order.pointsUsed,
        date: order.date,
        orderId: order.id
    });
    
    writeData(data);
    res.json({ success: true, order });
});

app.put('/api/orders/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const data = readData();
    
    const orderIndex = data.orders.findIndex(o => o.id === id);
    if (orderIndex === -1) {
        return res.status(404).json({ error: 'الطلب غير موجود' });
    }
    
    if (status === 'cancelled' && data.orders[orderIndex].status === 'pending') {
        const userEmail = data.orders[orderIndex].userEmail;
        data.points[userEmail] = (data.points[userEmail] || 0) + data.orders[orderIndex].pointsUsed;
        
        data.transactions.push({
            type: 'refund',
            userEmail,
            amount: data.orders[orderIndex].pointsUsed,
            date: new Date().toISOString(),
            orderId: id
        });
    }
    
    data.orders[orderIndex].status = status;
    writeData(data);
    
    res.json({ success: true });
});

// النقاط
app.post('/api/points', (req, res) => {
    const { email, amount } = req.body;
    const data = readData();
    
    if (!data.users.find(u => u.email === email)) {
        return res.status(404).json({ error: 'المستخدم غير موجود' });
    }
    
    data.points[email] = (data.points[email] || 0) + parseInt(amount);
    
    data.transactions.push({
        type: 'admin_add',
        userEmail: email,
        amount: parseInt(amount),
        date: new Date().toISOString(),
        orderId: null
    });
    
    writeData(data);
    res.json({ success: true });
});

app.get('/api/transactions', (req, res) => {
    const data = readData();
    res.json(data.transactions);
});

// بدء السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`السيرفر يعمل على port ${PORT}`);
});
