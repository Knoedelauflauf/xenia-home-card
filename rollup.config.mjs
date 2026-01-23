import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";

const production = !process.env.ROLLUP_WATCH;

export default {
  input: "src/xenia-home-card.ts",
  output: {
    file: "dist/xenia-home-card.js",
    format: "es",
    sourcemap: !production,
  },
  plugins: [
    resolve(),
    commonjs(),
    json(),
    typescript({ sourceMap: !production }),
    production && terser(),
  ],
};
