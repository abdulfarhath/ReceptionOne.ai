// Password hashing via bcrypt. Uses bcryptjs (pure-JS bcrypt implementation) so
// the project installs cleanly everywhere without native build tooling.

import bcrypt from "bcryptjs";

const DEFAULT_ROUNDS = 10;

export function hashPassword(
  plain: string,
  rounds: number = DEFAULT_ROUNDS,
): Promise<string> {
  return bcrypt.hash(plain, rounds);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
