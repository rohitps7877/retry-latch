import Order from "../models/orderModel.js";
import IdempotencyRecord from "../models/idempotencyModel.js";
import { redisClient } from "../config/redis.js";
import { randomUUID } from "crypto";

const createOrder = async (req, res) => {
    const lockToken = randomUUID();
    let lockKey;
    let lockAcquired = false;
    let session;

    try {
        const key = req.get("Idempotency-Key");
        const data = req.body;

        // Check if idempotency key is provided
        if (!key) {
            return res.status(400).json({
                message: "Idempotency-Key is required"
            });
        }

        // Reserve this key in Redis
        lockKey = `idempotency:${key}`;

        const isLocked = await redisClient.set(lockKey, lockToken, {
            NX: true,
            EX: 30
        });

        if (!isLocked) {
            return res.status(409).json({
                message: "Request is already being processed. Please retry."
            });
        }

        lockAcquired = true;

        // Start MongoDB transaction
        session = await Order.startSession();
        session.startTransaction();

        // Check if this request was already processed
        const existingRecord = await IdempotencyRecord.findOne({ key })
            .session(session);

        if (existingRecord) {

            // Check if the request data is the same
            if (existingRecord.payloadHash !== JSON.stringify(data)) {
                await session.abortTransaction();

                return res.status(409).json({
                    message: "Same key used with different data"
                });
            }

            // Transaction is not needed anymore
            await session.abortTransaction();

            // Return the previous response
            return res.status(existingRecord.responseStatus)
                .json(existingRecord.responseBody);
        }

        // Create and save a new order
        const newOrder = new Order(data);

        const response = await newOrder.save({ session });

        // Save the idempotency record
        const record = new IdempotencyRecord({
            key,
            payloadHash: JSON.stringify(data),
            orderId: response._id,
            responseStatus: 201,
            responseBody: response.toObject()
        });

        await record.save({ session });

        // Commit both database operations
        await session.commitTransaction();

        return res.status(201).json(response);

    } catch (error) {

        // Roll back database changes if something fails
        if (session) {
            try {
                await session.abortTransaction();
            } catch (transactionError) {
                console.log(
                    "Error aborting transaction:",
                    transactionError.message
                );
            }
        }

        console.log("Error creating order:", error.message);

        return res.status(500).json({
            message: "Internal Server Error"
        });

    } finally {

        // Close MongoDB session
        if (session) {
            await session.endSession();
        }

        // Release Redis lock
        if (lockAcquired) {
            try {
                await redisClient.eval(
                    `if redis.call("GET", KEYS[1]) == ARGV[1] then
                        return redis.call("DEL", KEYS[1])
                    else
                        return 0
                    end`,
                    {
                        keys: [lockKey],
                        arguments: [lockToken]
                    }
                );
            } catch (error) {
                console.log(
                    "Error releasing Redis lock:",
                    error.message
                );
            }
        }
    }
};


// Get an order by ID
const getOrderById = async (req, res) => {
    try {
        const orderId = req.params.id;

        const response = await Order.findById(orderId);

        if (!response) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        res.status(200).json(response);

    } catch (error) {
        console.error("Error fetching order:", error.message);

        res.status(500).json({
            message: "Internal Server Error"
        });
    }
};


export { createOrder, getOrderById };