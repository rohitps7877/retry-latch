import request from "supertest";
import app from "../src/app.js";
import { redisClient } from "../src/config/redis.js";

describe("Health Check", () => {

    test("should return server health", async () => {

        const response = await request(app)
            .get("/health");

        expect(response.statusCode).toBe(200);

        expect(response.body.message)
            .toBe("RetryLatch server is healthy");
    });

});

describe("Create Order", () => {

    test("should create a new order", async () => {

        const response = await request(app)
            .post("/api/orders")
            .set("Idempotency-Key", "test-order-001")
            .send({
                product: "Laptop",
                quantity: 1
            });

        expect(response.statusCode).toBe(201);

        expect(response.body.product).toBe("Laptop");
        expect(response.body.quantity).toBe(1);
    });

});


describe("Idempotency", () => {

    test("should return the same order for the same idempotency key", async () => {

        const firstResponse = await request(app)
            .post("/api/orders")
            .set("Idempotency-Key", "test-idempotency-001")
            .send({
                product: "Keyboard",
                quantity: 1
            });

        const secondResponse = await request(app)
            .post("/api/orders")
            .set("Idempotency-Key", "test-idempotency-001")
            .send({
                product: "Keyboard",
                quantity: 1
            });

        expect(firstResponse.statusCode).toBe(201);
        expect(secondResponse.statusCode).toBe(201);

        expect(secondResponse.body._id)
            .toBe(firstResponse.body._id);
    });

});

describe("Idempotency Payload Validation", () => {

    test("should reject the same key with different data", async () => {

        await request(app)
            .post("/api/orders")
            .set("Idempotency-Key", "test-mismatch-001")
            .send({
                product: "Laptop",
                quantity: 1
            });

        const response = await request(app)
            .post("/api/orders")
            .set("Idempotency-Key", "test-mismatch-001")
            .send({
                product: "Phone",
                quantity: 1
            });

        expect(response.statusCode).toBe(409);

        expect(response.body.message)
            .toBe("Same key used with different data");
    });

});

describe("Idempotency Key Validation", () => {

    test("should reject request without an idempotency key", async () => {

        const response = await request(app)
            .post("/api/orders")
            .send({
                product: "Mouse",
                quantity: 1
            });

        expect(response.statusCode).toBe(400);

        expect(response.body.message)
            .toBe("Idempotency-Key is required");
    });

});


describe("Concurrent Requests", () => {

    test("should allow only one request to create the order", async () => {

        await redisClient.del("rate-limit:127.0.0.1");
        const requests = Array.from({ length: 5 }, () => {
            return request(app)
                .post("/api/orders")
                .set("Idempotency-Key", "test-concurrent-001")
                .send({
                    product: "Tablet",
                    quantity: 1
                });
        });

        const responses = await Promise.all(requests);

        console.log(
            responses.map((response) => response.statusCode)
        );

        const successfulResponses = responses.filter(
            (response) => response.statusCode === 201
        );

        const lockedResponses = responses.filter(
            (response) => response.statusCode === 409
        );

        expect(successfulResponses).toHaveLength(1);

        expect(lockedResponses).toHaveLength(4);
    });

});


describe("Rate Limiting", () => {

    test("should reject requests after the rate limit is reached", async () => {
        const keys = await redisClient.keys("rate-limit:*");

        if (keys.length > 0) {
            await redisClient.del(keys);
        }
        const requests = [];

        for (let i = 0; i < 11; i++) {
            requests.push(
                request(app)
                    .post("/api/orders")
                    .set("Idempotency-Key", `rate-limit-${i}`)
                    .send({
                        product: "Mouse",
                        quantity: 1
                    })
            );
        }

        const responses = await Promise.all(requests);

        const rateLimitedResponses = responses.filter(
            (response) => response.statusCode === 429
        );

        expect(rateLimitedResponses).toHaveLength(1);
    });

});