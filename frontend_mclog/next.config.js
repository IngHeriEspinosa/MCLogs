/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Empaqueta el servidor y solo sus dependencias reales en .next/standalone,
  // para que la imagen de produccion no arrastre node_modules entero.
  output: "standalone",
  // La cabecera delata la tecnologia sin aportar nada al cliente.
  poweredByHeader: false,
};
module.exports = nextConfig;
