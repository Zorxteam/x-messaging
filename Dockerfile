FROM oven/bun:latest

WORKDIR /app

# Install minimal helper tools; Playwright will install required OS deps later
RUN apt-get update \
	 && apt-get install -y --no-install-recommends \
		 ca-certificates \
		 curl \
	 && rm -rf /var/lib/apt/lists/*

# Copy package files first to leverage Docker cache
COPY package.json package-lock.json* bun.lockb* ./

# Install production dependencies
RUN bun install --production

# Use Playwright helper to install OS-level dependencies (requires Playwright package installed)
RUN bunx playwright install-deps || npx playwright install-deps || true
RUN bunx playwright install --with-deps || npx playwright install --with-deps || true

# Copy application sources
COPY . .

ENV NODE_ENV=production
# Default DISPLAY; when running container, bind-mount the host X socket and set DISPLAY accordingly
ENV DISPLAY=:0

# Run the app using the project's start script
CMD ["bun", "run", "start"]
