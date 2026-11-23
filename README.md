# OTP Authentication System

A secure, production-ready full-stack authentication system featuring email-based One-Time Password (OTP) verification, JWT session management (access & refresh tokens), account lockout protection, and a modern responsive frontend.

## 🚀 Features

- **Email-based OTP Verification**: Verifies email validity on signup and password reset.
- **Secure Password Hashing**: Utilizes `bcrypt` with salt rounds.
- **JWT Authentication**: Short-lived access tokens and secure httpOnly refresh tokens with token rotation.
- **Brute-Force & Rate Limiting**: 
  - Max attempt limits on OTP entry with lockout cooldowns.
  - Rate limiting on sensitive auth endpoints using `express-rate-limit`.
  - Account lockout after consecutive failed login attempts.
- **Input Validation**: Schema validation using `zod`.
- **Security Headers**: Hardened with `helmet` and MongoDB query sanitization (`express-mongo-sanitize`).
- **Modern Responsive Client**: Clean UI built with semantic HTML, modern CSS, and vanilla JavaScript.

---

## 📁 Project Structure

```
otp-auth-system/
├── client/                     # Frontend client
│   ├── index.html              # Main UI markup
│   ├── index.css               # Styling and theme
│   └── app.js                  # Frontend client logic & API calls
├── server/                     # Backend API server
│   ├── src/
│   │   ├── config/             # Database and app configurations
│   │   ├── controllers/        # Request handlers (auth, OTP, user)
│   │   ├── middlewares/        # Auth, rate-limiter, and error middlewares
│   │   ├── models/             # Mongoose schemas (User, OtpVerification, RefreshToken)
│   │   ├── routes/             # Express API routes
│   │   ├── utils/              # Token, OTP generator, and mailer utilities
│   │   ├── validators/         # Zod schemas for input validation
│   │   ├── app.js              # Express app setup
│   │   └── server.js           # Server entry point
│   ├── .env.example            # Sample environment variables
│   └── package.json            # Server dependencies and scripts
└── README.md
```

---

## 🛠️ Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [MongoDB](https://www.mongodb.com/) (local instance or MongoDB Atlas URI)
- SMTP credentials (e.g. Gmail App Password or transactional email service)

### Backend Setup

1. Navigate to the `server` directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your MongoDB URI, JWT secrets, and SMTP settings.

4. Start the server:
   ```bash
   # Development mode with nodemon
   npm run dev

   # Production mode
   npm start
   ```

The server runs by default on `http://localhost:5000` (or the configured `PORT`).

### Frontend Setup

Serve the files in the `client/` folder using any static file server or Live Server in VS Code:

```bash
cd client
npx serve .
```

Open `http://localhost:3000` (or the port indicated by the static server) in your browser.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/signup` | Register new account and send OTP |
| `POST` | `/api/v1/auth/verify-otp` | Verify OTP code and activate account |
| `POST` | `/api/v1/auth/resend-otp` | Resend OTP code with cooldown check |
| `POST` | `/api/v1/auth/login` | Sign in with email and password |
| `POST` | `/api/v1/auth/forgot-password` | Request password reset OTP |
| `POST` | `/api/v1/auth/reset-password` | Reset password using OTP |
| `POST` | `/api/v1/auth/refresh-token` | Exchange refresh token for access token |
| `POST` | `/api/v1/auth/logout` | Invalidate refresh token and logout |
| `GET`  | `/api/v1/auth/me` | Fetch authenticated user profile |
| `GET`  | `/health` | Server health check endpoint |

---

## 📄 License

ISC / MIT
