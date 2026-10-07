import { redisClient } from "../config/redis.js";

const rateLimit = async (req, res, next) => {
    try {
        // Use IP address to identify the client
        const clientIP = req.ip;

        const key = `rate-limit:${clientIP}`;

        // Increase request count
        const requestCount = await redisClient.incr(key);

        // Set expiry for the first request
        if (requestCount === 1) {
            await redisClient.expire(key, 60);
        }

        // Allow maximum 10 requests per minute
        if (requestCount > 10) {
            return res.status(429).json({
                message: "Too many requests. Please try again later."
            });
        }

        next();

    } catch (error) {
        console.log("Rate limit error:", error.message);

        // Continue request if Redis is unavailable
        next();
    }
};

export default rateLimit;