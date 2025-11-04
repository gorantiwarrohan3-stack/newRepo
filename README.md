# prasadamConnect

## React + Firebase PWA (Phone OTP Login)

### Features
- Phone number + OTP auth using Firebase
- PWA: manifest + service worker for basic offline cache
- Shows "Hello World" after login

### Prerequisites
- Node 18+
- A Firebase project with Phone Authentication enabled
  - In Firebase Console: Build → Authentication → Sign-in method → enable Phone
  - For localhost, add your domain (http://localhost:5173) to Authorized domains

### Setup
1. Install deps:
   ```bash
   npm install
   ```
2. Create `.env` in project root (Vite loads variables starting with `VITE_`):
   ```bash
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```
3. Run dev server:
   ```bash
   npm run dev
   ```

### Notes
- Enter phone numbers in E.164 format, e.g. `+12345678901`.
- reCAPTCHA is set to invisible; ensure you've configured your domain in Firebase Console.
- For production hosting over HTTPS is required for service workers.
