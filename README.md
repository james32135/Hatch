# HATCH

Family finance backend for the SoSoValue Buildathon — parents auto-invest weekly allowance into SSI indexes via SoDEX Vault; an Education Agent explains markets to a view-only child.

## Stack

- **API:** Fastify + TypeScript (`packages/backend`)
- **DB:** Supabase PostgreSQL (Prisma)
- **Cache/Jobs:** Upstash Redis
- **Chain:** ValueChain (mainnet `286623` / testnet `138565`) + Base SSI tokens
- **Trading:** SoDEX (parent-signed EIP-712; backend never custodies user keys)
- **AI:** NVIDIA Build primary → Groq → Cerebras → SambaNova

## Quick start

```bash
cp .env.example .env   # fill secrets locally — never commit .env
npm install
npm run prisma:generate
npm run dev:backend
```

Health: `GET /api/health/live`

## Architecture locks

1. Backend never owns parent SoDEX trading keys.
2. Path A (SoDEX vault) preferred; Path B Base mint blocked until SSI router verified.
3. No mocks — real APIs and chains.
4. Frontend ships last (blocked until backend production-ready).

## Deploy

See `render.yaml` (free Render web service). Set secret env vars in the Render dashboard / API — never hardcode them in git.

## License

Private / buildathon submission.
