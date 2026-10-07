# RetryLatch — Reliable API Gateway

RetryLatch is a backend system designed to safely handle duplicate and concurrent API requests.

It uses Redis for temporary distributed locking and rate limiting, MongoDB for persistent order and idempotency data, and Nginx to load balance requests across multiple Node.js API instances.

## Architecture

```text
                         Client
                           |
                           v
                     Nginx :8080
                           |
                  -------------------
                  |                 |
                  v                 v
             API 1 :3000       API 2 :3000
                  |                 |
                  -----------+-------
                             |
                           Redis
                             |
                          MongoDB
```

## Why RetryLatch?

In a real API, a client may retry a request when the network is slow or the response is lost.

For example:

```text
Client
  |
  | Create Order
  v
Server
  |
  | Order created successfully
  |
  X Response lost
  |
Client does not know whether order was created
  |
  | Retry same request
  v
Server
```

Without idempotency, the retry could create a duplicate order.

RetryLatch prevents this by using an `Idempotency-Key` and Redis locking.

## Features

- Idempotent order creation
- Redis-based distributed locking
- MongoDB transactions
- Idempotency record storage
- Payload validation for reused idempotency keys
- Concurrent request protection
- Redis-based IP rate limiting
- Nginx load balancing
- Multiple Node.js API instances
- Docker Compose deployment
- Jest + Supertest integration tests
- Autocannon load testing

## Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- Redis
- Nginx
- Docker / Docker Compose
- Jest
- Supertest
- Autocannon

## How Idempotency Works

The client sends an `Idempotency-Key` with the request.

Example:

```http
POST /api/orders
Idempotency-Key: order-123
Content-Type: application/json
```

Request body:

```json
{
  "product": "Laptop",
  "quantity": 1
}
```

### Request Flow

```text
1. Receive Idempotency-Key
          |
          v
2. Try to acquire Redis lock
          |
          v
3. Check existing idempotency record
          |
          +------ Record exists ------+
          |                            |
          |                            v
          |                    Return stored response
          |
          v
4. Create order inside MongoDB transaction
          |
          v
5. Store idempotency record
          |
          v
6. Commit transaction
          |
          v
7. Return response
```

The Redis lock uses:

```text
SET idempotency:<key> <token> NX EX 30
```

`NX` ensures that only one request can acquire the lock.

`EX 30` gives the lock a 30-second expiration so the lock does not remain permanently if the process fails.

The lock is released using the same lock token that was used to acquire it, preventing one request from accidentally releasing another request's lock.

## Payload Validation

An idempotency key should represent the same logical request.

### First Request

```json
{
  "product": "Laptop",
  "quantity": 1
}
```

with:

```text
Idempotency-Key: order-123
```

creates the order.

### Retry With Same Data

```json
{
  "product": "Laptop",
  "quantity": 1
}
```

returns the previously stored response instead of creating another order.

### Same Key With Different Data

```json
{
  "product": "Phone",
  "quantity": 2
}
```

returns:

```text
409 Conflict
```

This prevents accidental reuse of an idempotency key for a different request.

## Concurrent Request Handling

Multiple requests using the same idempotency key can arrive at almost the same time.

Redis locking ensures that only one request can acquire the lock and enter the order creation section.

Example:

```text
5 concurrent requests
        |
        v
   Redis Lock
        |
   +----+----+
   |         |
   v         v
  1 request  4 requests
   |         |
   v         v
  201       409
```

The automated test verifies:

```text
1 × 201
4 × 409
```

The requests that fail to acquire the lock receive `409 Conflict` and can safely retry later.

## Rate Limiting

RetryLatch uses Redis to track requests by client IP.

The current limit is:

```text
10 POST requests per minute per IP
```

After the limit is reached, the API returns:

```text
429 Too Many Requests
```

Example:

```text
Requests 1–10  → Allowed
Request 11     → 429
```

The rate limiter is applied to the order creation endpoint.

## Nginx Load Balancing

Nginx acts as the entry point for the application.

```text
Client
  |
  v
localhost:8080
  |
  v
Nginx
  |
  +----> api1:3000
  |
  +----> api2:3000
```

Nginx distributes incoming requests between the two Node.js API instances.

Both API instances use the same Redis and MongoDB services.

This allows multiple API instances to share:

- Redis locks
- Rate-limit state
- Idempotency records
- Order data

## Docker

The project uses Docker Compose to run:

```text
api1
api2
redis
nginx
```

Start the complete application:

```bash
docker compose up --build
```

Stop the application:

```bash
docker compose down
```

Check running containers:

```bash
docker compose ps
```

## Environment Variables

Create a `.env` file in the project root.

Example:

```env
PORT=3000
MONGO_URI=your_mongodb_connection_string
REDIS_URL=redis://localhost:6379
```

For Docker, the API containers use:

```text
redis://redis:6379
```

The actual `.env` file should not be committed to GitHub.

Use `.env.example` as a template.

## API Endpoints

### Health Check

```http
GET /health
```

Example response:

```json
{
  "message": "RetryLatch server is healthy",
  "server": "api1"
}
```

The `server` field helps verify Nginx load balancing between API instances.

### Create Order

```http
POST /api/orders
```

Required header:

```http
Idempotency-Key: unique-key
```

Example request:

```json
{
  "product": "Laptop",
  "quantity": 1
}
```

### Get Order

```http
GET /api/orders/:id
```

Example:

```http
GET /api/orders/64f123...
```

## Testing

The project uses Jest and Supertest for integration testing.

Run all tests:

```bash
npm test
```

Current test coverage includes:

- Health check
- Order creation
- Idempotent repeated requests
- Payload validation
- Missing idempotency key
- Concurrent requests
- Rate limiting

Current test result:

```text
Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

## Load Testing

Autocannon is used to test the API and Nginx entry point.

Example:

```bash
npx autocannon -c 10 -d 30 http://localhost:8080/health
```

Where:

- `-c 10` = 10 concurrent connections
- `-d 30` = 30-second test

During local testing of the Nginx load-balanced deployment, one test produced:

```text
242,444 HTTP 200 responses
```

in approximately 30 seconds.

The test also produced some client-level `ECONNRESET` events. These were not HTTP `4xx` or `5xx` responses; the recorded HTTP responses were `200`.

Load-test results depend on the local development machine and Docker Desktop environment and should not be interpreted as production capacity.

## Project Structure

```text
retry-latch/
│
├── nginx/
│   └── nginx.conf
│
├── src/
│   ├── config/
│   │   ├── db.js
│   │   └── redis.js
│   │
│   ├── controllers/
│   │   └── orderController.js
│   │
│   ├── middleware/
│   │   └── rateLimit.js
│   │
│   ├── models/
│   │   ├── idempotencyModel.js
│   │   └── orderModel.js
│   │
│   ├── routes/
│   │   └── orderRoutes.js
│   │
│   ├── app.js
│   └── server.js
│
├── tests/
│   ├── setup.js
│   └── order.test.js
│
├── .dockerignore
├── .env.example
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── loadtest.json
├── package.json
├── package-lock.json
└── README.md
```

## Key Design Decisions

### Redis for Temporary Coordination

Redis is used for:

- Distributed locking
- Rate limiting

These operations require fast temporary state rather than permanent storage.

### MongoDB for Persistent Data

MongoDB stores:

- Orders
- Idempotency records

The idempotency record allows the server to return the original response when the same request is retried.

### MongoDB Transactions

Order creation and the corresponding idempotency record are written inside the same MongoDB transaction.

This helps ensure that the order and its idempotency record are committed together.

### Nginx for Load Balancing

Nginx provides a single entry point and distributes requests across multiple API instances.

### Docker Compose for Local Deployment

Docker Compose makes it possible to run the complete system with multiple services using a single command.

## Limitations

This project is designed as a learning and demonstration project rather than a production-ready distributed system.

Some limitations include:

- Redis lock expiration is currently fixed at 30 seconds.
- Payload comparison uses the serialized request body.
- Load-test results depend on the local development machine and Docker Desktop environment.
- The current rate limiter uses a simple fixed-window counter.
- A request that fails to acquire the Redis lock receives `409` and is expected to retry.
- The system does not claim universal exactly-once processing.

## Future Improvements

Possible future improvements include:

- More robust payload hashing
- Better distributed lock recovery
- More advanced rate limiting
- Health checks and service readiness
- Retry and recovery handling
- Dead-letter/job queue support
- Production deployment
- More comprehensive failure testing
