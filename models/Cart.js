// models/Cart.js
import mongoose from 'mongoose';

const cartSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    items: [{
        artId: { type: mongoose.Schema.Types.ObjectId, ref: 'SellArt', required: true },
        title: { type: String, required: true },
        price: { type: Number, required: true },
        image: { type: String, required: true }
    }]
});

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;
