# ResQZone  

**ResQZone** is a full-stack mobile disaster-preparedness app that empowers residents, community volunteers, and local officers through gamified learning, real-time alerts, offline resources, and collaborative tools to strengthen community resilience before and during emergencies.  

---

## Features  

### Client (React Native + Expo Go + Redux Toolkit)  
- **Authentication**: OTP-based registration/login with GPS auto-detected country code and silent verification.  
- **Preparedness Checklists**: Disaster-specific tasks with progress tracking.  
- **Gamified Quizzes**: XP, levels, and badges to encourage learning.  
- **Real-Time Alerts & Weather**: Location-based hazard alerts (advisory, watch, emergency) with offline caching.  
- **Resource Hub**: Offline survival guides, safety documents, and bookmarking.  
- **Emergency Quick Access (SOS)**: One-tap calls, SOS messages, and live GPS sharing.  
- **Community Collaboration**: Auto-enrolment in local groups (5 km radius), real-time chat, and resource sharing.  
- **Disaster News Feed**: Curated disaster-related news with bookmarking and caching.  
- **Accessibility & Security**: Dark/light mode, AES-encrypted data, and secure API communication.  

### Server (Node.js + Express + MySQL on Ubuntu Linux)  
- OTP-based authentication and authorization.  
- REST APIs for alerts, gamification, SOS, chat, and resources.  
- Real-time collaboration with **Socket.IO**.  
- Geo-location APIs using the **Haversine formula**.  
- Weather integration via **OpenWeatherMap API** with caching.  
- Disaster news aggregation with pagination.  
- Structured storage in **MySQL**, with **SQLite caching** for offline continuity.  
- Secure deployment on a hardened **Ubuntu Linux Server**.  

---

## User Roles  

- **Resident**: Uses checklists, quizzes, alerts, offline guides, and SOS.  
- **Community Volunteer**: Shares safe routes, broadcasts aid stations, and supports neighbours in group chat.  
- **Local Officer**: Sends alerts, creates quizzes, and organizes community collaboration.  

---

## Credentials to Login

- **Evacuating Resident**
      Phone: +44 7777777777

- **Community Volunteer**:
      Phone: +44 0000000000

- **Local Officer**:
      Phone: +44 1111111111


---

## OTP Authentication (Academic Project Note)

- The app uses **OTP-based authentication with auto-verification**.
- In a real production system, OTPs would be sent via **SMS gateways**.
- Due to **cost constraints** and the **academic nature of this project**, SMS delivery is **not enabled**.
- Instead, OTPs are **simulated and auto-verified** in the background for demonstration purposes.

---

## Project Structure

```
ResQZone/
├── Client/                  # React Native app (Expo Go + Expo Snack)
│   ├── src/
│   │   ├── screens/         # UI screens
│   │   ├── components/      # Reusable UI components
│   │   └── utils/           # API helpers
│   └── package.json
│
├── Server/                  # Node.js + Express backend
│   ├── src/
│   │   ├── config/          # DB config
│   │   ├── migrations/      # SQLite schema setup
│   │   ├── routes/          # REST API endpoints
│   │   └── server.js        # Express entry point
│   ├── tests/               # Jest test suite
│   └── package.json
│
├── README.md
```

---

## Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v18+)
- [npm](https://www.npmjs.com/)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- An **Ubuntu Linux Server** instance for backend deployment

---

## Permissions (Required)

To use core features, allow the following permissions when prompted:

- **Location** – find nearby providers and share your location during consultation.
- **Camera** – capture images (documents, symptoms) for chat and doctor verification.
- **Photos/Media/Files (Storage)** – upload credentials, share images, and download documents or reports.
- **Microphone** – send voice messages in chat.
- **Contacts** – To allow contacts for quick SOS.

If you previously denied a permission, enable it in your device settings:
- **Android**: Settings → Apps → **ResQZone** → Permissions.
- **iOS**: Settings → **ResQZone** → enable the listed permissions.

---


### 1. Clone the Repositories  
- **Client**: [Reqzone-Client](https://github.com/sab54/Reqzone-Client)  
- **Server**: [Resqzone-Server](https://github.com/sab54/Resqzone-Server)

---

### 2. Backend Setup (Server)

```bash
cd Resqzone-Server
npm install
npm start
```
Server runs on: **http://localhost:3000**

#### For Production Deployment on Ubuntu Linux
1. Launch an **Ubuntu Linux instance**.
2. Install Node.js & npm.

```bash
   cd Resqzone-Server
   npm install -g pm2
   pm2 start src/server.js
   pm2 save
```
---

## Running the Client

There are two ways to run and test the **ResQZone client app**:

### 1. Expo Go (Mobile – Recommended)

1. Install **Expo Go** on your mobile device:
   - [iOS (App Store)](https://apps.apple.com/app/expo-go/id982107779)
   - [Android (Google Play)](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. Start the client locally in another terminal:
   ```bash
   cd Reqzone-Client
   npm install
   npm start
   ```

4. Scan the QR code from your terminal/browser.
   - iOS → scan with **Camera app**.
   - Android → open **Expo Go** and scan the QR code.
   - OR Enter exp://exp.64bitme.com

5. The app opens directly in **Expo Go**.

---

## Testing

### Backend
```bash
cd Resqzone-Server
npm test
```

### Client
```bash
cd Reqzone-Client
npm test
```

---

## Troubleshooting (Quick)
- **Cannot reach backend from phone**: confirm `API_BASE` uses your machine’s **IPv4 and port 3000**, your phone and computer are on the **same network**, and Ubuntu Linux Security Group allows inbound 3000 if pointing to Ubuntu Linux.
- **QR code opens but app can’t fetch data**: check that the backend is running and CORS is configured if needed.
- **Location/Camera not working**: ensure permissions are **allowed** in device settings.
- **PM2 shows app stopped**: run `pm2 logs ResQZone` to inspect errors; fix and `pm2 restart ResQZone`.

---
