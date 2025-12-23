FROM oven/bun:latest

WORKDIR /app

# Install minimal helper tools; Playwright will install required OS deps later
RUN apt-get update \
	 && apt-get install -y --no-install-recommends \
		 ca-certificates \
		 curl \
	 && rm -rf /var/lib/apt/lists/*

# Install Google Chrome stable (so container can run system Chrome if desired)
RUN set -eux; \
	apt-get update; \
	apt-get install -y --no-install-recommends wget gnupg2 ca-certificates; \
	wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add -; \
	echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list; \
	apt-get update; \
	apt-get install -y --no-install-recommends google-chrome-stable; \
	rm -rf /var/lib/apt/lists/*; \
	which google-chrome || true

# Copy package files first to leverage Docker cache
COPY package.json package-lock.json* bun.lock* ./

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
