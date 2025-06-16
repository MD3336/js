const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const DATA_FILE = path.join(__dirname, 'db.json');

// تهيئة ملف البيانات إذا لم يكن موجوداً
if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
        users: [],
        products: [],
        orders: [],
        points: {},
        transactions: []
    }, null, 2));
}

// قراءة البيانات من الملف
function readData() {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// كتابة البيانات إلى الملف
function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// API Routes

// المستخدمون
app.post('/api/register', (req, res) => {
    const { email, password } = req.body;
    const data = readData();
    
    if (data.users.find(u => u.email === email)) {
        return res.status(400).json({ error: 'البريد الإلكتروني مسجل بالفعل' });
    }
    
    data.users.push({ email, password });
    data.points[email] = 0;
    writeData(data);
    
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const data = readData();
    
    const user = data.users.find(u => u.email === email && u.password === password);
    if (!user) {
        return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
    }
    
    res.json({ 
        success: true, 
        user: { email, points: data.points[email] || 0 } 
    });
});

// المنتجات
app.get('/api/products', (req, res) => {
    const data = readData();
    res.json(data.products);
});

app.post('/api/products', (req, res) => {
    const product = req.body;
    const data = readData();
    
    if (!product.id) {
        product.id = Date.now().toString();
        data.products.push(product);
    } else {
        const index = data.products.findIndex(p => p.id === product.id);
        if (index !== -1) {
            data.products[index] = product;
        }
    }
    
    writeData(data);
    res.json({ success: true });
});

app.delete('/api/products/:id', (req, res) => {
    const { id } = req.params;
    const data = readData();
    
    data.products = data.products.filter(p => p.id !== id);
    writeData(data);
    
    res.json({ success: true });
});

// الطلبات
app.get('/api/orders', (req, res) => {
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
