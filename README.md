# selfbot
## disclaimer
Uses undocumented Twitch APIs to access data not intended for third-party use.  
**This violates Twitch's TOS.**  
Use at your own risk.
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
    "entryChannelLogin": "",            // initial channel to join
    "login": "",
    "id": "0"
  },
  "commands": {
    "defaultPrefix": "!",
    "loadUnsafe": true,                 // enable insecure commands
    "suggestClosest": false             // suggest closest valid command on typo
  },
  "messages": {
    "tosViolationPlaceholder": "message goes against twitch TOS", // replaces messages that match one of the TOS patterns
    "responsePartsSeparator": " · ",    // separator for parts of command output
    "logByDefault": true                // applies to newly joined channels at runtime
  },
  "twitch": {
    "sender": {
      "backend": "irc",                 // "irc" | "gql"
      "clientNoncePlatform": "web"      // "web" | "android" | "ios"
    },
    "irc": {
      "socket": "websocket",            // "tcp" | "websocket"
      "maxChannelCountPerConnection": 100,
      "connectionsPoolSize": 10
    },
    "hermes": {
      "subscribeToUserTopics": true,    // requires the TWITCH_HERMES_TOKEN environment variable to be set
      "maxConnections": 100,            // max number of WS connections to hermes
      "maxTopicsPerConnection": 50,     // max number of topics per hermes connection
      "autoJoinRaids": true,
      "autoAcknowledgeChatWarnings": true,
      "autoJoinWatching": false,        // auto-join watched channels detected via presence
      "autoBet": {
        "enabled": false,               // auto-bet on predictions
        "ignoreOwnPredictions": true,
        "minRequiredBalance": 10,       // min balance required to place a bet
        "strategy": {
          "betDelayPercent": 80,        // delay bet until this percentage of the prediction window has passed
          "outcomeSelection": "mostPopular", // "mostPopular" | "highestMultiplier" | "poolMedian" | "random"
                                             // "mostPopular"       - outcome with the most users participating
                                             // "highestMultiplier" - outcome with the highest potential payout (fewest points)
                                             // "poolMedian"        - outcome with the median total points
                                             // "random"            - pick a random outcome
          "bet": {
            "min": 10,                  // min number of points to bet
            "max": 50000,               // max number of points to bet
            "poolFraction": 0.3,        // target bet is this fraction of the total prediction pool
            "maxBalanceFraction": 0.1,  // cap bet to this fraction of the balance
            "onInsufficientFunds": "betAll" // "betAll" | "abort" -- what to do if the bet exceeds the balance
          }
        }
      }
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
    "maxMessagesPerChannelFlush": 150   // max messages to flush per channel at once
  },
  "paste": {
    "service": "hastebin",              // "hastebin" | "nullPtr"
    "maxLength": 200000,                // 0 for unlimited
    "hastebin": {
      "instance": "https://paste.ivr.fi", // POST: /documents, GET: /{key}, /documents/{key}, /raw/{key}
      "raw": true
    },
    "nullPtr": {
      "instance": "https://0x0.st",     // recommended maxLength: 15000
      "secret": false                   // generate hard-to-guess URLs
    }
  },
  "metrics": {
    "enabled": false,
    "prometheus": {
      "enabled": false,
      "host": "127.0.0.1",
      "port": 9101,
      "endpoint": "/metrics",
      "prefix": "selfbot_"
    }
  },
  "shell": "/bin/bash",                 // null for none
  "logger": {
    "level": "info",                    // "debug" | "info" | "warning" | "error" | "none"
    "colorize": 1,                      // 0 | 1 | 2
                                        // 0 - never
                                        // 1 - auto
                                        // 2 - always
    "timestamp": true,                  // include timestamp
    "uptime": true,                     // include process uptime
    "showErrorStackTraces": true,
    "bracketedLevel": false             // false - "level:"
                                        // true  - "[LEVEL]"
  }
}
```
## obtain OAuth tokens
#### 1. using the DCF script
Run either:
```bash
npm run oauth:android
npm run oauth:tv
```
You'll see output like this:
```
https://www.twitch.tv/activate?device-code=ABCDEFGH
code: ABCDEFGH (expires in 30 minutes)
```
1. Open the URL in a browser.
2. Enter the code.
3. Click **Authorize**.
4. Use the `client_id` and `access_token` from the script's output.
#### 2. Twilight (web) credentials
1. Go to https://www.twitch.tv and log in.
2. In the browser console, run:
```javascript
document.cookie.split('; ').find(e => e.startsWith('auth-token='))?.split('=')[1]
```
3. Use the token (use "kimne78kx3ncx6brgo4mv6wki5h1ko" for the `client_id`).
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
TWITCH_IRC_TOKEN=      # required if `twitch.sender.backend` is set to "irc"

# required -- must be obtained using `npm run oauth:android` or `npm run oauth:tv`
TWITCH_GQL_CLIENT_ID=
TWITCH_GQL_TOKEN=

TWITCH_HERMES_CLIENT_ID= # required -- must be one of:
                         #   - Twilight (web) client ID: "kimne78kx3ncx6brgo4mv6wki5h1ko"
                         #   - Android app client ID: "kd1unb4b3q4t58fwlpcbzcbnm76a8fp" (`npm run oauth:android`)
TWITCH_HERMES_TOKEN=   # required if `twitch.hermes.subscribeToUserTopics` is set to true

DB_USER=
DB_HOST=127.0.0.1      # or a unix domain socket directory, e.g., /var/run/postgresql
DB_NAME=
DB_PASSWORD=
DB_PORT=5432
DB_MAX_CLIENTS=10

REDIS_USER=
REDIS_HOST=
REDIS_PASSWORD=
REDIS_PORT=
REDIS_SOCKET=          # optional -- unix domain socket, e.g., /var/run/valkey/valkey.sock (overrides host & port if provided)

WOLFRAM_ALPHA_API_KEY= # optional -- used by the wolframalpha command
```
> Credentials obtained using `npm run oauth:android` can be used for all of the `TWITCH_*` variables.  
> However, the access token may be revoked by Twitch at any time.
## run
```bash
node .
```
