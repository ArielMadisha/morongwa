# Morongwa - Gig Economy Marketplace

A full-stack marketplace platform connecting clients with errand runners, similar to Airbnb but for tasks and errands. Built with Node.js/Express backend and Next.js frontend.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![Next.js](https://img.shields.io/badge/next.js-14.0.0-black.svg)

## 🌟 Features

### For Clients
- **Post Tasks**: Create tasks with descriptions, budgets, and locations
- **Find Runners**: Get matched with trusted, rated runners
- **Secure Payments**: Escrow-based payment system
- **Real-time Chat**: Communicate with runners
- **Rate & Review**: Provide feedback after task completion
- **Track Progress**: Monitor task status in real-time

### For Runners
- **Browse Tasks**: Find available tasks in your area
- **Earn Money**: Accept and complete tasks for payment
- **Build Reputation**: Get rated and build your profile
- **Instant Messaging**: Chat with clients
- **Wallet System**: Manage earnings and withdrawals

### Platform Features
- **User Authentication**: Secure JWT-based authentication
- **Role-based Access**: Client, Runner, and Admin roles
- **Wallet Management**: Top-up, withdraw, track transactions
- **Payment Integration**: PayGate payment gateway
- **Real-time Notifications**: Socket.IO for instant updates
- **Admin Dashboard**: Manage users, tasks, and payouts
- **Support System**: Ticket-based support
- **Analytics**: Track platform metrics

## 🏗️ Architecture

### Backend (Express + TypeScript)
```
backend/
├── src/
│   ├── models/        # Mongoose schemas
│   ├── routes/        # API endpoints
│   ├── services/      # Business logic
│   ├── middleware/    # Auth, validation, etc.
│   ├── utils/         # Helper functions
│   └── server.ts      # Entry point
├── .env.example
└── package.json
```

### Frontend (Next.js 14 + TypeScript)
```
frontend/
├── app/               # App router pages
│   ├── dashboard/     # User dashboards
│   ├── tasks/         # Task pages
│   ├── wallet/        # Wallet management
│   └── login/         # Auth pages
├── components/        # Reusable components
├── contexts/          # React contexts
├── lib/              # API client & utilities
└── package.json
```

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- MongoDB (local or Atlas)
- npm or yarn

### Backend Setup

1. **Navigate to backend folder**:
   ```bash
   cd backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` file**:
   ```env
   MONGODB_URI=mongodb://localhost:27017/morongwa
   JWT_SECRET=your-super-secret-key
   PORT=5000
   FRONTEND_URL=http://localhost:3000
   ```

5. **Start development server**:
   ```bash
   npm run dev
   ```

Backend will run on http://localhost:5000

### Frontend Setup

1. **Navigate to frontend folder**:
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment**:
   ```bash
   cp .env.example .env.local
   ```

4. **Edit `.env.local` file**:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:5000/api
   NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
   ```

5. **Start development server**:
   ```bash
   npm run dev
   ```

Frontend will run on http://localhost:3000

## 🖥️ Local Run (Windows)

- Install MongoDB and ensure it's running locally.
- In backend, copy `.env.example` to `.env` and adjust as needed. This setup uses port 5001.
- In frontend, copy `.env.local.example` to `.env.local`.

Commands:

```powershell
# Backend (port 5001)
Push-Location "C:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\Morongwa\backend"; $env:PORT=5001; $env:BACKEND_URL="http://localhost:5001"; npm run dev

# Frontend (port 3001)
Push-Location "C:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\Morongwa\frontend"; $env:PORT=3001; npm run dev

# Seed an admin (interactive)
Push-Location "C:\Users\Dell\OneDrive - Bonakude Consulting PTY LTD\Documents\Coding\Morongwa\backend"; npm run create-admin
```

- Backend: http://localhost:5001/api
- Frontend: http://localhost:3001

## 📚 API Documentation

### Authentication

**Register**
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "client"
}
```

**Login**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

### Tasks

**Create Task**
```http
POST /api/tasks
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Pick up groceries",
  "description": "Need someone to pick up groceries from Checkers",
  "category": "shopping",
  "budget": 150.00,
  "location": "Johannesburg CBD"
}
```

**Get Available Tasks**
```http
GET /api/tasks/available
Authorization: Bearer <token>
```

**Accept Task**
```http
POST /api/tasks/:id/accept
Authorization: Bearer <token>
```

See [backend/QUICKSTART.md](backend/QUICKSTART.md) for complete API documentation.

## 🧪 Testing

### Backend Tests
```bash
cd backend
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

### Manual Testing Workflow

1. **Register as Client**:
   - Go to http://localhost:3000/register
   - Select "I need tasks done"
   - Fill in details and register

2. **Create a Task**:
   - Navigate to Client Dashboard
   - Click "Create New Task"
   - Fill in task details

3. **Register as Runner**:
   - Open incognito window
   - Go to http://localhost:3000/register
   - Select "I want to earn"
   - Register as runner

4. **Accept Task**:
   - View available tasks
   - Click "Accept" on a task

5. **Complete Task**:
   - Start task
   - Mark as complete
   - Client reviews runner

6. **Test Wallet**:
   - Top up wallet
   - Check transactions
   - Test withdrawal

## 🔧 Technology Stack

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (jsonwebtoken)
- **Real-time**: Socket.IO
- **Payment**: PayGate integration
- **Validation**: express-validator
- **Security**: helmet, cors, bcrypt
- **Logging**: Winston

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Context API
- **HTTP Client**: Axios
- **Real-time**: Socket.IO Client
- **UI Components**: Lucide React (icons)
- **Notifications**: react-hot-toast
- **Date Handling**: date-fns

## 📦 Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive deployment instructions.

### Quick Deploy

**Backend** (Render):
```bash
# Configure environment variables on Render
# Deploy from GitHub repository
```

**Frontend** (Vercel):
```bash
cd frontend
vercel --prod
```

## 🔐 Security

- **Authentication**: JWT tokens with HTTP-only cookies option
- **Password Hashing**: bcrypt with salt rounds
- **Input Validation**: express-validator on all endpoints
- **SQL Injection Protection**: MongoDB parameterized queries
- **XSS Protection**: helmet middleware
- **CORS**: Configured for specific origins
- **Rate Limiting**: Express rate limiter
- **Environment Variables**: Sensitive data in .env files

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Style

- **Backend**: ESLint + Prettier
- **Frontend**: Next.js ESLint config
- **TypeScript**: Strict mode enabled

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- **Ariel Madisha** - Initial work

## 🙏 Acknowledgments

- PayGate for payment gateway integration
- Socket.IO for real-time functionality
- Next.js team for amazing framework
- Express.js community

## 📞 Support

For support, email support@morongwa.com or create an issue in the repository.

## 🗺️ Roadmap

### Phase 1 (Current)
- [x] User authentication
- [x] Task creation and management
- [x] Runner matching
- [x] Wallet system
- [x] Real-time chat
- [x] Payment integration

### Phase 2 (Planned)
- [ ] Mobile app (React Native)
- [ ] Push notifications
- [ ] Advanced search and filters
- [ ] Task scheduling
- [ ] Insurance integration
- [ ] Multi-language support

### Phase 3 (Future)
- [ ] AI-powered task matching
- [ ] Video verification
- [ ] Background checks
- [ ] Business accounts
- [ ] API for third-party integrations
- [ ] Referral system

## 📊 Project Status

- **Current Version**: 1.0.0
- **Status**: Production Ready
- **Last Updated**: 2024

## 🔗 Links

- **Production**: https://morongwa.vercel.app
- **API Docs**: https://api.morongwa.com/docs
- **Repository**: https://github.com/yourusername/morongwa

---

**Made with ❤️ in South Africa**
