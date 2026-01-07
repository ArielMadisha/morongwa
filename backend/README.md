npx ts-node scripts/createAdmin.ts# Morongwa Backend - Errand Runner Platform

Airbnb-style marketplace connecting errand runners with clients who need tasks completed.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── data/
│   │   ├── models/          # Mongoose schemas
│   │   └── db.ts           # Database connection
│   ├── middleware/         # Express middleware
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic
│   ├── utils/             # Helper functions
│   └── server.ts          # Application entry point
├── uploads/               # File storage
├── logs/                 # Application logs
└── package.json
```

## 🔑 Core Features

- **User Management**: Clients, Runners, Admins, SuperAdmins
- **Task Marketplace**: Post, accept, complete, cancel errands
- **Wallet System**: Escrow, payouts, top-ups, transactions
- **Payments**: PayGate integration (South African gateway)
- **Messaging**: Real-time chat between clients and runners
- **Reviews**: Rating system for trust building
- **Admin Dashboard**: Analytics, reporting, governance
- **Compliance**: GDPR/POPIA data requests
- **Monitoring**: System health, metrics, alerts

## 🛠️ Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: MongoDB + Mongoose
- **Authentication**: JWT + bcrypt
- **Real-time**: Socket.IO
- **File Upload**: Multer
- **Email**: Nodemailer
- **Logging**: Winston
- **Security**: Helmet, rate limiting, XSS protection

## 📚 API Documentation

Base URL: `http://localhost:5000/api`

### Authentication
- `POST /auth/signup` - Register new user
- `POST /auth/login` - Login
- `POST /auth/refresh` - Refresh token

### Tasks
- `POST /tasks` - Create task (escrow funds)
- `PUT /tasks/:id/accept` - Runner accepts task
- `PUT /tasks/:id/complete` - Complete task (release escrow)
- `PUT /tasks/:id/cancel` - Cancel task (refund escrow)

### Wallet
- `GET /wallet/me` - Get wallet balance
- `POST /wallet/topup` - Add funds
- `POST /wallet/payout` - Withdraw funds

### Payments
- `POST /payments/initiate` - Start payment
- `POST /payments/webhook` - Gateway callback

## 🔒 Security

- Rate limiting (100 requests/15 min)
- Helmet security headers
- XSS protection
- MongoDB injection prevention
- Input validation
- Audit logging

## 📊 Monitoring

- Winston structured logging
- System metrics tracking
- Alert thresholds
- Admin metrics API

## 🌍 Deployment

```bash
# Build for production
npm run build

# Start production server
npm start
```

## 📝 License

MIT License - Morongwa Platform
