# TinyNote Unraid Setup Guide

## Step 1: Download the Template

SSH into your Unraid server or use the terminal in the Unraid web UI, then run:

```bash
# Download the template
mkdir -p /boot/config/plugins/dockerMan/templates-user
wget -O /boot/config/plugins/dockerMan/templates-user/tinynote.xml https://raw.githubusercontent.com/chewielewis/tinynote/main/unraid-template.xml
```

Or download manually:
1. Go to: https://raw.githubusercontent.com/chewielewis/tinynote/main/unraid-template.xml
2. Save the file to: `/boot/config/plugins/dockerMan/templates-user/tinynote.xml`

## Step 2: Add the Docker Container

1. Open Unraid Web UI
2. Go to **Docker** tab
3. Click **Add Container** button
4. In the template dropdown, select **tinynote**

## Step 3: Configure the Container

Fill in these required fields:

### Required Settings:
- **OpenRouter API Key**: Your API key from https://openrouter.ai/keys
- **Printer IP Address**: Your Epson TM-T30 IP (e.g., 10.1.1.30)
- **AppData**: `/mnt/user/appdata/tinynote/data`

### Optional Settings (defaults are fine):
- **Web UI Port**: 4444
- **Printer Port**: 9100
- **AI Model**: anthropic/claude-3.5-sonnet
- **Perplexity Model**: perplexity/sonar-small-online
- **Min Print Interval**: 3000
- **Search Timeout**: 10000
- **Cache TTL**: 300000

## Step 4: Apply and Start

1. Click **Apply** button
2. Wait for container to start
3. Check the container log for any errors

## Step 5: Access the Web UI

Open your browser and go to:
```
http://your-unraid-ip:4444
```

Example: `http://192.168.1.10:4444`

## Step 6: Test Printing

1. Click **Plain Text** tab
2. Enter: "Test print from TinyNote!"
3. Click **Print**
4. Verify the printer outputs the message

## Finding Your Printer IP

If you don't know your printer's IP:

1. **Check Router DHCP Table**:
   - Login to your router (usually 192.168.1.1)
   - Look for "DHCP Client List" or "Connected Devices"
   - Find "Epson" or "TM-T30"

2. **Or scan your network** from Unraid:
   ```bash
   # Install nmap if not installed
   nmap -p 9100 192.168.1.0/24
   # Look for device with port 9100 open
   ```

3. **Test connectivity**:
   ```bash
   telnet 10.1.1.30 9100
   # If connection succeeds, you'll see a blank screen
   # Press Ctrl+] then type 'quit' to exit
   ```

## Getting Your OpenRouter API Key

1. Go to https://openrouter.ai/
2. Sign up or login
3. Go to https://openrouter.ai/keys
4. Click "Create Key"
5. Copy the key (starts with `sk-or-v1-`)
6. Paste into the template field

## Troubleshooting

### Container Won't Start

1. **Check logs** in Docker tab (click the container name)
2. **Verify API key** is correct and has credits
3. **Check printer IP** is accessible:
   ```bash
   ping 10.1.1.30
   telnet 10.1.1.30 9100
   ```

### Printer Not Found

**Error**: "ECONNREFUSED" in logs

**Solution**:
- Verify printer is on and connected to network
- Check printer IP matches what's configured
- Try host network mode (default in template)

### Web UI Not Accessible

**Check**:
- Container is running (green icon in Docker tab)
- Port 4444 is not blocked by firewall
- Try: `http://localhost:4444` from the Unraid server itself

### AI Generation Fails

**Check**:
- API key is valid at https://openrouter.ai/keys
- API key has credits available
- Check container logs for specific error

## Managing the Container

### View Logs
```bash
docker logs tinynote
```

### Restart Container
```bash
docker restart tinynote
```

### Update Container
1. In Docker tab, click **Force Update**
2. Or stop container, edit template, and click **Apply**

### Remove Container
1. Stop container in Docker tab
2. Click container name
3. Click **Remove**

## Quick Start Commands

After downloading the template, you can also deploy from command line:

```bash
# Create appdata directory
mkdir -p /mnt/user/appdata/tinynote/data

# Pull the image (Unraid will do this automatically when you add the container)
docker pull ghcr.io/your-username/tinynote:latest

# Or build from source (advanced)
cd /tmp
git clone https://github.com/chewielewis/tinynote.git
cd tinynote
docker build -t tinynote:latest .
```

But using the template method (Step 2-4 above) is recommended!

## Support

- **Issues**: https://github.com/chewielewis/tinynote/issues
- **OpenRouter Docs**: https://openrouter.ai/docs
- **Unraid Forums**: https://forums.unraid.net/

---

**Quick Reference**:
- Web UI: `http://your-unraid-ip:4444`
- AppData: `/mnt/user/appdata/tinynote/data`
- Logs: Docker tab → Click container name
- Template: `/boot/config/plugins/dockerMan/templates-user/tinynote.xml`
