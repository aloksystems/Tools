// Alok Systems app catalogue — single source of truth.
// Loaded as a classic script so the site also works when opened directly from disk.
window.ALOK_APPS = [
  {
    "id": "driftlock",
    "name": "DriftLock",
    "slug": "driftlock",
    "category": "Focus & Wellbeing",
    "shortDescription": "Block distraction and stay on task with app-usage control.",
    "description": "DriftLock helps you reduce aimless scrolling by tracking where your time goes and letting you lock distracting apps behind a short focus session. It runs discreetly in the background and uses Android's usage statistics to give you a clear view of your screen time.",
    "icon": "/assets/icons/driftlock.svg",
    "iconIsPlaceholder": true,
    "screenshots": [],
    "features": [
      "Track time spent across apps",
      "Lock distracting apps behind a focus session",
      "Reliable background tracking via a foreground service",
      "Notification reminders while a session is active"
    ],
    "version": "0.1.0",
    "releaseDate": null,
    "androidMinVersion": "Android 8.0 (API 26)",
    "packageName": "com.driftlock.app",
    "fileSize": "15.1 MB",
    "sha256": "70c55f8279d5bd14e3ced72cfbb7136b4fe77c338ffdff62e4ec0a09aee1eaa8",
    "downloadUrl": "/downloads/driftlock.apk",
    "featured": true,
    "status": "available",
    "changelog": [
      "Initial public release."
    ],
    "permissions": [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_SPECIAL_USE",
      "android.permission.PACKAGE_USAGE_STATS",
      "android.permission.POST_NOTIFICATIONS"
    ]
  },
  {
    "id": "vaultix",
    "name": "Vaultix",
    "slug": "vaultix",
    "category": "Security & Privacy",
    "shortDescription": "Keep private files behind biometric-only access.",
    "description": "Vaultix is a private vault that protects sensitive files with your device's biometric security. Unlock access with a fingerprint or face unlock, and keep personal items out of plain sight.",
    "icon": "/assets/icons/vaultix.svg",
    "iconIsPlaceholder": true,
    "screenshots": [],
    "features": [
      "Biometric-secured access",
      "Private vault for sensitive files",
      "Fingerprint and face unlock support"
    ],
    "version": "1.0.0",
    "releaseDate": null,
    "androidMinVersion": "Android 8.0 (API 26)",
    "packageName": "com.vaultix.vaultix",
    "fileSize": "23.3 MB",
    "sha256": "708bbba2db70e7245a355816944ff44f6aa6c7a95f6ce5dc05b31ec82a2a0431",
    "downloadUrl": "/downloads/vaultix.apk",
    "featured": true,
    "status": "available",
    "changelog": [
      "Initial public release."
    ],
    "permissions": [
      "android.permission.USE_BIOMETRIC",
      "android.permission.USE_FINGERPRINT"
    ]
  },
  {
    "id": "fake-caller",
    "name": "Fake Caller",
    "slug": "fake-caller",
    "category": "Utilities",
    "shortDescription": "Schedule a believable fake incoming call, any time.",
    "description": "Fake Caller lets you schedule a realistic incoming call to step out of a meeting or conversation gracefully. You can set the caller name, choose when it arrives, and it rings as a normal call.",
    "icon": "/assets/icons/fake-caller.svg",
    "iconIsPlaceholder": true,
    "screenshots": [],
    "features": [
      "Schedule fake calls at the exact time you need",
      "Customisable caller name",
      "Full-screen incoming call experience",
      "Works after a device reboot"
    ],
    "version": "1.0.0",
    "releaseDate": null,
    "androidMinVersion": "Android 8.0 (API 26)",
    "packageName": "com.fakecaller.app",
    "fileSize": "17.8 MB",
    "sha256": "3d21662ed35680aaa333dbf7bea855ef5cd5254df33689029284aa45cea59954",
    "downloadUrl": "/downloads/fake-caller.apk",
    "featured": false,
    "status": "available",
    "changelog": [
      "Initial public release."
    ],
    "permissions": [
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.RECEIVE_BOOT_COMPLETED",
      "android.permission.SCHEDULE_EXACT_ALARM",
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.VIBRATE",
      "android.permission.WAKE_LOCK"
    ]
  },
  {
    "id": "apexclasses-app",
    "name": "Apex Classes",
    "slug": "apexclasses-app",
    "category": "Education",
    "shortDescription": "Stay connected to Apex Classes learning content.",
    "description": "Apex Classes is the companion app for the Apex Classes learning platform. It brings class-related content and updates to your device so you can keep up from anywhere.",
    "icon": "/assets/icons/apexclasses-app.svg",
    "iconIsPlaceholder": true,
    "screenshots": [],
    "features": [
      "Access Apex Classes content",
      "Receive updates and notices",
      "Designed for Android 7.0 and above"
    ],
    "version": "1.0.0",
    "releaseDate": null,
    "androidMinVersion": "Android 7.0 (API 24)",
    "packageName": "com.apexclass.apex_class",
    "fileSize": "54.2 MB",
    "sha256": "c3f14bbc889a2a99dd87caa1a13ce15b1d8d2fe1df798ea68bd924cc58a82590",
    "downloadUrl": "/downloads/apexclasses-app.apk",
    "featured": false,
    "status": "available",
    "changelog": [
      "Initial public release."
    ],
    "permissions": [
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.INTERNET"
    ]
  }
];
