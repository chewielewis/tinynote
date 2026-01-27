# TinyNote Docker Deployment Guide

Complete guide for deploying TinyNote using Docker, with special instructions for Unraid servers.

## Quick Start

### Standard Docker Deployment

1. **Clone and build:**
   ```bash
   git clone <repository-url>
   cd tinynote
   docker build -t tinynote .
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and add your OPENROUTER_API_KEY
   ```

3. **Run with Docker Compose (Recommended):**
   ```bash
   docker-compose up -d
   ```

4. **Or run with docker directly:**
   ```bash
   docker run -d \
     --name tinynote \
     --network host \
     -e OPENROUTER_API_KEY=sk-or-v1-your-key-here \
     -e PRINTER_IP=10.1.1.30 \
     -v $(pwd)/data:/app/data \
     tinynote:latest
   ```

5. **Access the web UI:**
   ```
   http://localhost:4444
   ```

## Unraid Deployment

### Method 1: Using Community Applications Template (Recommended)

1. **Place the template:**
   - Copy `unraid-template.xml` to `/boot/config/plugins/dockerMan/templates-user/`
   - Or use the "Template" dropdown in Docker settings and select "Add Template"

2. **Configure in Docker tab:**
   - Go to Settings → Docker
   - Click "Add Container" and select "tinynote"
   - Fill in required fields:
     - **OpenRouter API Key**: Your API key from https://openrouter.ai/
     - **Printer IP Address**: Your Epson TM-T30 IP (check router DHCP table)
     - **AppData**: `/mnt/user/appdata/tinynote/data` (auto-created)

3. **Apply and start:**
   - Click "Apply"
   - The container will start automatically
   - Access at: `http://your-unraid-ip:4444`

### Method 2: Manual Docker Compose on Unraid

1. **Create the appdata directory:**
   ```bash
   mkdir -p /mnt/user/appdata/tinynote/data
   ```

2. **Create docker-compose.override.yml:**
   ```yaml
   services:
     tinynote:
       environment:
         - OPENROUTER_API_KEY=sk-or-v1-your-key-here
         - PRINTER_IP=10.1.1.30
       volumes:
         - /mnt/user/appdata/tinynote/data:/app/data
   ```

3. **Deploy:**
   ```bash
   cd /path/to/tinynote
   docker-compose up -d
   ```

## Configuration

### Environment Variables

All configuration is done via environment variables. Required variables are marked with **(REQUIRED)**.

| Variable | Default | Description | Required |
|----------|---------|-------------|----------|
| `OPENROUTER_API_KEY` | - | Your OpenRouter API key | **Yes** |
| `PORT` | 4444 | Web server port | No |
| `PRINTER_IP` | 10.1.1.30 | Epson TM-T30 IP address | No |
| `PRINTER_PORT` | 9100 | Printer port | No |
| `OPENROUTER_MODEL` | anthropic/claude-3.5-sonnet | AI model for generation | No |
| `PERPLEXITY_MODEL` | perplexity/sonar-small-online | Model for web search | No |
| `MIN_PRINT_INTERVAL_MS` | 3000 | Min time between prints (ms) | No |
| `SEARCH_TIMEOUT_MS` | 10000 | Web search timeout (ms) | No |
| `CACHE_TTL_MS` | 300000 | Search cache duration (ms) | No |

### Finding Your Printer IP

1. **Check your router's DHCP table:**
   - Login to router admin panel
   - Look for "DHCP Client List" or "Connected Devices"
   - Find device named "Epson", "TM-T30", or similar
   - Note the IP address

2. **Or set a static DHCP reservation:**
   - Find the printer's MAC address
   - Create a DHCP reservation in router settings
   - Use the reserved IP in `PRINTER_IP`

3. **Test connectivity:**
   ```bash
   # From the host running Docker
   telnet 10.1.1.30 9100
   # If connection succeeds, you'll see a blank screen
   # Press Ctrl+] then type 'quit' to exit
   ```

### Network Modes

#### Host Network (Recommended for Unraid)
- **Pros**: Easiest printer access, better performance
- **Cons**: Less isolation
- **Use when**: Printer is on the same network as server

```yaml
network_mode: host
# No port mapping needed
```

#### Bridge Network (Advanced)
- **Pros**: Better isolation, more security
- **Cons**: Printer must be accessible from container network
- **Use when**: You need network isolation

```yaml
ports:
  - "4444:4444"
# Ensure PRINTER_IP is accessible from container
```

## Volume Persistence

The container uses a single volume mount for persistence:

```
/app/data  →  /mnt/user/appdata/tinynote/data
```

This stores:
- `prompts.json` - Queue of pending prompts

**Important**: Always map this volume to preserve your prompt queue across container updates.

## Health Checks

The container includes a built-in health check:

```yaml
healthcheck:
  test: ["CMD", "node", "-e", "..."]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 5s
```

View health status:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

## Testing Your Deployment

### 1. Check Container Logs
```bash
docker logs tinynote
```

You should see:
```
🖨️  Starting TinyNote...
✅ Configuration validated:
   - Printer: 10.1.1.30:9100
   - Web UI Port: 4444
   ...
🚀 Starting server...
🖨️  TinyNote server running at http://localhost:4444
```

### 2. Test Web UI
1. Open browser to `http://localhost:4444` (or your Unraid IP:4444)
2. Enter a test message
3. Click "Print"
4. Verify the printer outputs the message

### 3. Test AI Generation
1. Click "AI Generates" tab
2. Enter a prompt like "Tell me a joke"
3. Click "Generate & Print"
4. Verify AI-generated content is printed

### 4. Test Web Search
1. Try a time-sensitive prompt like "What's the latest tech news?"
2. Check logs for search activity:
   ```
   🔍 Search decision: yes
   🌐 Web search triggered, fetching current info...
   ✅ Search results added to context
   ```

## Troubleshooting

### Printer Not Found

**Symptoms**: Container starts but prints fail with "ECONNREFUSED"

**Solutions**:
1. Verify printer IP: `ping 10.1.1.30`
2. Check printer port: `telnet 10.1.1.30 9100`
3. Ensure printer and Docker host are on same network
4. Check if using bridge mode - try host network instead

### Container Won't Start

**Symptoms**: Container exits immediately

**Solutions**:
1. Check logs: `docker logs tinynote`
2. Verify OPENROUTER_API_KEY is set
3. Ensure no other process is using port 4444
4. Check health status: `docker inspect tinynote --format='{{.State.Health.Status}}'`

### AI Generation Fails

**Symptoms**: "Failed to process prompt" error

**Solutions**:
1. Verify API key is valid at https://openrouter.ai/keys
2. Check API key has credits available
3. Try a different model in OPENROUTER_MODEL
4. Check internet connectivity from container

### Web Search Not Working

**Symptoms**: No search results for time-sensitive queries

**Solutions**:
1. Check PERPLEXITY_MODEL is set correctly
2. Increase SEARCH_TIMEOUT_MS (Perplexity can be slow)
3. Check logs for search errors
4. Verify API key supports search models

### Data Not Persisting

**Symptoms**: Prompts queue resets after container restart

**Solutions**:
1. Verify volume is mounted: `docker inspect tinynote | grep -A 5 Mounts`
2. Check host directory exists and is writable
3. Ensure proper permissions on host directory
4. Use absolute paths in volume mounts

## Updating TinyNote

### Docker Compose
```bash
docker-compose pull
docker-compose up -d
```

### Docker Run
```bash
docker stop tinynote
docker rm tinynote
docker build -t tinynote:latest .
docker run -d [your options here] tinynote:latest
```

### Unraid Template
1. Click "Force Update" in Docker tab
2. Or stop container, edit template, and apply

## Security Best Practices

1. **Never commit .env files** - Use .env.example as template
2. **Use non-root user** - Container runs as tinynote user (UID 1001)
3. **Limit API key permissions** - Only grant necessary scopes
4. **Monitor logs** - Check for unusual activity
5. **Use read-only volumes** where possible (except /app/data)
6. **Enable firewall rules** - Restrict access to port 4444

## Performance Tuning

### High-Volume Printing
If you need to print frequently (>1 print/minute):

```yaml
environment:
  - MIN_PRINT_INTERVAL_MS=1000  # Reduce to 1 second
```

**Warning**: Lower intervals may wear out the printer faster.

### Slow Network
If experiencing timeouts:

```yaml
environment:
  - SEARCH_TIMEOUT_MS=20000  # Increase to 20 seconds
```

### High Cache Hit Rate
If you repeat searches often:

```yaml
environment:
  - CACHE_TTL_MS=3600000  # Cache for 1 hour
```

## Unraid-Specific Tips

1. **CaCache2**: Use for better I/O performance:
   - Add template variable: `TMP=/tmp`
   - Ensure tmpfs is mounted

2. **Auto-start**: Enable "Autostart" in container settings

3. **Backup**: Include `/mnt/user/appdata/tinynote` in your backup script

4. **Log rotation**: Add to template:
   ```xml
   <Config Name="Log Size" Target="LOG_MAX_SIZE" Default="10m" ... />
   ```

5. **Resource limits** (optional):
   ```xml
   <Config Name="Max Memory" Target="memory_limit" Default="512m" ... />
   ```

## Getting Help

- **Issues**: Report bugs at https://github.com/yourusername/tinynote/issues
- **Documentation**: See CLAUDE.md for architecture details
- **OpenRouter Support**: https://openrouter.ai/docs
- **Unraid Forums**: https://forums.unraid.net/

## License

MIT License - See LICENSE file for details
