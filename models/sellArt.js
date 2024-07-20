import mongoose from "mongoose";

const sellArtSchema = new mongoose.Schema({
    category: String,
    title: String,
    description: String,
    price: Number,
    images: [String],
    userId: {
        type: String,
        ref: 'User'
    }
})

const SellArt = mongoose.model('SellArt', sellArtSchema);
export default SellArt