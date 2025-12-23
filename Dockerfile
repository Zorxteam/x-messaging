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
	# Add Google's signing key to keyrings (avoid deprecated apt-key)
	wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-chrome-archive-keyring.gpg; \
	echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-archive-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list; \
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

# Run the app using the project's start script
CMD ["bun", "run", "start"]
