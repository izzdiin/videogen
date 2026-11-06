FROM node:20-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip \
  && pip3 install --break-system-packages --no-cache-dir edge-tts \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN cd stickman-runtime && npm ci --no-audit --no-fund
RUN npm run build

ENV NODE_ENV=production PORT=3201 DATA_DIR=/app/data
EXPOSE 3201
CMD ["npm", "start"]
