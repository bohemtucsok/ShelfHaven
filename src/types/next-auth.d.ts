import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN";
      language: string;
      theme: string;
      defaultView: string;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: "USER" | "ADMIN";
    language?: string;
    theme?: string;
    defaultView?: string;
    lastVerified?: number;
  }
}
