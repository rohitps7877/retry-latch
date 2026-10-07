import "dotenv/config";

import mongoose from "mongoose";
import connectDB from "../src/config/db.js";
import { connectRedis, redisClient } from "../src/config/redis.js";

beforeAll(async () => {
    await connectDB();
    await connectRedis();
});

afterAll(async () => {
    await mongoose.connection.close();
    await redisClient.quit();
});