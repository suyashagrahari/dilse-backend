import dotenv from "dotenv";
dotenv.config();

export const env = {
  PORT: parseInt(process.env.PORT || "5000", 10),
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/gifts",
  NODE_ENV: process.env.NODE_ENV || "development",
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  JWT_SECRET: process.env.JWT_SECRET || "default_jwt_secret_change_me",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "default_refresh_secret_change_me",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
} as const;
