import type { NextConfig } from "next";

// Sin Cache Components: cada pantalla muestra datos privados del hogar, así que se
// renderiza en el servidor en cada visita (más simple y sin riesgo de cachear datos de otro).
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
