FROM oven/bun:1.4-alpine AS build
WORKDIR /app
COPY package.json ./
COPY ПРОМПТ.md ./
COPY src ./src
COPY tools ./tools
COPY examples/demo.html ./examples/demo.html
RUN bun tools/build.mjs

FROM oven/bun:1.4-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY server ./server
COPY --from=build /app/dist ./dist
USER bun
EXPOSE 3000
CMD ["bun", "server/main.ts"]
