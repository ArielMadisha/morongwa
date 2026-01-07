# Morongwa - Quick Start Guide

## ✅ Setup Complete!

Your errand-runner marketplace backend has been successfully scaffolded with all features implemented.

## 📦 What's Included

### Core Features
- **Authentication**: JWT-based auth with role-based access control (client, runner, admin, superadmin)
- **Task Management**: Full CRUD with escrow, location-based matching
- **Wallet System**: Balance management, top-ups, payouts, transaction history
- **Payment Gateway**: PayGate integration for secure payments
- **Reviews**: 5-star rating system between clients and runners
- **Real-time Chat**: Socket.IO powered messaging between task parties
- **File Sharing**: Upload/download attachments in task threads
- **Notifications**: Real-time + email notifications
- **Admin Dashboard**: User management, task oversight, payout approvals
- **Support System**: Ticket-based support with escalation
- **Analytics**: Platform KPIs, trends, runner performance metrics
- **Security**: Helmet, rate limiting, input sanitization, audit logging
- **Monitoring**: Winston logging with metrics collection

### Tech Stack
- **Framework**: Express.js + TypeScript
- **Database**: MongoDB + Mongoose
- **Real-time**: Socket.IO
- **Authentication**: JWT + bcrypt
- **Payment**: PayGate (South African gateway)
- **Email**: Nodemailer
- **Security**: Helmet, express-rate-limit, mongo-sanitize
- **Logging**: Winston

## 🚀 Getting Started

### 1. Configure Environment
Edit `.env` file with your actual credentials:
\`\`\`bash
# Database
MONGO_URI=mongodb://localhost:27017/morongwa

# JWT Secret (change this!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Frontend URL
FRONTEND_URL=http://localhost:3000

# SMTP Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# PayGate
PAYGATE_ID=your-paygate-id
PAYGATE_SECRET=your-paygate-secret
\`\`\`

### 2. Install MongoDB
If not already installed:
- **Windows**: Download from https://www.mongodb.com/try/download/community
- **Or use MongoDB Atlas** (cloud): https://www.mongodb.com/cloud/atlas/register
  - Update MONGO_URI in .env with your Atlas connection string

### 3. Start the Server

**Development mode** (with auto-reload):
\`\`\`bash
npm run dev
\`\`\`

**Production mode**:
\`\`\`bash
npm start
\`\`\`

Server will be available at: **http://localhost:5000**

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Tasks
- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create new task (client)
- `POST /api/tasks/:id/accept` - Accept task (runner)
- `POST /api/tasks/:id/complete` - Complete task (runner)

### Wallet & Payments
- `GET /api/wallet/balance` - Get balance
- `POST /api/wallet/topup` - Top up wallet
- `POST /api/payments/initiate` - Initiate payment

### Reviews
- `POST /api/reviews/:taskId` - Submit review
- `GET /api/reviews/user/:userId` - Get user reviews

### Messaging
- `GET /api/messenger/task/:taskId` - Get task messages
- `POST /api/messenger/task/:taskId` - Send message

### Admin
- `GET /api/admin/stats` - Platform statistics
- `GET /api/admin/users` - List all users
- `POST /api/admin/users/:id/suspend` - Suspend user

### Support
- `POST /api/support` - Create support ticket
- `GET /api/support/my-tickets` - Get user's tickets

### Analytics
- `GET /api/analytics/kpis` - Platform KPIs (admin)
- `GET /api/analytics/trends/tasks` - Task trends (admin)

## 🔌 Socket.IO Events

### Chat Namespace (`/chat`)
- `join-task` - Join task chat room
- `send-message` - Send message
- `message-received` - Receive message
- `typing` - Typing indicator
- `mark-read` - Mark message as read

### Notifications Namespace (`/notifications`)
- `notification` - Receive real-time notifications

## 🧪 Testing with Postman/Thunder Client

1. **Register a client**:
\`\`\`json
POST /api/auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "client"
}
\`\`\`

2. **Register a runner**:
\`\`\`json
POST /api/auth/register
{
  "name": "Jane Runner",
  "email": "jane@example.com",
  "password": "password123",
  "role": "runner"
}
\`\`\`

3. **Login** (save the token):
\`\`\`json
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "password123"
}
\`\`\`

4. **Create a task** (use Bearer token):
\`\`\`json
POST /api/tasks
Authorization: Bearer YOUR_TOKEN_HERE
{
  "title": "Grocery shopping",
  "description": "Buy groceries from Checkers",
  "budget": 150,
  "location": {
    "type": "Point",
    "coordinates": [-26.2041, 28.0473]
  }
}
\`\`\`

## 📁 Project Structure
\`\`\`
backend/
├── src/
│   ├── data/
│   │   ├── models/       # Mongoose models
│   │   └── db.ts         # Database connection
│   ├── routes/           # API routes
│   ├── middleware/       # Auth, security, error handling
│   ├── services/         # Business logic (payment, chat, etc.)
│   ├── utils/            # Helpers, validators, constants
│   └── server.ts         # Main entry point
├── uploads/              # User uploads
├── logs/                 # Application logs
└── dist/                 # Compiled JavaScript
\`\`\`

## 🛡️ Security Features
- ✅ JWT authentication with role-based access
- ✅ Password hashing with bcrypt
- ✅ Rate limiting (100 req/15min general, 5 req/15min auth)
- ✅ Helmet security headers
- ✅ MongoDB injection prevention
- ✅ Input validation with Joi
- ✅ Audit logging for all critical actions
- ✅ File upload restrictions

## 📝 Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| PORT | Server port | 5000 |
| MONGO_URI | MongoDB connection string | mongodb://localhost:27017/morongwa |
| JWT_SECRET | Secret key for JWT | your-secret-key |
| FRONTEND_URL | Frontend app URL | http://localhost:3000 |
| SMTP_HOST | Email server host | smtp.gmail.com |
| SMTP_USER | Email username | your-email@gmail.com |
| PAYGATE_ID | PayGate merchant ID | 10011072130 |

## 🔧 Available Scripts

\`\`\`bash
npm run dev        # Start development server with nodemon
npm run build      # Compile TypeScript to JavaScript
npm start          # Start production server
npm run lint       # Run ESLint
\`\`\`

## 🐛 Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running: `mongod` or check your Atlas cluster
- Verify MONGO_URI in .env

### TypeScript Errors
- Run `npm run build` to check for compilation errors
- Ensure all dependencies are installed: `npm install`

### Port Already in Use
- Change PORT in .env to a different number (e.g., 5001)

## 📚 Next Steps

1. **Setup MongoDB** (local or Atlas)
2. **Configure .env** with real credentials
3. **Start the server**: `npm run dev`
4. **Test endpoints** with Postman/Thunder Client
5. **Build the frontend** to connect to this backend

## 🌐 Frontend Integration

When building your frontend (React/Next.js):

\`\`\`javascript
// Example API call
const API_URL = 'http://localhost:5000/api';

// Login
const response = await fetch(\`\${API_URL}/auth/login\`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

// Authenticated request
const tasks = await fetch(\`\${API_URL}/tasks\`, {
  headers: { 
    'Authorization': \`Bearer \${token}\`
  }
});
\`\`\`

## 💡 Tips
- Use MongoDB Compass to visualize your database
- Install the Thunder Client VS Code extension for API testing
- Check `logs/combined.log` for debugging
- Monitor system metrics at `/api/admin/stats` (admin only)

---

**Need help?** Check the code comments in each file for detailed implementation notes.
