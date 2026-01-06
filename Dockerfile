FROM oven/bun:latest

WORKDIR /app

RUN apt-get update \
	 && apt-get install -y --no-install-recommends \
		 ca-certificates \
		 curl \
	 && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
	apt-get update; \
	apt-get install -y --no-install-recommends wget gnupg2 ca-certificates; \
	wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-chrome-archive-keyring.gpg; \
	echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome-archive-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list; \
	apt-get update; \
	apt-get install -y --no-install-recommends google-chrome-stable; \
	rm -rf /var/lib/apt/lists/*; \
	which google-chrome || true

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile --production

RUN bunx playwright install-deps || npx playwright install-deps || true
RUN bunx playwright install --with-deps || npx playwright install --with-deps || true

COPY . .

ENV NODE_ENV=production

CMD ["bun", "run", "start"]
