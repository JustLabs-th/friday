import type { NextConfig } from "next";

const config: NextConfig = {
  // A self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
};

export default config;
