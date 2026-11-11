FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY apps/api/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY apps/api/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
