# Matcha Backend - Phase 1 Documentation

This README serves as a guide for the frontend team, detailing the current architecture, environment setup, and the available Authentication & Identity APIs.

## Architecture & Stack
- **Node.js + Express:** Core server setup handling REST endpoints.
- **PostgreSQL:** Primary database accessed using the `pg` driver (raw SQL only, no ORMs).
- **Socket.io:** Configured for real-time bidirectional event-based communication.
- **Security:** Passwords are hashed with `bcrypt`, sessions are managed statelessly via JWTs (`jsonwebtoken`), and cross-origin resource sharing (`cors`) is configured.

---

## 🛠️ Environment & Setup

To run this backend locally, ensure you have PostgreSQL installed and a database named `matcha_db` created.

1. **Install Dependencies:**
   ```bash
   npm install
   ```
2. **Environment Variables:**
   Copy `.env.example` to `.env` and fill in the missing credentials (specifically your `DB_PASSWORD`, `JWT_SECRET`, and SMTP config).
3. **Run the Database Schema:**
   Execute `db/schema.sql` against your PostgreSQL database to initialize the tables.
4. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   The server will start on `http://localhost:3000`.

---

## 🔐 Authentication Endpoints

All successful API responses wrap data inside a `"data"` object. Errors are returned with a `"message"` and a `"status": "error"`.

### 1. Registration
- **Endpoint:** `POST /api/auth/register`
- **Payload:** `{ "username", "email", "password", "firstName", "lastName" }`
- **Behavior:** Validates inputs, enforces a strong password, hashes it, creates the unverified user, and triggers an email with a 24-hour verification token.

### 2. Email Verification
- **Endpoint:** `GET /api/auth/verify?token=YOUR_TOKEN`
- **Behavior:** Validates the single-use token and flips the user's `is_verified` status in the DB to `true`.

### 3. Login
- **Endpoint:** `POST /api/auth/login`
- **Payload:** `{ "email", "password" }`
- **Behavior:** Verifies credentials and checks if the account is verified. Returns a JWT token that the frontend must store and attach to future requests.
- **Response:**
  ```json
  {
    "status": "success",
    "data": {
      "user": { "id", "username", "email" },
      "token": "eyJhbG..."
    }
  }
  ```

### 4. Logout
- **Endpoint:** `POST /api/auth/logout`
- **Behavior:** Instructs the frontend to discard its token. (JWTs are stateless, so actual invalidation occurs client-side).

### 5. Password Recovery
- **Endpoint:** `POST /api/auth/forgot-password`
- **Payload:** `{ "email" }`
- **Behavior:** Generates a 1-hour reset token and emails it to the user. Always returns a generic success message to prevent email enumeration.

- **Endpoint:** `POST /api/auth/reset-password`
- **Payload:** `{ "token", "newPassword" }`
- **Behavior:** Validates the token and updates the user's password.

---

## 🛡️ Route Protection & Identity

To access protected routes, the frontend must attach the JWT to the `Authorization` header:
```http
Authorization: Bearer <your_jwt_token>
```

### 1. Fetch Current User (Identity)
- **Endpoint:** `GET /api/auth/me` (Protected)
- **Behavior:** Uses the provided JWT to fetch the current user's profile.
- **Response Example:**
  ```json
  {
    "status": "success",
    "data": {
      "user": {
        "id": "uuid",
        "username": "johndoe",
        "email": "johndoe@example.com",
        "firstName": "John",
        "lastName": "Doe",
        "isVerified": true
      },
      "isProfileComplete": false
    }
  }
  ```
  *(Note: The frontend can use `isProfileComplete` to force redirect the user to a profile onboarding flow upon login).*

---

## 📡 Socket.io Contracts (Upcoming)

While the Socket.io server is initialized and accepts connections, the exact handlers will be fleshed out in future phases. For a sneak peek at the intended architecture, please see [`docs/api-contract.md`](./docs/api-contract.md).
