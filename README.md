# selfbot
> Requires Node.js version >= v22  
> Make sure **Redis** and **PostgreSQL** are installed and configured on your system before proceeding with the steps below.
## install dependencies
```bash
npm i
```
## configure
```bash
cp example-config.json config.json
vi config.json
```
```jsonc
{
  "logMessagesByDefault": true,          // applies to newly joined channels at runtime
  "loadUnsafeCommands": true,            // enable insecure commands
  "getClosestCommand": true,             // suggest closest valid command on typo
  "autoJoinRaids": true,                 // auto-join raids
  "autoAcknowledgeChatWarnings": true,   // auto-acknowledge chat warnings
  "autoJoinWatching": true,              // auto-join watched channels detected via presence
  "shell": "/bin/bash",                  // shell used by the `shell` command
  "ircClientTransport": "websocket",     // "tcp" | "websocket"
  "joinRetries": 3,                      // retry joining a channel N times before failing
  "defaultPrefix": "!",                  // command prefix
  "responsePartsSeparator": " · ",       // separator for parts of command output
  "againstTOS": "message goes against twitch TOS", // message shown if content triggered internal banphrase
  "hastebinInstance": "https://paste.ivr.fi",
  "rateLimits": "regular",               // "regular" | "verified" - https://dev.twitch.tv/docs/chat/#verified-bots
  "authedClientConnectionsPoolSize": 10, // create N authenticated tmi connections
  "maxHermesConnections": 10,            // maximum amount of WS hermes connections to create
  "maxHermesTopicsPerConnection": 50,    // maximum amount of topics a single connection can be subscribed to
  "messagesBatchInsertIntervalMs": 2500, // how often to flush queued messages
  "maxMessagesBatchInsertSize": 500,     // max number of messages to flush per batch
  "bot": {
    "login": "",
    "id": "0"
  },
  "entry_channel": {
    "login": ""                          // first channel to join
  },
  "logger": {
    "level": "info",                     // "debug" | "info" | "warning" | "error" | "none"
    "colorize": true                     // enable colored terminal output
  },
  "metrics": {
    "sampleIntervalMs": 5000,            // how often to sample and compute rates
    "logIntervalMs": 1800000,            // how often to log the latest snapshot (0 to disable)
    "prometheus": {
      "enabled": false,
      "host": "127.0.0.1",
      "port": 9101,
      "endpoint": "/metrics",
      "prefix": "selfbot_"
    }
  }
}
```
## obtain device OAuth token
```bash
npm run oauth
```
You'll see output like this:
```
https://www.twitch.tv/activate?device-code=ABCDEFGH
code: ABCDEFGH (expires in 30 minutes)
```
1. Open the link in a browser.
2. Enter the code.
3. Click **Authorize**.
4. Save the `access_token` from the response.
## create the database
```bash
sudo -u postgres psql
```
Inside the `psql` prompt, run:
```sql
CREATE USER myuser WITH PASSWORD 'mypassword';
CREATE DATABASE mydatabase OWNER myuser;
\q
```
## set environment variables
```bash
cp example.env .env
vi .env
```
```env
TWITCH_ANDROID_CLIENT_ID=kd1unb4b3q4t58fwlpcbzcbnm76a8fp
TWITCH_ANDROID_TOKEN= # access_token
DB_USER=
DB_HOST=127.0.0.1
DB_NAME=
DB_PASSWORD=
DB_PORT=5432
DB_MAX_CLIENTS=20
REDIS_USER=
REDIS_HOST=
REDIS_PASSWORD=
REDIS_PORT=
REDIS_SOCKET=         # optional unix domain socket - overrides host & port if provided
```
## run
```bash
node .
```
