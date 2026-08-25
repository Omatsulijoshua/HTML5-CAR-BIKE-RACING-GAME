# Stage 1: Build the workspace application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root configurations and packages descriptors
COPY package.json package-lock.json tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/

# Install dependencies
RUN npm ci

# Copy full source tree
COPY . .

# Generate Prisma Client
RUN npm run db:generate --workspace=@racing-game/backend

# Build the workspaces (shared, backend, frontend)
RUN npm run build

# Stage 2: Runtime server
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment flags
ENV NODE_ENV=production

# Copy package lists
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy generated Prisma files and build artifacts
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/prisma ./packages/backend/prisma
COPY --from=builder /app/packages/frontend/dist ./packages/frontend/dist
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist

# Expose server port
EXPOSE 3001

# Launch Express monorepo server
CMD ["node", "packages/backend/dist/server.js"]
