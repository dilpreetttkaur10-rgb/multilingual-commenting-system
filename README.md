# Multilingual Commenting System

An advanced multilingual commenting platform that allows users to post comments in different languages, translate comments, interact through likes, dislikes, replies and mentions, and maintain a safe and moderated commenting environment.

## Features

- User registration and JWT-based login
- Multilingual comments
- Automatic language detection
- Comment translation
- User profile information
- Likes and dislikes
- Replies and @mentions
- Edit and delete own comments
- 15-minute edit and delete restrictions
- Soft deletion
- Newest, oldest, most liked and most relevant sorting
- Profanity and spam detection
- Duplicate comment detection
- Malicious link detection
- Emoji and special-character validation
- Rate limiting and CAPTCHA protection
- Comment reporting system
- Admin review of reports
- Comment history and moderation records

## Technology Stack

### Frontend
- Next.js
- React
- TypeScript
- CSS

### Backend
- Node.js
- Express.js
- TypeScript
- JWT

### Database
- PostgreSQL
- Prisma ORM

## Project Structure

```text
multilingual-commenting-system/
├── backend/
│   ├── prisma/
│   │   ├── migrations/
│   │   └── schema.prisma
│   └── src/
│       ├── controllers/
│       ├── middleware/
│       ├── routes/
│       ├── services/
│       └── utils/
│
├── frontend/
│   ├── app/
│   ├── components/
│   └── public/
│
└── .gitignore
