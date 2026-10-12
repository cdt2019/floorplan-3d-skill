import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// 无头 Edge 的配置文件夹（.profiles/）、输出（out/）、烘焙结果放在仓库里：不监听，不然截图截到一半页面被热重载
export default defineConfig({ plugins: [react()], server: { watch: { ignored: ["**/.profiles/**", "**/out/**", "**/public/bake/**", "**/public/assets/**"] } } });
