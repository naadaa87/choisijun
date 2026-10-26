/* 내부 폴더는 홈페이지 주소로 열리지 않게 404 */
import { hiddenFolder } from '../_lib/core.js';
export const onRequest = hiddenFolder;
