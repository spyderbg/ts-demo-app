For an internal company tool, I would not ask users to run:

npm install
npm run dev


That's a developer workflow.

Instead, I'd turn it into a normal application. There are several approaches.

Option 1: Self-contained desktop app (recommended)

Package the React frontend and Node backend together.

The user simply launches:

gda-sync


or clicks:

GDA Sync


in the Ubuntu application menu.

Startup flow:

gda-sync
    ↓
Start Node backend
    ↓
Open browser automatically
    ↓
http://localhost:5175


The user never sees a terminal.

Example launcher:

import open from 'open';

startServer();

await open('http://localhost:5175');


On Ubuntu this feels like a normal desktop application.

Option 2: Native wrapper around browser

You can embed the browser using:

Electron
Electron
 └── React UI
 └── Node backend


User launches:

GDA Sync


and gets a native window.

No visible browser.

This provides the most "application-like" experience.

Option 3: Browser + system tray

Another nice approach:

gda-sync


starts:

local web server
system tray icon

and opens:

http://localhost:5175


in Chrome.

This is how quite a few developer tools work nowadays.

Examples:

Portainer
Home Assistant
Jenkins
SonarQube


The UI is a browser, but users think of it as an application.

Option 4: Single executable

You can package Node.js into the executable.

Tools:

pkg
nexe


or similar bundlers.

Then the user receives:

gda-sync


only.

No Node installation required.

Run:

./gda-sync


The executable:

starts backend
opens browser
serves React UI

This is probably what I'd do.

What I'd build for your project

Given your requirements:

search/filter
copy files
open source/GDA folders
DDS support
future UI growth
Ubuntu-focused

I'd choose:

React
Fastify
TypeScript


and package it as:

gda-sync


with startup behavior:

User launches app
    ↓
Backend starts
    ↓
Browser opens automatically
    ↓
Local React UI appears


Project structure:

gda-sync/
├── backend/
├── frontend/
├── scripts/
├── config/
├── package.json
└── build/


From the user's perspective it behaves exactly like a single application, while internally you're benefiting from the simplicity and rich UI capabilities of a web application.

For a studio asset-management tool on Ubuntu, this is the architecture I'd personally pick over Electron unless you specifically need the UI to live inside a native desktop window. The browser-based version is simpler, lighter, and often easier to maintain.
