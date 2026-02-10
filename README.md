# Hevy MCP Server


A Model Context Protocol (MCP) server that connects to the official Hevy API and exposes workout data to AI assistants. Supports dual transport modes: stdio for Claude Desktop and SSE for remote access (e.g., Poke.com).

## Deploy to Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/dhh51B?referralCode=7zdyjn&utm_medium=integration&utm_source=template&utm_campaign=generic)

Click the button above to deploy your own instance to Railway. See the [Railway Deployment](#railway-deployment) section below for configuration details.

## Features

### MCP Tools

#### Workout Management
- `get-workouts` - Get paginated workout list with date filtering
- `get-workout` - Get single workout by ID with full details
- `create-workout` - Create new workout with exercises and sets
- `update-workout` - Update existing workout
- `get-workout-count` - Get total workout count for stats
- `get-workout-events` - Get workout update/delete events since date

#### Routine Management
- `get-routines` - List all saved routines
- `get-routine` - Get single routine by ID
- `create-routine` - Create new workout routine template
- `update-routine` - Update existing routine
- `delete-routine` - Remove routine

#### Exercise Data
- `get-exercise-templates` - Browse available exercises (standard + custom)
- `get-exercise-template` - Get single exercise by ID
- `get-exercise-progress` - Track progress for specific exercises over time
- `get-exercise-stats` - Get personal records and 1RM estimates

#### Folder Organization
- `get-routine-folders` - List routine folders
- `get-routine-folder` - Get folder by ID
- `create-routine-folder` - Create new folder
- `update-routine-folder` - Update folder name
- `delete-routine-folder` - Remove folder

## Prerequisites

1. **Hevy PRO Subscription** - Required for API access
2. **Hevy API Key** - Get it at https://hevy.com/settings?developer
3. **Node.js** - Version 18 or higher

## Installation

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/meimakes/hevy-mcp-server
cd hevy-mcp-server
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your Hevy API key:

```bash
HEVY_API_KEY=your_hevy_api_key_here
HEVY_API_BASE_URL=https://api.hevyapp.com

# Transport configuration
TRANSPORT=stdio                    # stdio | sse | both
PORT=3004                          # Port for SSE/HTTP mode
HOST=127.0.0.1                     # Host for SSE/HTTP mode

# SSE Configuration (for Poke.com)
SSE_PATH=/mcp                      # SSE endpoint path
HEARTBEAT_INTERVAL=30000           # ms - keep connection alive
AUTH_TOKEN=                        # See Security section below
```

#### Security: AUTH_TOKEN Configuration

**When using SSE mode with remote access (e.g., via ngrok for Poke.com), you MUST set an AUTH_TOKEN to prevent unauthorized access to your Hevy data.**

Generate a secure token using either method:

**Option 1: Using the built-in script**
```bash
npm run generate-token
```

**Option 2: Using OpenSSL**
```bash
openssl rand -hex 32
```

Then add the generated token to your `.env` file:
```bash
AUTH_TOKEN=your_generated_token_here
```

When connecting from Poke.com, include the token in the Authorization header:
```
Authorization: Bearer your_generated_token_here
```

**Security Notes:**
- ✅ **REQUIRED** for SSE mode with public/ngrok access
- ❌ **Optional** for stdio mode (Claude Desktop)
- ❌ **Optional** for SSE mode on localhost only
- ⚠️  Never commit your `.env` file or share your AUTH_TOKEN

### 3. Build the Project

```bash
npm run build
```

## Usage

### For Claude Desktop (stdio mode)

#### 1. Run the server in development mode:

```bash
npm run dev
```

#### 2. Configure Claude Desktop

Edit your Claude Desktop config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server configuration:

```json
{
  "mcpServers": {
    "hevy": {
      "command": "node",
      "args": ["/absolute/path/to/hevy-mcp-server/dist/index.js"],
      "env": {
        "HEVY_API_KEY": "your_hevy_api_key",
        "TRANSPORT": "stdio"
      }
    }
  }
}
```

#### 3. Restart Claude Desktop

The Hevy tools will now be available in Claude Desktop.

### For Poke.com (SSE mode)

#### 1. Generate and set AUTH_TOKEN:

**IMPORTANT:** For security, generate an AUTH_TOKEN before exposing your server:

```bash
npm run generate-token
# Copy the generated token to your .env file
```

#### 2. Start the server in SSE mode:

```bash
# In .env, set TRANSPORT=sse and your AUTH_TOKEN
npm start
```

#### 3. Expose with ngrok (for remote access):

```bash
# In a separate terminal
ngrok http 3004
```

#### 4. Connect to Poke.com:

1. Go to https://poke.com/settings/connections
2. Add new Custom Integration
3. Enter your ngrok or Railway URL: `https://your-url.io/mcp`
4. Add your generated AUTH_TOKEN as the API Key
5. Test with: "Show me my last workout using the Hevy integration"

## Example Usage

```
"Show me my last 5 workouts from Hevy"
"What was my best bench press weight?"
"Create a new Push Day routine with bench press, overhead press, and tricep dips"
```

## Development

### Run in development mode with auto-reload:

```bash
npm run dev
```

### Build for production:

```bash
npm run build
npm start
```

### Watch mode (auto-rebuild on changes):

```bash
npm run watch
```

## Architecture

```
┌─────────────────┐         ┌─────────────────┐
│   Poke.com      │         │ Claude Desktop  │
│   (Remote)      │         │    (Local)      │
└────────┬────────┘         └────────┬────────┘
         │ HTTPS                     │ stdio
         ↓                           ↓
    ┌─────────────────────────────────┐
    │       ngrok Tunnel              │
    │   (Optional - for Poke only)    │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │     Hevy MCP Server             │
    │   Port 3004 (configurable)      │
    │   SSE + HTTP / stdio            │
    └────────────┬────────────────────┘
                 │
                 ↓
    ┌─────────────────────────────────┐
    │      Hevy API                   │
    │   api.hevyapp.com               │
    │   (Requires PRO + API Key)      │
    └─────────────────────────────────┘
```

## File Structure

```
hevy-mcp-server/
├── src/
│   ├── index.ts              # Main entry point + transport router
│   ├── server.ts             # MCP server core logic
│   ├── transports/
│   │   ├── stdio.ts          # stdio transport (Claude Desktop)
│   │   └── sse.ts            # SSE + HTTP transport (Poke.com)
│   ├── hevy/
│   │   ├── client.ts         # Hevy API client wrapper
│   │   └── types.ts          # TypeScript types for Hevy data
│   ├── tools/
│   │   ├── workouts.ts       # Workout-related tools
│   │   ├── routines.ts       # Routine-related tools
│   │   ├── exercises.ts      # Exercise-related tools
│   │   └── folders.ts        # Folder-related tools
│   └── utils/
│       ├── formatters.ts     # Data formatting helpers
│       ├── validators.ts     # Input validation with Zod
│       └── errors.ts         # Error handling
├── scripts/
│   └── generate-token.ts     # AUTH_TOKEN generator utility
├── dist/                     # Compiled output
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Troubleshooting

### "HEVY_API_KEY is required" error

Make sure you've:
1. Created a `.env` file in the project root
2. Added your API key: `HEVY_API_KEY=your_key_here`
3. Restarted the server

### Tools not showing up in Claude Desktop

1. Check that the path in `claude_desktop_config.json` is absolute
2. Verify the server builds successfully with `npm run build`
3. Check Claude Desktop logs for errors
4. Restart Claude Desktop completely

### SSE connection issues with Poke.com

1. Verify ngrok is running and the URL is correct
2. Check that the server is running: `curl http://localhost:3004/health`
3. Ensure firewall allows connections on port 3004
4. Check server logs for errors
5. Verify all 20 tools are discoverable in Poke's integration settings

### "Unauthorized" error (401) with SSE mode

If you get authentication errors when connecting to Poke.com:

1. Verify `AUTH_TOKEN` is set in your `.env` file
2. Ensure you're sending the Authorization header: `Bearer your_token_here`
3. Check that the token in Poke.com matches exactly what's in your `.env`
4. Regenerate the token if needed: `npm run generate-token`

## Railway Deployment

Railway provides a simple way to deploy the Hevy MCP Server to the cloud, making it accessible from Poke.com and other remote MCP clients without needing ngrok or manual server management.

### Quick Deploy

1. Click the **Deploy on Railway** button at the top of this README
2. Connect your Railway account (sign up if needed)
3. Configure the required environment variables (see below)
4. Railway will automatically build and deploy your server

### Required Environment Variables

When deploying to Railway, configure these environment variables in your Railway project settings:

```bash
# Required
HEVY_API_KEY=your_hevy_api_key_here
AUTH_TOKEN=your_generated_token_here  # Generate with: openssl rand -hex 32

# Transport Configuration
TRANSPORT=sse                          # Use SSE mode for Railway
PORT=3000                              # Railway will override this automatically

# Optional - Advanced Configuration
NODE_ENV=production                    # Enables production security features
SESSION_TIMEOUT=2592000000            # 30 days in milliseconds
HEARTBEAT_INTERVAL=30000              # 30 seconds
SSE_PATH=/mcp                         # MCP endpoint path

# Optional - HTTPS (if using custom domain with SSL)
ENABLE_HTTPS=false                    # Set to true if you have SSL certificates
```

### Step-by-Step Railway Deployment

#### 1. Generate AUTH_TOKEN

Before deploying, generate a secure authentication token:

```bash
# Option 1: Using OpenSSL
openssl rand -hex 32

# Option 2: Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Save this token - you'll need it for both Railway configuration and Poke.com connection.

#### 2. Deploy to Railway

1. Click the **Deploy on Railway** button
2. Authorize Railway to access your GitHub account (if using template)
3. Railway will create a new project and start the deployment

#### 3. Configure Environment Variables

In your Railway project dashboard:

1. Go to **Variables** tab
2. Add the required environment variables:
   - `HEVY_API_KEY`: Your Hevy API key from https://hevy.com/settings?developer
   - `AUTH_TOKEN`: The token you generated in step 1
   - `TRANSPORT`: Set to `sse`
   - `NODE_ENV`: Set to `production`

3. Railway will automatically redeploy with the new variables

#### 4. Get Your Railway URL

After deployment completes:

1. Go to **Settings** tab in Railway dashboard
2. Under **Domains**, you'll see your Railway-provided URL (e.g., `your-app.railway.app`)
3. Your MCP endpoint will be: `https://your-app.railway.app/mcp`
4. Health check endpoint: `https://your-app.railway.app/health`

#### 5. Connect from Poke.com

1. Go to https://poke.com/settings/connections
2. Click **Add new MCP connection**
3. Configure the connection:
   - **URL**: `https://your-app.railway.app/mcp`
   - **Authorization Header**: `Bearer your_auth_token_here`
4. Test the connection:
   - Try: "Use the Hevy integration to show me my last workout"

### Railway Health Checks

Railway automatically monitors your server health:

- **Endpoint**: `/health`
- **Expected Response**: `200 OK` with JSON body
- **Frequency**: Every 60-100 seconds
- **Behavior**: Unauthenticated and exempt from rate limiting

The health check returns:

```json
{
  "status": "healthy",
  "timestamp": "2025-10-31T12:00:00.000Z",
  "transport": "sse"
}
```

### Monitoring Your Railway Deployment

#### View Logs

In Railway dashboard:
1. Go to **Deployments** tab
2. Click on your active deployment
3. View real-time logs with structured JSON output

Look for these log entries:
- `Hevy MCP Server started` - Server initialization
- `SSE connection established` - Client connections
- `API request` - Hevy API calls with response times

#### Check Metrics

Railway provides built-in metrics:
- **CPU Usage**: Should be low (<10%) when idle
- **Memory Usage**: Typically 50-100MB
- **Network**: Monitor for unusual traffic patterns
- **Response Times**: API requests logged with duration

#### Troubleshooting Railway Deployments

**Build Fails:**
- Check build logs in Railway dashboard
- Verify `package.json` has all dependencies
- Ensure Node.js version compatibility (18+)

**Health Check Fails:**
- Verify server starts successfully in logs
- Check if `PORT` environment variable conflicts
- Ensure `/health` endpoint returns 200 status

**Connection Refused from Poke.com:**
- Verify `AUTH_TOKEN` is set in Railway variables
- Check AUTH_TOKEN matches in Poke.com settings
- Ensure `TRANSPORT=sse` is set
- Verify Railway URL is accessible: `curl https://your-app.railway.app/health`

**Rate Limiting Issues:**
- Default: 1000 requests per 15 minutes (generous for AI agents)
- Health checks exempt from rate limiting
- Check logs for `rate_limit_exceeded` entries
- Adjust rate limits in `src/transports/sse.ts` if needed

### Railway Configuration Files

The project includes Railway configuration files:

- `railway.json` - JSON format configuration
- `railway.toml` - TOML format configuration (alternative)

These files configure:
- Build command: `npm install && npm run build`
- Start command: `node dist/index.js`
- Health check path: `/health`
- Restart policy: Restart on failure (max 10 retries)

### Security Considerations for Railway

When deployed to Railway:

- ✅ **Always use AUTH_TOKEN** - Required for production
- ✅ **HTTPS enabled** - Railway provides automatic SSL
- ✅ **Rate limiting active** - Protects against abuse
- ✅ **Request timeouts** - Prevents hanging connections
- ✅ **Structured logging** - Audit trail for security events
- ✅ **Session management** - 30-day timeout for reconnection
- ✅ **Security headers** - Helmet middleware enabled
- ⚠️ **Monitor logs regularly** - Watch for unauthorized access attempts

## Rate Limiting

### MCP Server Rate Limits (SSE Mode)

The server implements rate limiting to protect against abuse:

- **General requests**: 1,000 requests per 15 minutes per IP
- **Authentication attempts**: 50 requests per 15 minutes per IP
- **Health checks**: Exempt from rate limiting

If you encounter rate limiting issues, you can adjust the limits in `src/transports/sse.ts`.

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT

## Links

- [Hevy App](https://hevy.com)
- [Hevy API Documentation](https://hevy.com/settings?developer)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Claude Desktop](https://claude.ai/download)
- [Poke.com](https://poke.com)
