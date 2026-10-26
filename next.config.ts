import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    // Evita warning de "multiple lockfiles" — força workspace root no projeto.
    root: path.resolve(__dirname),
  },
  experimental: {
    // Cache em disco do `next dev` (padrão desde a 16.1) chegou a 30 GB em
    // .next/dev e levava minutos gravando a cada compilação. Sem ele o dev
    // compila do zero a cada `npm run dev`, mas só o que for aberto.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
