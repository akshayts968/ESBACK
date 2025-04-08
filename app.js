require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const session = require("express-session");
const MongoDBStore = require('connect-mongodb-session')(session);
const nodemailer = require("nodemailer");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL;  
const MONGO_URL = process.env.MONGO_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;
const EmailPass = process.env.EmailPass;
const SendEmail = process.env.SendEmail;
const RecieveEmail = process.env.RecieveEmail;

// CORS Middleware
app.use(cors({
    origin: FRONTEND_URL, 
    methods: ["GET", "POST", "PUT", "DELETE"], 
    allowedHeaders: ["Content-Type", "Authorization"], 
}));

// Session Store
const store = new MongoDBStore({
    uri: MONGO_URL,
    collection: "sessions",
    crypto: { secret: SESSION_SECRET },
    touchAfter: 24 * 3600,
});

store.on("error", (err) => {
    console.log("ERROR in MONGO SESSION STORE", err);
});

mongoose.connect(MONGO_URL, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true, 
    serverSelectionTimeoutMS: 30000,  
    connectTimeoutMS: 30000,         
    socketTimeoutMS: 45000           
})
.then(() => console.log("Connected to DB"))
.catch(err => console.log("MongoDB Connection Error:", err));

const User = require("./Model/User.js");
const Product = require("./Model/Product.js");
const Cart = require("./Model/Cart.js");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: SendEmail,
        pass: EmailPass
    }
});

const sendEmail = async (subject, text) => {
    try {
        await transporter.sendMail({
            from: SendEmail,
            to: RecieveEmail,
            subject,
            text
        });
        console.log("Email sent successfully");
    } catch (err) {
        console.error("Email sending failed:", err);
    }
};

app.post("/api/signup", async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });

        if (existingUser) return res.status(400).json({ error: "Username already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.json({ message: "Signup successful!" });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

app.post("/api/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: "Missing username or password" });

        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ error: "Invalid username or password" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ error: "Invalid username or password" });

        const token = jwt.sign({ userId: user._id }, "your_jwt_secret", { expiresIn: "1h" });
        res.json({
            message: "Login successful",
            token,
            userId: user._id
        });
    } catch (err) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.post("/api/products", async (req, res) => {
    try {
        const { name, price, image } = req.body;
        const newProduct = new Product({ name, price, image });
        await newProduct.save();
        res.status(201).json({ message: "Product added successfully", product: newProduct });
    } catch (error) {
        res.status(500).json({ error: "Error adding product" });
    }
});

app.get("/api/products", async (req, res) => {
    try {
        const products = await Product.find();
        res.status(200).json(products);
    } catch (error) {
        res.status(500).json({ error: "Error fetching products" });
    }
});

app.get("/cart/:userId", async (req, res) => {
    try {
        const userCart = await Cart.find({ userId: req.params.userId }).populate("productId");
        res.json(userCart);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch cart" });
    }
});

app.post("/cart", async (req, res) => {
    const { userId, productId, quantity } = req.body;
    try {
        let item = await Cart.findOne({ userId, productId }).populate("productId");
        let product;

        if (item) {
            item.quantity += quantity;
            product = item.productId;
        } else {
            product = await Product.findById(productId);
            item = new Cart({ userId, productId, quantity });
        }

        await item.save();
        sendEmail("Cart Updated", `User ${userId}: ${product.name} (ID: ${productId}) added with quantity ${quantity}.`);

        res.json(await Cart.find({ userId }).populate("productId"));
    } catch (err) {
        res.status(500).json({ error: "Failed to add to cart" });
    }
});

app.put("/cart/update", async (req, res) => {
    const { userId, productId, change } = req.body;
    try {
        let item = await Cart.findOne({ userId, productId }).populate("productId");
        if (!item) return res.status(404).json({ error: "Item not found" });

        item.quantity += change;
        let action = `User ${userId}: ${item.productId.name} (ID: ${productId}) quantity changed by ${change}.`;

        if (item.quantity <= 0) {
            await item.deleteOne();
            action = `User ${userId}: ${item.productId.name} (ID: ${productId}) removed from cart.`;
        } else {
            await item.save();
        }

        sendEmail("Cart Updated", action);

        res.json(await Cart.find({ userId }).populate("productId"));
    } catch (err) {
        res.status(500).json({ error: "Failed to update cart" });
    }
});

app.delete("/cart/remove/:userId/:productId", async (req, res) => {
    try {
        await Cart.deleteOne({ userId: req.params.userId, productId: req.params.productId });
        res.json(await Cart.find({ userId: req.params.userId }).populate("productId"));
    } catch (err) {
        res.status(500).json({ error: "Failed to remove item" });
    }
});

app.delete("/cart/clear/:userId", async (req, res) => {
    try {
        await Cart.deleteMany({ userId: req.params.userId });
        res.json({ message: "Cart cleared successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to clear cart" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));