import dotenv from "dotenv";
import connectDB from "./config/db.js";
import { connectRedis } from "./config/redis.js";
import app from "./app.js";

dotenv.config();

connectDB();
connectRedis();

app.listen(process.env.PORT, () => {
    console.log(`server is running on port ${process.env.PORT}`);
});