# Use the official Playwright image which includes all dependencies and browsers
FROM mcr.microsoft.com/playwright:v1.50.0-jammy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY . .

# Run as non-root user (optional but good practice, though Playwright image user is 'pwuser' or root. 
# The official image usually runs as root by default. 
# We can just stick to root for simplicity on Railway unless strict permissions are needed, 
# but let's try to be safe if possible. However, the previous dockerfile added 'user'. 
# Let's keep it simple for now as the official image is well configured.)

# startup command
CMD ["node", "app.js"]