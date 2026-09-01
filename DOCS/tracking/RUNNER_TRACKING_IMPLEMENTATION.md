# Runner Tracking & Fee Calculation Implementation

## Summary
Implemented a comprehensive runner tracking system with automatic fee calculation and destination-based completion for the Morongwa errand runner marketplace.

## Features Implemented

### 1. Task Status Flow Enhancement
- **Added `in_progress` status** to Task model
- **New fields**: `startedAt`, `estimatedDistanceKm`, `suggestedFee`
- **Pickup/Delivery locations**: Tasks now support separate pickup and delivery locations with coordinates and addresses

### 2. Backend API Endpoints

#### POST /api/tasks/:id/start
- Runner starts the errand and begins tracking
- Updates task status from `accepted` → `in_progress`
- Records `startedAt` timestamp
- Notifies client in real-time

#### POST /api/tasks/:id/check-arrival
- Runner checks if they're at the destination
- Calculates distance from current position to delivery location
- Auto-detects arrival within 100m threshold
- Sends notification to client when runner arrives

#### Enhanced POST /api/tasks
- Automatically calculates distance between pickup and delivery
- Suggests fee based on distance (R8 booking fee + R10/km beyond 5km)
- Notifies matched runners with estimated earnings

### 3. Fee Calculation System

#### Pricing Configuration (ZAR)
```javascript
{
  baseRadiusKm: 5,        // Free distance included
  bookingFeeLocal: 8.0,   // Base fee in ZAR
  perKmRateLocal: 10.0    // Rate per km beyond base
}
```

#### Formula
```
Suggested Fee = R8 + (max(0, distance - 5km) × R10/km)

Examples:
- 3km errand: R8 (within base radius)
- 8km errand: R8 + (3km × R10) = R38
- 15km errand: R8 + (10km × R10) = R108
```

### 4. Client Dashboard Enhancements

#### Task Creation
- **Location autocomplete** using OpenStreetMap Nominatim API
- **Pickup and delivery address fields** with coordinates
- **Real-time distance calculation** as addresses are entered
- **Suggested fee display** with option to override
- **Nearby runners finder** - Shows runners within 15km radius

#### Task Display
- Shows estimated distance and suggested fee
- Displays separate pickup and delivery addresses
- Visual indicators for different location types

### 5. Runner Dashboard Enhancements

#### Task Cards
- **Earnings clearly displayed** with distance information
- **Separate pickup/delivery locations** shown
- **Action buttons based on status**:
  - `accepted` → "Start Errand" button
  - `in_progress` → "Check Arrival" button

#### Start Errand Flow
1. Runner clicks "Start Errand"
2. Status changes to `in_progress`
3. Location tracking begins
4. Client receives notification

#### Check Arrival Flow
1. Runner clicks "Check Arrival"
2. System gets runner's current GPS position
3. Calculates distance to destination
4. If within 100m → notifies client of arrival
5. Shows distance remaining if not yet arrived

### 6. Live Tracking System

#### Real-time Location Updates
- **Socket.IO namespace**: `/locations`
- Runners emit location updates via PATCH /api/users/:id/location
- Backend broadcasts to clients of active tasks
- Updates visible in real-time on client's task detail page

#### LiveTrackingMap Component
- Visual map interface showing:
  - 🔵 Runner current position
  - 🟢 Pickup location
  - 🔴 Delivery destination
- "Open in Maps" button for Google Maps navigation
- "Directions" button for route from runner to destination
- Auto-updates as runner moves

### 7. Location Tracking Architecture

```
Runner App
   ↓ (PATCH /api/users/:id/location)
Backend Server
   ↓ (Socket.IO emit)
Client App (/locations namespace)
   ↓
LiveTrackingMap Component
```

### 8. Frontend Components

#### New Components
- **LocationAutocomplete**: Address search with autocomplete
- **LiveTrackingMap**: Real-time runner position display with maps integration

#### Enhanced Components
- **ClientDashboard**: Fee breakdown, distance display, nearby runners
- **RunnerDashboard**: Earnings display, start/arrival buttons
- **TaskDetailPage**: Live tracking map integration

### 9. API Integration

#### New API Methods
```typescript
tasksAPI.startTask(id)
tasksAPI.checkArrival(id, { lat, lon })
```

#### Updated Types
```typescript
interface Task {
  pickupLocation?: GeoLocation;
  deliveryLocation?: GeoLocation;
  estimatedDistanceKm?: number;
  suggestedFee?: number;
  startedAt?: string;
  status: 'posted' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
}
```

## User Flows

### Client Flow
1. **Create Task**: Enter pickup/delivery addresses → See distance & suggested fee → Optional: find nearby runners → Create
2. **Track Runner**: View task → See live runner location on map → Receive notifications (started, arrived)
3. **Complete**: Runner completes → Confirm delivery → Funds released

### Runner Flow
1. **Accept Task**: Browse tasks → See earnings & distance → Accept task
2. **Start Errand**: Go to pickup → Click "Start Errand" → Status → in_progress
3. **Navigate**: Location tracked automatically → Client sees live position
4. **Check Arrival**: Near destination → Click "Check Arrival" → System confirms if within 100m
5. **Complete**: At destination → Complete task → Earnings released

## Technical Details

### Distance Calculation
- **Haversine formula** for accurate geodesic distance
- Accounts for Earth's curvature
- Returns distance in kilometers

### Arrival Detection
- **Threshold**: 100 meters (0.1 km)
- Uses GPS coordinates from runner's device
- Prevents premature completion

### Real-time Updates
- **Socket.IO** for bidirectional communication
- Namespace isolation (`/locations`, `/notifications`)
- Room-based broadcasting (by task ID)

## Testing

### Manual Test Flow
1. Create task with pickup/delivery addresses
2. Accept as runner
3. Start errand
4. Update runner location (PATCH /api/users/:id/location)
5. Observe client sees live position
6. Check arrival when near destination
7. Complete task

## Future Enhancements
- [ ] Route optimization for multiple stops
- [ ] ETA calculation based on traffic
- [ ] Offline location caching
- [ ] Push notifications for mobile apps
- [ ] Historical route playback
- [ ] Geofencing alerts

## Files Modified/Created

### Backend
- `src/data/models/Task.ts` - Added new fields and status
- `src/routes/tasks.ts` - Added start, check-arrival endpoints
- `src/routes/admin.ts` - Vehicle/PDP verification
- `src/routes/users.ts` - Location update endpoint
- `src/routes/runners.ts` - NEW: Nearby runners API
- `src/services/notification.ts` - Location broadcasting
- `backend/.env.production.example` - MAILER config
- `backend/jest.config.cjs` - NEW: Jest configuration
- `backend/tests/notification.test.ts` - NEW: Email tests

### Frontend
- `components/LocationAutocomplete.tsx` - NEW: Address search
- `components/LiveTrackingMap.tsx` - NEW: Live tracking UI
- `app/dashboard/client/page.tsx` - Fee breakdown, distance
- `app/dashboard/runner/page.tsx` - Earnings, action buttons
- `app/tasks/[id]/page.tsx` - Live map integration
- `lib/api.ts` - New API methods
- `lib/types.ts` - Updated Task interface
- `lib/pricing.ts` - NEW: Pricing calculations

## Configuration

### Environment Variables
```env
# Socket.IO URL for real-time updates
NEXT_PUBLIC_SOCKET_URL=http://localhost:5001

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:5001/api
```

## Deployment Notes
- Ensure Socket.IO works with your hosting provider
- Configure CORS for Socket.IO connections
- Test geolocation permissions on mobile devices
- Consider rate limiting for location updates (e.g., max 1 update per 5 seconds)

---

**Implementation Date**: January 12, 2026  
**Status**: ✅ Complete and ready for testing
