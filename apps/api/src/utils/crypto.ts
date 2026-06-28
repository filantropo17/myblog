/**
 * 密码哈希与 token 生成工具。
 * - 用 Node 内置 scrypt（避免 bcrypt 原生编译依赖）
 * - 格式：scrypt$N$r$p$saltB64$hashB64
 */
import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { encodeHexLowerCase } from '@oslojs/encoding';

const scrypt = promisify(scryptCb);

// 推荐 cost=12；scrypt N=2^15 ≈ bcrypt cost=10，平衡安全与性能
const SCRYPT_N = 16384; // 2^14
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SALT_LEN = 16;
const KEY_LEN = 64;

/** 生成密码哈希。 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const hash = (await scrypt(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
  })) as Buffer;
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_r,
    SCRYPT_p,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/** 校验密码。 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    const actual = (await scrypt(password, salt, expected.length, { N, r, p })) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** 生成 32 字节 hex token，用于 session id / unsubscribe token / confirm token。 */
export function generateToken(byteLen = 32): string {
  return encodeHexLowerCase(randomBytes(byteLen));
}

/** 对 IP+UA 派生一个稳定的 hash（去重与限流）。 */
export function visitorHash(ip: string, salt = ''): string {
  // 简单 SHA256，不暴露 IP 明文
  return createHash('sha256').update(ip + '|' + salt).digest('hex');
}