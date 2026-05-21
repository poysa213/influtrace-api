FROM node:20-alpine

WORKDIR /app

# Create non-root user early
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Copy only package files first (better caching)
COPY package.json package-lock.json ./

# Install deps (must include devDependencies for the build step)
RUN npm ci

# Copy source with correct ownership (avoids chown -R)
COPY --chown=nodejs:nodejs . .

# Build
RUN npm run build

# Switch user
USER nodejs

# Hardcode production environment AFTER the build so the runtime
# container always uses GCP Secret Manager and never loads local .env
ENV NODE_ENV=production
ENV USE_SECRET_MANAGER=true
ENV GOOGLE_CLOUD_PROJECT=social-media-analyzer-442313

EXPOSE 8080

CMD ["npm", "start"]
