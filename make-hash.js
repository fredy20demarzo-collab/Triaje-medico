import bcrypt from 'bcrypt';

const password = 'Admin123*';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, (err, hash) => {
  if (err) {
    console.error('Error al generar hash:', err);
  } else {
    console.log('Hash generado:', hash);
  }
});
