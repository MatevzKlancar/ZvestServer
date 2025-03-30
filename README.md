# Zvest Server

![Zvest Logo](https://url-to-your-logo.png)

## Overview

Zvest Server is a backend application for the Zvest loyalty platform that manages businesses, customers, loyalty programs, coupons, and more. Built with Bun and Hono, it provides a robust API for the Zvest ecosystem.

## Features

- **Authentication & Authorization** - Secure user authentication system
- **Business Management** - Comprehensive business profile management
- **Loyalty Programs** - Customizable loyalty and rewards systems
- **Menu Management** - Digital menu creation and management
- **Client Management** - Customer data and interaction tracking
- **Coupon System** - Digital coupon creation and redemption

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Framework**: [Hono](https://hono.dev/)
- **Database**: [Supabase](https://supabase.com/)
- **Authentication**: JWT with [jose](https://github.com/panva/jose)
- **QR Code Generation**: [qrcode](https://github.com/soldair/node-qrcode)

## Prerequisites

- Bun 1.0.0 or higher
- Supabase account and project

## Getting Started

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/zvest-server.git

# Navigate to the project directory
cd zvest-server

# Install dependencies
bun install
```

### Environment Setup

Create a `.env` file in the root directory with the following variables:

```
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your_jwt_secret
# Add any other environment variables
```

### Running the Server

```bash
# Development mode with hot reloading
bun run dev

# Production mode
bun run start
```

## API Endpoints

The server exposes several endpoints grouped by functionality:

- `/auth/*` - Authentication routes
- `/dashboard/*` - Business dashboard routes
- `/client/*` - Client-facing routes
- `/loyalty/*` - Loyalty program routes
- `/public/*` - Publicly accessible data

## Project Structure

```
zvest-server/
├── src/
│   ├── config/        # Configuration files
│   ├── controllers/   # Request handlers
│   ├── middleware/    # Custom middleware
│   ├── routes/        # Route definitions
│   ├── types/         # TypeScript type definitions
│   ├── utils/         # Utility functions
│   ├── sqlMigrations/ # Database migrations
│   └── index.ts       # Application entry point
├── package.json
├── tsconfig.json
└── .env
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[MIT](LICENSE) or specify your license

## Contact

Your Name - email@example.com

Project Link: [https://github.com/your-username/zvest-server](https://github.com/your-username/zvest-server)
