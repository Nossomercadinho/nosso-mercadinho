import fs from 'fs';
import path from 'path';

type ItemNcm = {
  codigo: string;
  descricao: string;
};

type ResultadoNcm = {
  codigo: string;
  descricao: string;
} | null;

let tabelaNcm: ItemNcm[] | null = null;

function somenteNumeros(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

function encontrarItensNcm(
  valor: unknown,
  encontrados: ItemNcm[]
) {
  if (Array.isArray(valor)) {
    for (const item of valor) {
      encontrarItensNcm(item, encontrados);
    }
    return;
  }

  if (typeof valor !== 'object' || valor === null) {
    return;
  }

  const objeto = valor as Record<string, unknown>;

  const codigoPossivel =
    objeto.codigo ??
    objeto.Codigo ??
    objeto.code ??
    objeto.Code ??
    objeto.ncm ??
    objeto.NCM;

  const descricaoPossivel =
    objeto.descricao ??
    objeto.Descricao ??
    objeto.description ??
    objeto.Description;

  if (
    codigoPossivel !== undefined &&
    descricaoPossivel !== undefined
  ) {
    const codigo = somenteNumeros(codigoPossivel);

    if (codigo.length === 8) {
      encontrados.push({
        codigo,
        descricao: String(descricaoPossivel),
      });
    }
  }

  for (const item of Object.values(objeto)) {
    encontrarItensNcm(item, encontrados);
  }
}

function carregarTabelaLocal(): ItemNcm[] {
  if (tabelaNcm) {
    return tabelaNcm;
  }

  const caminhoArquivo = path.resolve(
    process.cwd(),
    'src',
    'database',
    'ncm',
    'ncm.json'
  );

  console.log('Carregando NCM local...');
  console.log('Arquivo:', caminhoArquivo);

  if (!fs.existsSync(caminhoArquivo)) {
    throw new Error(
      'Arquivo local ncm.json não encontrado.'
    );
  }

  const conteudo = fs.readFileSync(
    caminhoArquivo,
    'utf-8'
  );

  const data: unknown = JSON.parse(conteudo);

  const encontrados: ItemNcm[] = [];

  encontrarItensNcm(data, encontrados);

  const mapa = new Map<string, ItemNcm>();

  for (const item of encontrados) {
    mapa.set(item.codigo, item);
  }

  tabelaNcm = Array.from(mapa.values());

  console.log(
    'Tabela NCM local carregada:',
    tabelaNcm.length,
    'códigos.'
  );

  if (tabelaNcm.length === 0) {
    throw new Error(
      'Nenhum NCM foi encontrado no arquivo local.'
    );
  }

  return tabelaNcm;
}

export async function buscarNcm(
  codigoInformado: string
): Promise<ResultadoNcm> {
  const codigo = somenteNumeros(codigoInformado);

  if (codigo.length !== 8) {
    return null;
  }

  const tabela = carregarTabelaLocal();

  const encontrado = tabela.find(
    (item) => item.codigo === codigo
  );

  return encontrado ?? null;
}

export async function validarNcm(
  codigoInformado: string
): Promise<boolean> {
  const resultado = await buscarNcm(codigoInformado);

  return resultado !== null;
}