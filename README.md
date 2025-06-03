# selfbot
## requirements
- **Node.js** v22+
- **PostgreSQL**
- **Redis** or **Valkey** (unless using the `inMemory` cache backend)
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
  "bot": {
    "rateLimits": "regular",            // "regular" | "verified" - https://dev.twitch.tv/docs/chat/#verified-bots
    "entryChannelLogin": "",            // first channel to join
    "login": "",
    "id": "0"
  },
  "commands": {
    "defaultPrefix": "!",
    "loadUnsafe": true,                 // enable insecure commands
    "suggestClosest": true              // suggest closest valid command on typo
  },
  "messages": {
    "tosViolationPlaceholder": "message goes against twitch TOS",  // replaces messages that match one of the TOS patterns
    "responsePartsSeparator": " · ",    // separator for parts of command output
    "logByDefault": true                // applies to newly joined channels at runtime
  },
  "twitch": {
    "ircTransport": "websocket",        // "tcp" | "websocket"
    "sender": {
      "transport": "irc",               // "irc" | "gql"
      "irc": {                          // applies to "irc" transport
        "connectionsPoolSize": 10
      }
    },
    "hermes": {
      "maxConnections": 20,             // max amount of WS connections to hermes
      "maxTopicsPerConnection": 50,     // max amount of topics per hermes connection
      "autoJoinRaids": true,
      "autoAcknowledgeChatWarnings": true,
      "autoJoinWatching": true          // auto-join watched channels detected via presence
    }
  },
  "retry": {
    "maxRetries": 3,                    // max retry attempts on failure
    "baseDelayMs": 200,
    "jitter": 0.5
  },
  "cache": "redis",                     // "redis" | "valkey" | "inMemory" -- "valkey" is an alias for "redis"
  "db": {
    "messagesFlushIntervalMs": 2500,    // how often to flush queued messages
    "maxMessagesPerChannelFlush": 150   // max amount of messages to flush per channel at once
  },
  "hastebin": {
    "instance": "https://paste.ivr.fi", // base URL of the hastebin server (POST to /documents, GET from /{key}, /raw/{key})
    "maxPasteLength": 1500000           // 0 for unlimited
  },
  "metrics": {
    "enabled": false,
    "sampleIntervalMs": 5000,           // how often to sample and compute rates
    "logIntervalMs": 1800000,           // how often to log the latest snapshot (0 to disable)
    "prometheus": {
      "enabled": false,
      "host": "127.0.0.1",
      "port": 9101,
      "endpoint": "/metrics",
      "prefix": "selfbot_"
    }
  },
  "shell": "/bin/bash",
  "logger": {
    "level": "info",                    // "debug" | "info" | "warning" | "error" | "none"
    "colorize": true                    // enable colored terminal output
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
DB_MAX_CLIENTS=40
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
