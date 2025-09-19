import bcrypt from 'bcryptjs';

export async function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// utilidad para generar un hash rápido desde consola
if (process.argv.includes('--make-hash')) {
  const pwd = process.env.PWD || 'Admin123*';
  const hash = bcrypt.hashSync(pwd, 12);
  console.log('Password:', pwd);
  console.log('Bcrypt hash:', hash);
}
