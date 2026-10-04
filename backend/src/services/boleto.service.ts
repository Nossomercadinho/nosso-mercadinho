export type ResultadoLeituraBoleto = {
  sucesso: boolean;
  tipo:
    | 'BOLETO_BANCARIO'
    | 'ARRECADACAO'
    | 'DESCONHECIDO';

  codigoOriginal: string;
  codigoNumerico: string;

  bancoCodigo?: string | null;

  valor?: number | null;

  vencimento?: string | null;

  codigoBarras?: string | null;

  mensagem?: string;
};

/*
|--------------------------------------------------------------------------
| LIMPEZA
|--------------------------------------------------------------------------
*/

function somenteNumeros(
  valor?: string | null
) {
  return String(valor || '')
    .replace(/\D/g, '');
}

/*
|--------------------------------------------------------------------------
| VALOR
|--------------------------------------------------------------------------
*/

function valorDe10Digitos(
  valor: string
) {
  if (
    !valor ||
    valor.length !== 10
  ) {
    return null;
  }

  const centavos =
    Number(valor);

  if (!Number.isFinite(centavos)) {
    return null;
  }

  return centavos / 100;
}

/*
|--------------------------------------------------------------------------
| DATA ISO
|--------------------------------------------------------------------------
*/

function formatarDataISO(
  data: Date
) {
  const ano =
    data.getFullYear();

  const mes =
    String(
      data.getMonth() + 1
    ).padStart(2, '0');

  const dia =
    String(
      data.getDate()
    ).padStart(2, '0');

  return `${ano}-${mes}-${dia}`;
}

/*
|--------------------------------------------------------------------------
| FATOR DE VENCIMENTO
|--------------------------------------------------------------------------
|
| REGRA NOVA:
|
| 22/02/2025 = fator 1000
| 23/02/2025 = fator 1001
| ...
|
|--------------------------------------------------------------------------
*/

function dataPorFatorVencimento(
  fator: number
) {
  if (
    !Number.isFinite(fator) ||
    fator <= 0
  ) {
    return null;
  }

  /*
  |--------------------------------------------------------------------------
  | NOVO CICLO - A PARTIR DE 22/02/2025
  |--------------------------------------------------------------------------
  */

  if (
    fator >= 1000 &&
    fator <= 9999
  ) {
    const baseNova =
      new Date(
        2025,
        1,
        22
      );

    const dias =
      fator - 1000;

    baseNova.setDate(
      baseNova.getDate() +
      dias
    );

    return formatarDataISO(
      baseNova
    );
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| CONVERTER LINHA DIGITÁVEL DE 47 DÍGITOS
|--------------------------------------------------------------------------
|
| BOLETO BANCÁRIO
|--------------------------------------------------------------------------
*/

function linha47ParaCodigo44(
  linha: string
) {
  if (
    linha.length !== 47
  ) {
    return null;
  }

  /*
    Linha digitável:

    Campo 1:
    1-4 banco/moeda
    5-9 campo livre
    10 DV

    Campo 2:
    11-20 campo livre
    21 DV

    Campo 3:
    22-31 campo livre
    32 DV

    Campo 4:
    33 DV geral

    Campo 5:
    34-37 fator
    38-47 valor
  */

  const bancoMoeda =
    linha.substring(0, 4);

  const campoLivre1 =
    linha.substring(4, 9);

  const campoLivre2 =
    linha.substring(10, 20);

  const campoLivre3 =
    linha.substring(21, 31);

  const dvGeral =
    linha.substring(32, 33);

  const fatorValor =
    linha.substring(33, 47);

  const codigoBarras =
    bancoMoeda +
    dvGeral +
    fatorValor +
    campoLivre1 +
    campoLivre2 +
    campoLivre3;

  return codigoBarras;
}

/*
|--------------------------------------------------------------------------
| LEITURA - BOLETO BANCÁRIO 47 DÍGITOS
|--------------------------------------------------------------------------
*/

function lerBoleto47(
  codigo: string
): ResultadoLeituraBoleto {
  const bancoCodigo =
    codigo.substring(0, 3);

  const fator =
    Number(
      codigo.substring(33, 37)
    );

  const valorTexto =
    codigo.substring(37, 47);

  const valor =
    valorDe10Digitos(
      valorTexto
    );

  const vencimento =
    dataPorFatorVencimento(
      fator
    );

  const codigoBarras =
    linha47ParaCodigo44(
      codigo
    );

  return {
    sucesso: true,

    tipo:
      'BOLETO_BANCARIO',

    codigoOriginal:
      codigo,

    codigoNumerico:
      codigo,

    bancoCodigo,

    valor,

    vencimento,

    codigoBarras,

    mensagem:
      'Boleto bancário identificado.',
  };
}

/*
|--------------------------------------------------------------------------
| LEITURA - CÓDIGO DE BARRAS 44 DÍGITOS
|--------------------------------------------------------------------------
*/

function lerBoleto44(
  codigo: string
): ResultadoLeituraBoleto {
  /*
    Estrutura boleto bancário 44:

    1-3 banco
    4 moeda
    5 DV
    6-9 fator vencimento
    10-19 valor
    20-44 campo livre
  */

  const primeiroDigito =
    codigo.substring(0, 1);

  /*
  |--------------------------------------------------------------------------
  | ARRECADAÇÃO / CONCESSIONÁRIA
  |--------------------------------------------------------------------------
  |
  | Códigos de arrecadação geralmente começam com 8.
  |
  |--------------------------------------------------------------------------
  */

  if (
    primeiroDigito === '8'
  ) {
    return {
      sucesso: true,

      tipo:
        'ARRECADACAO',

      codigoOriginal:
        codigo,

      codigoNumerico:
        codigo,

      codigoBarras:
        codigo,

      valor:
        null,

      vencimento:
        null,

      mensagem:
        'Código de arrecadação identificado. Valor e vencimento devem ser conferidos no documento.',
    };
  }

  const bancoCodigo =
    codigo.substring(0, 3);

  const fator =
    Number(
      codigo.substring(5, 9)
    );

  const valorTexto =
    codigo.substring(9, 19);

  return {
    sucesso: true,

    tipo:
      'BOLETO_BANCARIO',

    codigoOriginal:
      codigo,

    codigoNumerico:
      codigo,

    bancoCodigo,

    valor:
      valorDe10Digitos(
        valorTexto
      ),

    vencimento:
      dataPorFatorVencimento(
        fator
      ),

    codigoBarras:
      codigo,

    mensagem:
      'Código de barras bancário identificado.',
  };
}

/*
|--------------------------------------------------------------------------
| ARRECADAÇÃO - 48 DÍGITOS
|--------------------------------------------------------------------------
*/

function lerArrecadacao48(
  codigo: string
): ResultadoLeituraBoleto {
  /*
    Contas de concessionárias e arrecadação
    costumam possuir 48 dígitos.

    A estrutura varia conforme o segmento.

    Neste primeiro momento:
    - reconhecemos o tipo;
    - armazenamos o código;
    - não inventamos vencimento;
    - valor poderá ser aprimorado depois.
  */

  return {
    sucesso: true,

    tipo:
      'ARRECADACAO',

    codigoOriginal:
      codigo,

    codigoNumerico:
      codigo,

    bancoCodigo:
      null,

    valor:
      null,

    vencimento:
      null,

    codigoBarras:
      null,

    mensagem:
      'Código de arrecadação/concessionária identificado. Confira valor e vencimento.',
  };
}

/*
|--------------------------------------------------------------------------
| FUNÇÃO PRINCIPAL
|--------------------------------------------------------------------------
*/

export function lerCodigoBoleto(
  codigoInformado: string
): ResultadoLeituraBoleto {
  const codigo =
    somenteNumeros(
      codigoInformado
    );

  if (!codigo) {
    throw new Error(
      'Informe o código de barras ou a linha digitável.'
    );
  }

  /*
  |--------------------------------------------------------------------------
  | LINHA DIGITÁVEL BANCÁRIA
  |--------------------------------------------------------------------------
  */

  if (
    codigo.length === 47
  ) {
    return lerBoleto47(
      codigo
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ARRECADAÇÃO
  |--------------------------------------------------------------------------
  */

  if (
    codigo.length === 48
  ) {
    return lerArrecadacao48(
      codigo
    );
  }

  /*
  |--------------------------------------------------------------------------
  | CÓDIGO DE BARRAS
  |--------------------------------------------------------------------------
  */

  if (
    codigo.length === 44
  ) {
    return lerBoleto44(
      codigo
    );
  }

  throw new Error(
    `Código inválido. Foram encontrados ${codigo.length} dígitos. Esperado: 44, 47 ou 48 dígitos.`
  );
}