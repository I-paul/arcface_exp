FROM node:18-bookworm-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including Prisma CLI)
RUN apt-get update \
	&& apt-get install -y --no-install-recommends openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/* \
	&& npm install

# Copy application code
COPY . .

# Expose server port
EXPOSE 3000

# Start the application with migrations
CMD ["sh", "-c", "npm run migrate && npm start"]
