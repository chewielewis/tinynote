# TinyNote Docker Quick Reference

## Common Commands

### Building and Starting

```bash
# Build and start (docker-compose)
docker-compose up -d

# Build and start (docker compose plugin)
docker compose up -d

# Build image only
docker build -t tinynote .

# Start existing container
docker start tinynote

# Stop container
docker stop tinynote
```

### Logs and Monitoring

```bash
# View logs
docker logs tinynote

# Follow logs (live)
docker logs -f tinynote

# Last 50 lines
docker logs --tail=50 tinynote

# With timestamps
docker logs -t tinynote

# View logs with docker-compose
docker-compose logs -f

# Check container status
docker ps -a | grep tinynote

# Check health status
docker inspect tinynote --format='{{.State.Health.Status}}'

# View container details
docker inspect tinynote
```

### Maintenance

```bash
# Restart container
docker restart tinynote

# Rebuild and restart
docker-compose up -d --build

# Force recreation of container
docker-compose up -d --force-recreate

# Remove container
docker rm tinynote

# Remove image
docker rmi tinynote:latest

# Clean up unused resources
docker system prune -a
```

### Shell Access

```bash
# Get shell in running container
docker exec -it tinynote sh

# Run single command
docker exec tinynote node -e "console.log('Hello')"

# View files in container
docker exec tinynote ls -la /app

# Check environment variables
docker exec tinynote env | grep SORT
```

### Troubleshooting

```bash
# Check if port is in use
sudo lsof -i :4444

# Test printer connectivity
telnet 10.1.1.30 9100

# Ping printer
ping -c 3 10.1.1.30

# View resource usage
docker stats tinynote

# Check disk usage
docker system df

# View container processes
docker top tinynote

# Inspect volume mounts
docker inspect tinynote --format='{{json .Mounts}}' | jq
```

### Unraid-Specific

```bash
# View Unraid Docker logs
tail -f /var/log/docker.log

# Check Docker service status
/etc/rc.d/rc.docker status

# Restart Docker service on Unraid
/etc/rc.d/rc.docker restart

# View container config in Unraid
cat /boot/config/plugins/dockerMan/templates-user/tinynote.xml
```

### Testing API

```bash
# Test web UI is accessible
curl http://localhost:4444

# Test print endpoint
curl -X POST http://localhost:4444/print \
  -H "Content-Type: application/json" \
  -d '{"message":"Test print"}'

# Test AI generation endpoint
curl -X POST http://localhost:4444/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Tell me a joke"}'

# Get pending prompts
curl http://localhost:4444/prompts
```

## Environment Variable Reference

```bash
# Set environment variable in docker run
docker run -e OPENROUTER_API_KEY=sk-or-v1-xxx tinynote

# Set multiple environment variables
docker run \
  -e OPENROUTER_API_KEY=sk-or-v1-xxx \
  -e PRINTER_IP=10.1.1.30 \
  -e PORT=4444 \
  tinynote

# Load from .env file
docker run --env-file .env tinynote

# Pass environment variable in docker-compose
# (Edit docker-compose.yml)
environment:
  - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
```

## Volume Management

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect tinynote_data

# Create volume
docker volume create tinynote_data

# Remove volume
docker volume rm tinynote_data

# Backup volume
docker run --rm -v tinynote_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/tinynote-backup.tar.gz /data

# Restore volume
docker run --rm -v tinynote_data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/tinynote-backup.tar.gz -C /
```

## Network Management

```bash
# List networks
docker network ls

# Inspect network
docker network inspect host

# Connect container to network
docker network connect bridge tinynote

# Disconnect from network
docker network disconnect bridge tinynote

# Test network connectivity
docker exec tinynote ping -c 3 10.1.1.30
docker exec tinynote nc -zv 10.1.1.30 9100
```

## Debug Mode

```bash
# Start with debug logging
docker run -e DEBUG=true tinynote

# View startup logs
docker logs tinynote 2>&1 | head -50

# Run with node inspect
docker run -it --entrypoint sh tinynote
node inspect server.js

# Test canvas installation
docker run --rm tinynote node -e "console.log(require('canvas'))"
```

## Performance Tuning

```bash
# Set memory limit
docker run -m 512m tinynote

# Set CPU limit
docker run --cpus=1.0 tinynote

# Set resource limits in docker-compose
# (Edit docker-compose.yml)
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '1.0'
```

## Security

```bash
# Run as specific user (already set in Dockerfile)
docker run -u 1001:1001 tinynote

# Run in read-only mode
docker run --read-only tinynote

# Drop all capabilities
docker run --cap-drop=ALL tinynote

# Run with specific capabilities
docker run --cap-add=NET_BIND_SERVICE tinynote

# Scan image for vulnerabilities
docker scan tinynote:latest
```

## Cleanup

```bash
# Remove all stopped containers
docker container prune

# Remove all unused images
docker image prune -a

# Remove all unused volumes
docker volume prune

# Remove all unused networks
docker network prune

# Remove everything unused
docker system prune -a --volumes
```

## Backup and Migration

```bash
# Export image
docker save tinynote:latest | gzip > tinynote-image.tar.gz

# Import image
gunzip -c tinynote-image.tar.gz | docker load

# Backup container config
docker inspect tinynote > tinynote-config.json

# Backup data volume
docker run --rm -v tinynote_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/tinynote-data-$(date +%Y%m%d).tar.gz /data

# Full backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
docker save tinynote:latest | gzip > tinynote-image-$DATE.tar.gz
docker run --rm -v tinynote_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/tinynote-data-$DATE.tar.gz /data
echo "Backup complete: tinynote-$DATE"
```

## Useful Aliases

```bash
# Add to .bashrc or .zshrc

alias tinynote-logs='docker logs -f tinynote'
alias tinynote-restart='docker restart tinynote'
alias tinynote-shell='docker exec -it tinynote sh'
alias tinynote-rebuild='docker-compose up -d --build'
alias tinynote-update='docker-compose pull && docker-compose up -d'
```
