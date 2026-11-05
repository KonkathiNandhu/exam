FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps/server ./apps/server
COPY --from=build /app/packages ./packages
EXPOSE 3000
CMD ["node", "--import", "tsx", "apps/server/index.ts"]
