# Runner Tracking System - Visual Flow

## Complete Errand Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT CREATES TASK                          │
│                                                                  │
│  1. Enter pickup address (autocomplete)                          │
│  2. Enter delivery address (autocomplete)                        │
│  3. System calculates distance & suggests fee                    │
│  4. Optional: View nearby runners (15km radius)                  │
│  5. Create task                                                  │
│                                                                  │
│  Status: POSTED ────────────────────────────────────────────────│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RUNNER ACCEPTS TASK                           │
│                                                                  │
│  1. Browse available tasks                                       │
│  2. See: earnings (R38), distance (8km), locations               │
│  3. Click "Accept"                                               │
│  4. Funds escrowed from client wallet                            │
│                                                                  │
│  Status: ACCEPTED ──────────────────────────────────────────────│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RUNNER STARTS ERRAND                          │
│                                                                  │
│  1. Runner arrives at pickup location                            │
│  2. Click "Start Errand" button                                  │
│  3. System starts tracking location                              │
│  4. Client receives notification                                 │
│                                                                  │
│  Status: IN_PROGRESS ───────────────────────────────────────────│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   LIVE LOCATION TRACKING                         │
│                                                                  │
│  Runner App ──▶ Backend ──▶ Socket.IO ──▶ Client App            │
│                                                                  │
│  • Runner location updated every movement                        │
│  • Client sees live position on map                              │
│  • Shows: 🔵 Runner, 🟢 Pickup, 🔴 Delivery                      │
│  • "Open in Maps" / "Directions" buttons                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  RUNNER APPROACHES DESTINATION                   │
│                                                                  │
│  1. Runner gets close to delivery location                       │
│  2. Clicks "Check Arrival" button                                │
│  3. System gets GPS coordinates                                  │
│  4. Calculates distance to destination                           │
│                                                                  │
│  ┌────────────────────────────────────────────────┐             │
│  │ Distance > 100m  │  Distance ≤ 100m            │             │
│  ├──────────────────┼─────────────────────────────┤             │
│  │ "350m to dest"   │  "Arrived! Complete task"   │             │
│  │                  │  + Notify client            │             │
│  └────────────────────────────────────────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RUNNER COMPLETES TASK                         │
│                                                                  │
│  1. Runner at destination (within 100m)                          │
│  2. Clicks "Complete" button                                     │
│  3. Funds released from escrow to runner wallet                  │
│  4. Client receives completion notification                      │
│  5. Client can leave review                                      │
│                                                                  │
│  Status: COMPLETED ─────────────────────────────────────────────│
└─────────────────────────────────────────────────────────────────┘
```

## Fee Calculation Flow

```
Client enters addresses
         │
         ▼
Extract coordinates
         │
         ▼
Calculate distance (Haversine formula)
         │
         ▼
┌─────────────────────────────────────┐
│  Distance = 8km                     │
│  Base radius = 5km                  │
│  Extra distance = 8 - 5 = 3km       │
│                                     │
│  Fee = R8 + (3km × R10/km)          │
│      = R8 + R30                     │
│      = R38                          │
└─────────────────────────────────────┘
         │
         ▼
Display suggested fee to client
(Client can override if needed)
         │
         ▼
Show earnings to runners
```

## Real-time Location Broadcasting

```
┌──────────────┐
│ Runner App   │
│              │
│ Get GPS      │
│ lat: -26.2   │
│ lon: 28.05   │
└──────┬───────┘
       │ PATCH /api/users/:id/location
       │ { lat: -26.2, lon: 28.05 }
       ▼
┌──────────────────────┐
│ Backend Server       │
│                      │
│ 1. Update user.loc   │
│ 2. Find tasks where  │
│    runner is assigned│
│ 3. Emit to Socket.IO │
└──────┬───────────────┘
       │ Socket.IO emit
       │ /locations namespace
       │ room: taskId
       ▼
┌──────────────────────┐
│ Client App           │
│                      │
│ 1. Listen on task rm │
│ 2. Update map marker │
│ 3. Show coordinates  │
└──────────────────────┘
       │
       ▼
┌──────────────────────┐
│ LiveTrackingMap      │
│                      │
│ 🔵 Runner: -26.2,28  │
│ 🟢 Pickup: -26.1,28  │
│ 🔴 Delivery: -26.3,28│
│                      │
│ [Open in Maps]       │
│ [Directions]         │
└──────────────────────┘
```

## Data Models

### Task Model
```typescript
{
  _id: "task123",
  title: "Deliver documents",
  description: "Pick up from office A, deliver to office B",
  budget: 38.00,
  
  // NEW FIELDS
  pickupLocation: {
    type: "Point",
    coordinates: [28.0436, -26.2041],  // [lon, lat]
    address: "123 Main St, Johannesburg"
  },
  deliveryLocation: {
    type: "Point",
    coordinates: [28.0523, -26.2134],
    address: "456 Oak Ave, Johannesburg"
  },
  estimatedDistanceKm: 8.2,
  suggestedFee: 38.00,
  
  status: "in_progress",  // NEW STATUS
  startedAt: "2026-01-12T10:30:00Z",  // NEW FIELD
  
  client: "user123",
  runner: "user456",
  escrowed: true,
  acceptedAt: "2026-01-12T10:00:00Z",
  completedAt: null,
  closedAtDestination: false
}
```

### User Location (Runner)
```typescript
{
  location: {
    type: "Point",
    coordinates: [28.0480, -26.2088],
    updatedAt: "2026-01-12T10:35:00Z"
  }
}
```

## API Endpoints

### New Endpoints
```
POST   /api/tasks/:id/start
       Body: {} 
       Response: { message, task }

POST   /api/tasks/:id/check-arrival
       Body: { lat: -26.2, lon: 28.05 }
       Response: { atDestination: true/false, distance, message }

GET    /api/runners/nearby?lat=-26.2&lon=28.05&radius=15
       Response: { runners: [...], count }

PATCH  /api/users/:id/location
       Body: { latitude: -26.2, longitude: 28.05 }
       Response: { message }
       Side-effect: Broadcasts to Socket.IO
```

### Enhanced Endpoints
```
POST   /api/tasks
       Body: { 
         title, description,
         pickupLocation: { coordinates, address },
         deliveryLocation: { coordinates, address }
       }
       Response: { 
         task with estimatedDistanceKm, suggestedFee 
       }
```

## Socket.IO Events

### Namespace: /locations
```
Client → Server:  'join', taskId
Server → Client:  'runner_location', { 
  runnerId, taskId, lat, lon, timestamp 
}
```

### Namespace: /notifications
```
Server → Client:  'notification', { 
  type: 'TASK_STARTED' | 'RUNNER_ARRIVED',
  message, taskId, timestamp 
}
```

## UI Components Hierarchy

```
ClientDashboard
├── LocationAutocomplete (pickup)
├── LocationAutocomplete (delivery)
├── Distance/Fee Display
├── Nearby Runners List
└── Task Cards
    ├── Fee Breakdown
    ├── Pickup Location
    └── Delivery Location

RunnerDashboard
└── Task Cards
    ├── Earnings Display
    ├── Distance Info
    ├── Pickup/Delivery Locations
    └── Action Buttons
        ├── "Start Errand" (if accepted)
        └── "Check Arrival" (if in_progress)

TaskDetailPage (Client View)
├── Task Info
├── LiveTrackingMap ← Real-time runner position
│   ├── Runner Marker (🔵)
│   ├── Pickup Marker (🟢)
│   ├── Delivery Marker (🔴)
│   ├── "Open in Maps" button
│   └── "Directions" button
└── Status Timeline
```

## Status Transitions

```
POSTED
  ↓ (runner accepts)
ACCEPTED
  ↓ (runner clicks "Start Errand")
IN_PROGRESS
  ↓ (runner at destination, clicks "Complete")
COMPLETED
```

## Security Considerations

- ✅ Only assigned runner can start/complete task
- ✅ Only runner can update their own location
- ✅ Client can only see runner location for their tasks
- ✅ Funds escrowed before task starts
- ✅ 100m threshold prevents fraudulent completion
- ✅ Socket.IO rooms isolated by task ID

---

This comprehensive tracking system ensures transparency, security, and a smooth user experience for both clients and runners!
