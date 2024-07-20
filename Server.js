import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import SellArt from './models/sellArt.js';
import User from './models/User.js';
import Cart from './models/Cart.js';
import nodemailer from 'nodemailer';
import Razorpay from 'razorpay';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import xssClean from 'xss-clean';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import csrf from 'csurf';
import cookieParser from 'cookie-parser';

const app = express();
const PORT = process.env.PORT || 5000;
const YOUR_DOMAIN = 'http://localhost:5000';
dotenv.config();

app.use(cors({
    origin: 'http://localhost:5173', // Adjust this to match your frontend URL
    methods: 'GET,POST,PUT,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'] // Add 'X-CSRF-Token' here
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(helmet());
app.use(xssClean());
app.use(mongoSanitize());
app.use(hpp());
app.use(cookieParser());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CSRF Protection
const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);

// Set up multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.log(err));

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Razorpay setup
const razorpay = new Razorpay({
    key_id: process.env.KEY_ID,
    key_secret: process.env.KEY_SECRET,
});

// Secure Routes
app.post('/createorder', async (req, res) => {
    const { amount, currency, receipt } = req.body;

    try {
        const options = {
            amount: amount * 100, // Convert amount to smallest currency unit
            currency,
            receipt,
        };

        const response = await razorpay.orders.create(options);
        res.json(response);
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ error: 'Failed to create order' });
    }
});

// Sending order confirmation mail
async function sendEmail(referrerEmail, refereeEmail) {
    try {
        const transport = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: refereeEmail,
            subject: 'Referral Submission Successful',
            text: `Thank you for referring ${refereeEmail}.`,
            html: `<p>Thank you for referring <strong>${refereeEmail}</strong>.</p>`,
        };

        const result = await transport.sendMail(mailOptions);
        return result;
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Error sending email');
    }
}

app.post('/sendemail', async (req, res) => {
    const { email } = req.body;
    const { referrerEmail, refereeEmail } = email;
    try {
        await sendEmail(referrerEmail, refereeEmail);
        res.status(200).json({ message: 'Email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ error: 'Failed to send email' });
    }
});

// Routes
app.post('/api/user', async (req, res) => {
    const { UserId, fullName, Email, imageurl, username } = req.body;
    if (!UserId || !fullName || !Email || !imageurl || !username) {
        return res.status(422).json({ error: 'Please add all the fields' });
    }

    try {
        const user = await User.findOne({ UserId });
        if (user) {
            return res.status(409).json({ error: 'User already exists' });
        }

        const newUser = new User({
            UserId,
            fullName,
            Email,
            imageurl,
            username
        });

        await newUser.save();
        res.status(201).json(newUser);
    } catch (error) {
        console.error('Error saving user:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/sell-art', upload.array('images'), async (req, res) => {
    const { category, title, description, price, userId } = req.body;
    const images = req.files;

    if (!category || !title || !description || !price || !images || images.length === 0 || !userId) {
        return res.status(422).json({ error: 'Please add all the fields' });
    }

    try {
        const imageUrls = await Promise.all(
            images.map(file => new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { resource_type: 'image', folder: 'sell_art' },
                    (error, result) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(result.secure_url);
                        }
                    }
                );
                uploadStream.end(file.buffer);
            }))
        );

        const newArt = new SellArt({
            category,
            title,
            description,
            price,
            images: imageUrls,
            userId
        });

        await newArt.save();
        res.status(201).json(newArt);
    } catch (error) {
        console.error('Error saving art:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/sell-art/:id', upload.array('images'), async (req, res) => {
    const { id } = req.params;
    const { category, title, description, price } = req.body;
    const images = req.files;

    if (!category || !title || !description || !price) {
        return res.status(422).json({ error: 'Please add all the fields' });
    }

    try {
        const art = await SellArt.findById(id);
        if (!art) {
            return res.status(404).json({ message: 'Art not found' });
        }

        const imageUrls = await Promise.all(
            images.map(file => new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { resource_type: 'image', folder: 'sell_art', quality_analysis: true, transformation: [{ width: 500, height: 500, crop: 'limit' }], quality: 'auto' },
                    (error, result) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve(result.secure_url);
                        }
                    }
                );
                uploadStream.end(file.buffer);
            }))
        );

        const updatedArt = await SellArt.findByIdAndUpdate(id, {
            category,
            images: imageUrls,
            title,
            description,
            price
        }, { new: true });

        res.status(200).json(updatedArt);
    } catch (error) {
        console.error('Error updating art:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get art info
app.get('/api/art/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const art = await SellArt.findById(id);
        if (!art) {
            return res.status(404).json({ message: 'Art not found' });
        }

        const user = await User.findOne({ UserId: art.userId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const artWithUser = {
            ...art.toObject(),
            user
        };

        res.status(200).json(artWithUser);
    } catch (error) {
        console.error('Error fetching art:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Delete from cart 
app.delete('/deletefromcart', async (req, res) => {
    const { cartItems } = req.body;
    const { userId, artId } = cartItems;

    try {
        const result = await Cart.findOneAndDelete({ artId, userId });
        if (!result) {
            return res.status(404).json({ message: 'Item not found in cart' });
        }

        res.status(200).json({ message: 'Item deleted from cart' });
    } catch (error) {
        console.error('Error deleting cart items:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get all art info
app.get('/api/art', async (req, res) => {
    try {
        const arts = await SellArt.find();
        res.status(200).json(arts);
    } catch (error) {
        console.error('Error fetching arts:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get art info by userId
app.get('/api/user/:UserId', async (req, res) => {
    const { UserId } = req.params;
    try {
        const getarts = await SellArt.find({ userId: UserId });
        res.status(200).json(getarts);
    } catch (error) {
        console.error('Error fetching user arts:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Add item to cart
app.post('/cart', async (req, res) => {
    const { userId, artId, title, price, image } = req.body;

    if (!userId || !artId || !title || !price || !image) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const existingCart = await Cart.findOne({ userId });

        if (existingCart) {
            existingCart.items.push({ artId, title, price, image });
            await existingCart.save();
            res.status(200).json(existingCart);
        } else {
            const newCart = new Cart({
                userId,
                items: [{ artId, title, price, image }]
            });

            await newCart.save();
            res.status(201).json(newCart);
        }
    } catch (error) {
        console.error('Error adding to cart:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get cart items
app.get('/api/cart/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const userCart = await Cart.findOne({ userId });
        if (!userCart) {
            return res.status(404).json({ error: 'Cart not found' });
        }

        res.status(200).json(userCart.items);
    } catch (error) {
        console.error('Error fetching cart items:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Remove item from cart
app.delete('/api/cart/:userId/:artId', async (req, res) => {
    const { userId, artId } = req.params;

    try {
        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({ error: 'Cart not found' });
        }

        const initialItemCount = cart.items.length;
        cart.items = cart.items.filter(item => item.artId.toString() !== artId.toString());

        if (initialItemCount === cart.items.length) {
            return res.status(404).json({ error: 'Item not found in the cart' });
        }

        if (cart.items.length === 0) {
            await Cart.deleteOne({ userId });
            return res.status(200).json({ message: 'Cart deleted' });
        }

        await cart.save();
        res.status(200).json(cart);
    } catch (error) {
        console.error('Error removing item from cart:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// CSRF token endpoint
app.get('/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
