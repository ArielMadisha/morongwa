# Quick Start Guide - Runner Tracking System

## 🚀 Getting Started

### Backend Setup
```bash
cd backend
npm install
npm run build
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### Environment Variables

#### Backend (.env)
```env
PORT=5001
NODE_ENV=development
MONGO_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5001

# For development email testing
MAILER=ethereal
```

#### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:5001/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:5001
```

## 📋 Testing the New Features

### 1. Test Fee Calculation

**As Client:**
1. Login as client
2. Click "Create New Task"
3. Enter pickup address (e.g., "Johannesburg CBD")
4. Enter delivery address (e.g., "Sandton City")
5. Watch as:
   - Distance calculates automatically
   - Suggested fee appears (e.g., R38 for 8km)
6. Click "Find nearby runners" to see available runners

**Expected Result:** Distance and fee calculated based on coordinates

### 2. Test Runner Tracking

**As Runner:**
1. Login as runner
2. Go to "Available" tab
3. See tasks with earnings and distance
4. Accept a task

**Expected Result:** Task moves to "My tasks" with "Start Errand" button

### 3. Test Live Location Tracking

**As Runner:**
1. Open accepted task
2. Click "Start Errand"
3. Update location using API:
```bash
curl -X PATCH http://localhost:5001/api/users/YOUR_RUNNER_ID/location \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"latitude": -26.2041, "longitude": 28.0436}'
```

**As Client (different browser/incognito):**
1. Open the same task
2. See live runner location on map with coordinates
3. Click "Open in Maps" to view in Google Maps

**Expected Result:** Client sees runner's location update in real-time

### 4. Test Arrival Detection

**As Runner:**
1. With task in "in_progress" status
2. Click "Check Arrival"
3. Allow browser location access

**Expected Result:**
- If > 100m away: "350m to destination"
- If ≤ 100m away: "You have arrived! Complete task"
- Client receives "Runner arrived" notification

### 5. Test Complete Flow End-to-End

```
Client                          Runner                          System
══════                          ══════                          ══════
1. Create task                                                 Calculate fee
   - Pickup: JHB CBD                                          Distance: 8km
   - Delivery: Sandton                                        Fee: R38
                               2. See task
                                  Earnings: R38
                                  Distance: 8km
                               
                               3. Accept task              Escrow R38
                               
                               4. Start errand             Status → in_progress
                                                          Start tracking

5. See live location ←────────────────────────────────── Location updates

                               6. Near destination
                                  Check arrival           Calculate distance
                               
                               7. Arrived (< 100m)
                               
6. "Runner arrived" ←──────────────────────────────────── Send notification

                               8. Complete task            Release R38 to runner
                                                          Status → completed

7. Confirm delivery
   Leave review
```

## 🔧 API Testing with Postman/cURL

### 1. Create Task with Locations
```bash
POST http://localhost:5001/api/tasks
Authorization: Bearer {CLIENT_TOKEN}
Content-Type: application/json

{
  "title": "Deliver documents",
  "description": "Pick up from office A, deliver to office B",
  "pickupLocation": {
    "type": "Point",
    "coordinates": [28.0436, -26.2041],
    "address": "123 Main St, Johannesburg"
  },
  "deliveryLocation": {
    "type": "Point",
    "coordinates": [28.0523, -26.2134],
    "address": "456 Oak Ave, Johannesburg"
  }
}

Response:
{
  "task": {
    "_id": "...",
    "estimatedDistanceKm": 8.2,
    "suggestedFee": 38.0,
    "budget": 38.0,
    ...
  }
}
```

### 2. Accept Task
```bash
POST http://localhost:5001/api/tasks/{TASK_ID}/accept
Authorization: Bearer {RUNNER_TOKEN}

Response:
{
  "message": "Task accepted successfully",
  "task": { ... }
}
```

### 3. Start Errand
```bash
POST http://localhost:5001/api/tasks/{TASK_ID}/start
Authorization: Bearer {RUNNER_TOKEN}

Response:
{
  "message": "Task started successfully",
  "task": {
    "status": "in_progress",
    "startedAt": "2026-01-12T10:30:00Z",
    ...
  }
}
```

### 4. Update Runner Location
```bash
PATCH http://localhost:5001/api/users/{RUNNER_ID}/location
Authorization: Bearer {RUNNER_TOKEN}
Content-Type: application/json

{
  "latitude": -26.2041,
  "longitude": 28.0436
}

Response:
{
  "message": "Location updated successfully"
}
```

### 5. Check Arrival
```bash
POST http://localhost:5001/api/tasks/{TASK_ID}/check-arrival
Authorization: Bearer {RUNNER_TOKEN}
Content-Type: application/json

{
  "lat": -26.2134,
  "lon": 28.0523
}

Response (if close):
{
  "atDestination": true,
  "distance": 0.08,
  "message": "You have arrived at the destination. Please complete the task."
}

Response (if far):
{
  "atDestination": false,
  "distance": 2.5,
  "message": "2500m to destination"
}
```

### 6. Complete Task
```bash
POST http://localhost:5001/api/tasks/{TASK_ID}/complete
Authorization: Bearer {RUNNER_TOKEN}

Response:
{
  "message": "Task completed successfully",
  "task": {
    "status": "completed",
    "completedAt": "2026-01-12T11:00:00Z",
    ...
  }
}
```

### 7. Find Nearby Runners
```bash
GET http://localhost:5001/api/runners/nearby?lat=-26.2041&lon=28.0436&radius=15
Authorization: Bearer {CLIENT_TOKEN}

Response:
{
  "runners": [
    {
      "_id": "runner1",
      "name": "John Doe",
      "lat": -26.2050,
      "lon": 28.0440,
      "distanceKm": 0.5
    },
    ...
  ],
  "count": 5
}
```

## 🐛 Troubleshooting

### Location tracking not working
- ✅ Check browser has location permissions
- ✅ Verify Socket.IO connection in browser console
- ✅ Ensure CORS configured for Socket.IO in backend
- ✅ Check NEXT_PUBLIC_SOCKET_URL environment variable

### Fee calculation shows 0
- ✅ Verify both pickup and delivery coordinates are set
- ✅ Check coordinates format: [longitude, latitude]
- ✅ Ensure PRICING_CONFIG imported correctly

### "Check Arrival" button not appearing
- ✅ Task status must be "in_progress"
- ✅ Must be logged in as the assigned runner
- ✅ Refresh task data to see updated status

### Runner location not visible to client
- ✅ Task must be in "accepted" or "in_progress" status
- ✅ Runner must have updated their location at least once
- ✅ Check Socket.IO connection on client side
- ✅ Verify client joined the correct room (taskId)

## 📱 Mobile Testing Tips

### Geolocation
- Use actual device GPS for accurate testing
- Desktop browsers: Use DevTools location override
- Chrome: DevTools → Sensors → Location

### Socket.IO on Mobile
- Ensure WebSocket support enabled
- Test both WiFi and mobile data
- Check firewall/proxy settings

## 🎯 Success Criteria

✅ **Fee Calculation**
- Distance calculated between pickup/delivery
- Fee shows: R8 + (extra_km × R10)
- Visible to both client and runner

✅ **Location Tracking**
- Runner location updates in real-time
- Client sees live position on map
- Map shows pickup, delivery, and runner markers

✅ **Arrival Detection**
- System detects when runner within 100m
- Client notified of arrival
- Distance countdown shown to runner

✅ **Status Flow**
- posted → accepted → in_progress → completed
- Each transition properly authorized
- Timestamps recorded

✅ **Escrow & Payment**
- Funds locked when task accepted
- Released only when completed
- Proper wallet balance updates

## 📊 Monitoring

### Check Logs
```bash
# Backend logs
cd backend
tail -f logs/combined.log | grep -i "location\|arrival\|start"

# Check Socket.IO connections
tail -f logs/combined.log | grep -i "socket"
```

### Database Queries
```javascript
// Check task with tracking data
db.tasks.findOne({ _id: ObjectId("...") })

// Find in-progress tasks
db.tasks.find({ status: "in_progress" })

// Check runner locations
db.users.find({ role: "runner", "location.coordinates": { $exists: true } })
```

## 🎉 Demo Script

**Perfect Demo Flow (5 minutes):**

1. **Setup** (30s)
   - Open two browser windows (Client + Runner)
   - Login to both accounts

2. **Create Task** (1min)
   - Client: Create task with addresses
   - Show distance calculation (8km)
   - Show suggested fee (R38)
   - Click "Find nearby runners"

3. **Accept & Start** (1min)
   - Runner: Accept task
   - Show earnings (R38)
   - Click "Start Errand"

4. **Track** (2min)
   - Update runner location (API call or browser)
   - Client: Watch map update in real-time
   - Show pickup/delivery markers

5. **Arrive & Complete** (30s)
   - Runner: Click "Check Arrival"
   - Show arrival confirmation
   - Complete task

6. **Verify** (30s)
   - Check runner wallet balance (+R38)
   - Client can review
   - Task status: completed

---

**System is ready for testing!** 🚀

For questions or issues, check:
- [RUNNER_TRACKING_IMPLEMENTATION.md](./RUNNER_TRACKING_IMPLEMENTATION.md) - Full feature documentation
- [TRACKING_FLOW_DIAGRAM.md](./TRACKING_FLOW_DIAGRAM.md) - Visual flow diagrams
