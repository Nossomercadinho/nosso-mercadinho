import 'dotenv/config';
import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import type { ApplicationDatabase } from '../database/adapter.types';

const ajuda = `Cria o primeiro administrador de uma instalação PostgreSQL nova.
Exige DB_CLIENT=postgres, DATABASE_URL, migrations e seed técnico aplicados.

Uso interativo: npm run admin:criar
Automação: npm run admin:criar -- --nome "Nome" --email "email@empresa.com" --password-stdin

A senha é solicitada sem eco, ou recebida pela entrada padrão com --password-stdin.
Não aceite senhas em argumentos ou variáveis de ambiente. Instalações com usuários são recusadas.
`;

function argumentos(args: string[]) {
  const resultado = { nome: '', email: '', stdin: false, ajuda: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--help') resultado.ajuda = true;
    else if (args[i] === '--password-stdin') resultado.stdin = true;
    else if ((args[i] === '--nome' || args[i] === '--email') && args[i + 1] && !args[i + 1].startsWith('--')) {
      const campo = args[i] === '--nome' ? 'nome' : 'email';
      resultado[campo] = args[++i];
    } else throw new Error('Argumentos inválidos. Use --help; senhas não são aceitas na linha de comando.');
  }
  return resultado;
}

function senhaOculta(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || !process.stdout.isTTY) return reject(new Error('Use um terminal interativo ou a opção --password-stdin.'));
    let senha = '';
    const modoAnterior = input.isRaw;
    readline.emitKeypressEvents(input);
    const concluir = (error?: Error) => {
      input.removeListener('keypress', tecla);
      input.setRawMode(Boolean(modoAnterior));
      input.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(senha);
      senha = '';
    };
    const tecla = (texto: string, key: readline.Key) => {
      if (key.ctrl && key.name === 'c') return concluir(new Error('Operação cancelada.'));
      if (key.name === 'return' || key.name === 'enter') return concluir();
      if (key.name === 'backspace' || key.name === 'delete') { senha = Array.from(senha).slice(0, -1).join(''); return; }
      if (!key.ctrl && !key.meta && texto && !/[\r\n\0\x1b]/.test(texto)) senha += texto;
      if (Buffer.byteLength(senha, 'utf8') > 1024) concluir(new Error('A senha informada excedeu o tamanho permitido.'));
    };
    input.setRawMode(true);
    input.on('keypress', tecla);
    input.resume();
    process.stdout.write(prompt);
  });
}

async function senhaStdin() {
  process.stdin.setEncoding('utf8');
  let entrada = '';
  for await (const chunk of process.stdin) {
    entrada += chunk.toString('utf8');
    if (Buffer.byteLength(entrada, 'utf8') > 1024) throw new Error('A entrada padrão excedeu o tamanho permitido.');
  }
  return entrada.replace(/\r?\n$/, '');
}

async function main() {
  let database: ApplicationDatabase | undefined;
  try {
    const opcoes = argumentos(process.argv.slice(2));
    if (opcoes.ajuda) { process.stdout.write(ajuda); return; }
    if (String(process.env.DB_CLIENT).toLowerCase() !== 'postgres') throw new Error('Este comando exige DB_CLIENT=postgres e uma instalação PostgreSQL nova. O SQLite local não será aberto.');
    if (opcoes.stdin && (!opcoes.nome || !opcoes.email)) throw new Error('Com --password-stdin, informe --nome e --email.');
    if (!opcoes.stdin && !process.stdin.isTTY) throw new Error('Use um terminal interativo ou a opção --password-stdin.');
    if (!opcoes.nome || !opcoes.email) {
      const terminal = createInterface({ input: process.stdin, output: process.stdout });
      try {
        if (!opcoes.nome) opcoes.nome = await terminal.question('Nome do primeiro administrador: ');
        if (!opcoes.email) opcoes.email = await terminal.question('E-mail: ');
      } finally { terminal.close(); }
    }
    let senha = opcoes.stdin ? await senhaStdin() : await senhaOculta('Senha (mínimo 12 caracteres; não será exibida): ');
    if (!opcoes.stdin && senha !== await senhaOculta('Confirme a senha: ')) throw new Error('As senhas não coincidem. Nenhum usuário foi criado.');
    const modulo = await import('../database/database');
    database = modulo.default;
    const { criarPrimeiroAdministrador, ErroPrimeiroAdmin } = await import('../services/primeiro-admin.service');
    let codigoExecutor = '';
    try { ({ codigoExecutor } = await criarPrimeiroAdministrador({ nome: opcoes.nome, email: opcoes.email, senha })); }
    catch (error) {
      if (error instanceof ErroPrimeiroAdmin) throw new Error(error.message);
      throw new Error('Não foi possível criar o administrador. Confira a conexão, as migrations e as permissões do banco.');
    } finally { senha = ''; }
    process.stdout.write('Primeiro administrador criado. Você já pode entrar no sistema com o acesso informado.\n');
    process.stdout.write(`Identificação operacional para estoque e fechamento: ${codigoExecutor}. Esse código não é uma senha.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Não foi possível concluir a operação.'}\n`);
    process.exitCode = 1;
  } finally {
    if (database) await new Promise<void>(resolve => database!.close(() => resolve()));
  }
}

void main();
