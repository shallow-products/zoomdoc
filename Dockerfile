FROM node:22-alpine AS dev

WORKDIR /app

# git, build tools
RUN apk add --no-cache git bash

# Create non-root user if needed or keep default node
COPY package*.json ./

RUN npm install

COPY . .

CMD ["npm", "test"]

# For the E2E that uses a real agent: dev plus the Claude Code CLI.
# --dangerously-skip-permissions does not work as root, so this runs as the node user.
FROM dev AS e2e

ARG CLAUDE_CODE_VERSION=2.1.224
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}
USER node
