import '../utils/env.js'; // 必须第一行：基于文件位置加载 .env
import { migrate } from './migrate.js';
import { seed } from './seed.js';

console.log('Starting migrate...');
migrate();
console.log('Migration done. Starting seed...');
seed();
console.log('All done!');
