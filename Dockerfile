FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

COPY . /app
WORKDIR /app

ENV HOME="/app"
RUN chmod -R 777 /app
RUN corepack enable && corepack prepare

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base
COPY --from=prod-deps /app/node_modules /app/node_modules

CMD [ "pnpm", "run", "start" ]