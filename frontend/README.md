# HATCH Frontend

React + Vite + TypeScript app for HATCH — family finance on SoSoValue / SoDEX / SSI.

## Stack

- React 18, Vite, TypeScript
- Tailwind CSS + shadcn/ui
- wagmi + viem (SIWE + EIP-712)
- TanStack Query, React Router, Framer Motion

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Required env:

- `VITE_HATCH_API_BASE_URL` — production API (`https://hatch-api-h018.onrender.com`)
- `VITE_DEFAULT_PROFILE` — `mainnet` | `testnet`
- `VITE_WALLETCONNECT_PROJECT_ID` — WalletConnect Cloud project id

## Scripts

- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run preview` — preview build

## Deploy

Configured for Vercel (`vercel.json`). SPA rewrites to `index.html`.
