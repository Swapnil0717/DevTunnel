<p align="center">
  <img src="./public/logo.png" alt="DevTunnel" width="360" />
</p>

<p align="center">
  Open source project network for developers — discover, join, and contribute to real software projects.
</p>

---

## About

DevTunnel is an open source platform where developers create, discover, and collaborate on real
software projects. Contributors sign in with GitHub, find projects that match their skills, and
build a verifiable history of real contributions.

This repository contains the **frontend** — the main website contributors use to sign in, browse
projects, and work.

## Features

- Sign in with GitHub (OAuth 2.0)
- Session-aware routing — signed-out visitors are redirected away from protected pages
- User profile and sign-out
- Server-rendered pages for fast, crawlable, SEO-friendly public content

## Tech Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS**
- React Context for lightweight client-side auth state

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_API_URL / NEXT_PUBLIC_SITE_URL
npm run dev
```

## Contributing

Contributions are welcome! Please open an issue or pull request.

## License

See [LICENSE](../LICENSE) in the main project repository for full terms.
