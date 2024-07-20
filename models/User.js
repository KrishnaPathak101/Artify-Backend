import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    UserId: String,
    fullName: String,
    Email: String,
    imageurl: String,
    username: String,
    
})

const User = mongoose.model('User', userSchema);
export default User;