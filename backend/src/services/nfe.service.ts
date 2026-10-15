import { comBloqueioBanco } from './caixas.service';
import { garantirVinculosCadastros, lojaCadastroAtual, vincularCadastroNaLoja } from './cadastros-lojas.service';
import db from '../database/database';
import { escopoLojaSql } from './escopo-lojas.service';

import {
  buscarFornecedorPorCpfCnpj,
  criarFornecedor,
  registrarPrecoFornecedor,
} from './fornecedores.service';

type XmlObjeto = Record<string, any>;

type ImportarNfePayload = {
  xml: string;
  arquivoNome?: string;
  lojaId?: number | null;
  localEstoqueId?: number | null;
  usuarioId?: number | null;
};

type ItemNfe = {
  numeroItem: number;
  codigoFornecedor?: string;
  ean?: string;
  descricao: string;
  ncm?: string;
  cest?: string;
  cfop?: string;
  unidade?: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  valorDesconto: number;
  valorFrete: number;
  valorSeguro: number;
  valorOutrasDespesas: number;
  valorIcms: number;
  valorIpi: number;
  valorPis: number;
  valorCofins: number;
  produtoId?: number | null;
  statusVinculo: 'VINCULADO' | 'PENDENTE';
};

type ParcelaNfe = {
  numeroParcela?: string;
  vencimento?: string;
  valor: number;
};

/*
|--------------------------------------------------------------------------
| SQLITE
|--------------------------------------------------------------------------
*/

function executarRun(
  sql: string,
  parametros: any[] = []
): Promise<{
  lastID: number;
  changes: number;
}> {
  return new Promise((resolve, reject) => {
    db.run(
      sql,
      parametros,
      function (erro) {
        if (erro) {
          reject(erro);
          return;
        }

        resolve({
          lastID: this.lastID,
          changes: this.changes,
        });
      }
    );
  });
}

function executarGet<T = any>(
  sql: string,
  parametros: any[] = []
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(
      sql,
      parametros,
      (erro, resultado) => {
        if (erro) {
          reject(erro);
          return;
        }

        resolve(
          resultado as
            | T
            | undefined
        );
      }
    );
  });
}

function executarAll<T = any>(
  sql: string,
  parametros: any[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(
      sql,
      parametros,
      (erro, resultados) => {
        if (erro) {
          reject(erro);
          return;
        }

        resolve(
          resultados as T[]
        );
      }
    );
  });
}

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function somenteNumeros(
  valor?: string | null
) {
  return String(
    valor || ''
  ).replace(/\D/g, '');
}

function texto(valor: any) {
  if (
    valor === undefined ||
    valor === null
  ) {
    return '';
  }

  if (
    typeof valor === 'string'
  ) {
    return valor.trim();
  }

  if (
    typeof valor === 'number'
  ) {
    return String(valor);
  }

  if (
    typeof valor === 'object' &&
    '_' in valor
  ) {
    return String(
      valor._
    ).trim();
  }

  return String(
    valor
  ).trim();
}

function numero(valor: any) {
  if (
    valor === undefined ||
    valor === null ||
    valor === ''
  ) {
    return 0;
  }

  if (
    typeof valor === 'number'
  ) {
    return Number.isFinite(
      valor
    )
      ? valor
      : 0;
  }

  const convertido =
    Number(
      String(valor)
        .trim()
        .replace(',', '.')
    );

  return Number.isFinite(
    convertido
  )
    ? convertido
    : 0;
}

function primeiro(valor: any) {
  if (
    Array.isArray(valor)
  ) {
    return valor[0];
  }

  return valor;
}

function lista(valor: any) {
  if (!valor) {
    return [];
  }

  return Array.isArray(valor)
    ? valor
    : [valor];
}

/*
|--------------------------------------------------------------------------
| PARSE XML
|--------------------------------------------------------------------------
*/

async function parsearXml(
  xml: string
): Promise<XmlObjeto> {
  if (
    !xml ||
    !xml.trim()
  ) {
    throw new Error(
      'XML não informado.'
    );
  }

  try {
    const pacote =
      await import(
        'fast-xml-parser'
      );

    const XMLParser =
      pacote.XMLParser;

    const parser =
      new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        removeNSPrefix: true,
        parseTagValue: false,
        trimValues: true,
      });

    return parser.parse(xml);
  } catch (error: any) {
    if (
      error?.message?.includes(
        'fast-xml-parser'
      )
    ) {
      throw error;
    }

    console.error(
      'Erro ao interpretar XML:',
      error
    );

    throw new Error(
      'XML inválido ou não reconhecido.'
    );
  }
}

/*
|--------------------------------------------------------------------------
| LOCALIZAR infNFe
|--------------------------------------------------------------------------
*/

function localizarInfNFe(
  objeto: any
): any {
  if (
    !objeto ||
    typeof objeto !== 'object'
  ) {
    return undefined;
  }

  if (objeto.infNFe) {
    return primeiro(
      objeto.infNFe
    );
  }

  for (
    const chave of
    Object.keys(objeto)
  ) {
    const encontrado =
      localizarInfNFe(
        objeto[chave]
      );

    if (encontrado) {
      return encontrado;
    }
  }

  return undefined;
}

/*
|--------------------------------------------------------------------------
| DADOS DA NOTA
|--------------------------------------------------------------------------
*/

function extrairDadosNota(
  infNFe: any
) {
  const ide =
    primeiro(
      infNFe.ide
    ) || {};

  const total =
    primeiro(
      infNFe.total
    ) || {};

  const icmsTot =
    primeiro(
      total.ICMSTot
    ) || {};

  let chave =
    texto(
      infNFe['@_Id']
    );

  chave =
    chave.replace(
      /^NFe/i,
      ''
    );

  if (!chave) {
    throw new Error(
      'Chave da NF-e não encontrada.'
    );
  }

  return {
    chaveNfe: chave,
    numeroNota:
      texto(ide.nNF),
    serie:
      texto(ide.serie),
    modelo:
      texto(ide.mod),
    naturezaOperacao:
      texto(ide.natOp),
    dataEmissao:
      texto(
        ide.dhEmi ||
          ide.dEmi
      ),
    dataSaidaEntrada:
      texto(
        ide.dhSaiEnt ||
          ide.dSaiEnt
      ),

    valorProdutos:
      numero(
        icmsTot.vProd
      ),

    valorFrete:
      numero(
        icmsTot.vFrete
      ),

    valorSeguro:
      numero(
        icmsTot.vSeg
      ),

    valorDesconto:
      numero(
        icmsTot.vDesc
      ),

    valorOutrasDespesas:
      numero(
        icmsTot.vOutro
      ),

    valorIcms:
      numero(
        icmsTot.vICMS
      ),

    valorIpi:
      numero(
        icmsTot.vIPI
      ),

    valorPis:
      numero(
        icmsTot.vPIS
      ),

    valorCofins:
      numero(
        icmsTot.vCOFINS
      ),

    valorTotal:
      numero(
        icmsTot.vNF
      ),
  };
}

/*
|--------------------------------------------------------------------------
| FORNECEDOR
|--------------------------------------------------------------------------
*/

function extrairFornecedor(
  infNFe: any
) {
  const emit =
    primeiro(
      infNFe.emit
    );

  if (!emit) {
    throw new Error(
      'Emitente não encontrado na NF-e.'
    );
  }

  const endereco =
    primeiro(
      emit.enderEmit
    ) || {};

  const cnpj =
    somenteNumeros(
      texto(
        emit.CNPJ
      )
    );

  const cpf =
    somenteNumeros(
      texto(
        emit.CPF
      )
    );

  const cpfCnpj =
    cnpj || cpf;

  if (!cpfCnpj) {
    throw new Error(
      'CPF/CNPJ do fornecedor não encontrado na NF-e.'
    );
  }

  const razaoSocial =
    texto(
      emit.xNome
    );

  if (!razaoSocial) {
    throw new Error(
      'Razão social do fornecedor não encontrada na NF-e.'
    );
  }

  return {
    cpfCnpj,
    razaoSocial,

    nomeFantasia:
      texto(
        emit.xFant
      ) || undefined,

    inscricaoEstadual:
      texto(
        emit.IE
      ) || undefined,

    telefone:
      texto(
        endereco.fone
      ) || undefined,

    cep:
      somenteNumeros(
        texto(
          endereco.CEP
        )
      ) || undefined,

    endereco:
      texto(
        endereco.xLgr
      ) || undefined,

    numero:
      texto(
        endereco.nro
      ) || undefined,

    complemento:
      texto(
        endereco.xCpl
      ) || undefined,

    bairro:
      texto(
        endereco.xBairro
      ) || undefined,

    cidade:
      texto(
        endereco.xMun
      ) || undefined,

    estado:
      texto(
        endereco.UF
      ).toUpperCase() ||
      undefined,
  };
}

async function localizarOuCriarFornecedor(
  dados: ReturnType<
    typeof extrairFornecedor
  >,
  lojaId: number
) {
  const existente =
    await buscarFornecedorPorCpfCnpj(
      dados.cpfCnpj
    );

  if (existente) {
    await vincularCadastroNaLoja('fornecedor',Number(existente.id),lojaId);
    return {
      fornecedor: existente,
      criado: false,
    };
  }

  const fornecedor =
    await criarFornecedor({
      lojaId,
      empresaId: 1,

      tipoPessoa:
        dados.cpfCnpj.length ===
        11
          ? 'FISICA'
          : 'JURIDICA',

      nomeFantasia:
        dados.nomeFantasia,

      razaoSocial:
        dados.razaoSocial,

      cpfCnpj:
        dados.cpfCnpj,

      inscricaoEstadual:
        dados.inscricaoEstadual,

      telefone:
        dados.telefone,

      whatsapp:
        dados.telefone,

      cep:
        dados.cep,

      endereco:
        dados.endereco,

      numero:
        dados.numero,

      complemento:
        dados.complemento,

      bairro:
        dados.bairro,

      cidade:
        dados.cidade,

      estado:
        dados.estado,

      ativo: true,

      observacao:
        'Fornecedor cadastrado automaticamente pela importação de NF-e.',
    });

  return {
    fornecedor,
    criado: true,
  };
}

/*
|--------------------------------------------------------------------------
| PRODUTO POR EAN
|--------------------------------------------------------------------------
*/

async function buscarProdutoPorEan(
  ean?: string
) {
  if (!ean) {
    return null;
  }

  const eanLimpo =
    texto(ean);

  if (
    !eanLimpo ||
    eanLimpo.toUpperCase() ===
      'SEM GTIN'
  ) {
    return null;
  }

  const produto =
    await executarGet(
      `
        SELECT
          id,
          ean,
          nome,
          marca,
          ncm,
          unidade_medida

        FROM produtos

        WHERE ean = ?
          AND EXISTS (SELECT 1 FROM produtos_lojas pl_ativo WHERE pl_ativo.produto_id = produtos.id
            AND pl_ativo.ativo = 1 AND ${escopoLojaSql('pl_ativo.loja_id')})

        LIMIT 1
      `,
      [eanLimpo]
    );

  return produto || null;
}

/*
|--------------------------------------------------------------------------
| IMPOSTOS
|--------------------------------------------------------------------------
*/

function encontrarCampoRecursivo(
  objeto: any,
  campo: string
): any {
  if (
    !objeto ||
    typeof objeto !== 'object'
  ) {
    return undefined;
  }

  if (
    campo in objeto
  ) {
    return objeto[campo];
  }

  for (
    const chave of
    Object.keys(objeto)
  ) {
    const resultado =
      encontrarCampoRecursivo(
        objeto[chave],
        campo
      );

    if (
      resultado !==
      undefined
    ) {
      return resultado;
    }
  }

  return undefined;
}

function extrairImposto(
  imposto: any,
  campo: string
) {
  return numero(
    encontrarCampoRecursivo(
      imposto,
      campo
    )
  );
}

/*
|--------------------------------------------------------------------------
| ITENS
|--------------------------------------------------------------------------
*/

async function extrairItens(
  infNFe: any
): Promise<ItemNfe[]> {
  const detalhes =
    lista(
      infNFe.det
    );

  const itens:
    ItemNfe[] = [];

  for (
    let i = 0;
    i < detalhes.length;
    i++
  ) {
    const det =
      detalhes[i];

    const prod =
      primeiro(
        det.prod
      ) || {};

    const imposto =
      primeiro(
        det.imposto
      ) || {};

    let ean =
      texto(
        prod.cEAN
      );

    if (
      !ean ||
      ean.toUpperCase() ===
        'SEM GTIN'
    ) {
      ean =
        texto(
          prod.cEANTrib
        );
    }

    if (
      ean.toUpperCase() ===
      'SEM GTIN'
    ) {
      ean = '';
    }

    const produto =
      await buscarProdutoPorEan(
        ean
      );

    const numeroItem =
      Number(
        det['@_nItem'] ||
          i + 1
      );

    itens.push({
      numeroItem,

      codigoFornecedor:
        texto(
          prod.cProd
        ) || undefined,

      ean:
        ean || undefined,

      descricao:
        texto(
          prod.xProd
        ) ||
        `Item ${numeroItem}`,

      ncm:
        texto(
          prod.NCM
        ) || undefined,

      cest:
        texto(
          prod.CEST
        ) || undefined,

      cfop:
        texto(
          prod.CFOP
        ) || undefined,

      unidade:
        texto(
          prod.uCom
        ) || undefined,

      quantidade:
        numero(
          prod.qCom
        ),

      valorUnitario:
        numero(
          prod.vUnCom
        ),

      valorTotal:
        numero(
          prod.vProd
        ),

      valorDesconto:
        numero(
          prod.vDesc
        ),

      valorFrete:
        numero(
          prod.vFrete
        ),

      valorSeguro:
        numero(
          prod.vSeg
        ),

      valorOutrasDespesas:
        numero(
          prod.vOutro
        ),

      valorIcms:
        extrairImposto(
          imposto,
          'vICMS'
        ),

      valorIpi:
        extrairImposto(
          imposto,
          'vIPI'
        ),

      valorPis:
        extrairImposto(
          imposto,
          'vPIS'
        ),

      valorCofins:
        extrairImposto(
          imposto,
          'vCOFINS'
        ),

      produtoId:
        produto
          ? Number(
              produto.id
            )
          : null,

      statusVinculo:
        produto
          ? 'VINCULADO'
          : 'PENDENTE',
    });
  }

  return itens;
}

/*
|--------------------------------------------------------------------------
| PARCELAS
|--------------------------------------------------------------------------
*/

function extrairParcelas(
  infNFe: any
): ParcelaNfe[] {
  const cobr =
    primeiro(
      infNFe.cobr
    );

  if (!cobr) {
    return [];
  }

  const duplicatas =
    lista(
      cobr.dup
    );

  return duplicatas.map(
    (dup: any) => ({
      numeroParcela:
        texto(
          dup.nDup
        ) || undefined,

      vencimento:
        texto(
          dup.dVenc
        ) || undefined,

      valor:
        numero(
          dup.vDup
        ),
    })
  );
}

/*
|--------------------------------------------------------------------------
| BUSCAR NOTA POR CHAVE
|--------------------------------------------------------------------------
*/

async function buscarNotaPorChave(
  chaveNfe: string
) {
  return executarGet(
    `
      SELECT id

      FROM notas_entrada

      WHERE chave_nfe = ?

      LIMIT 1
    `,
    [chaveNfe]
  );
}

/*
|--------------------------------------------------------------------------
| IMPORTAR NF-e
|--------------------------------------------------------------------------
*/

async function importarNfeXmlImpl(
  dados: ImportarNfePayload
) {
  await garantirVinculosCadastros();
  for (const tabela of ['notas_entrada','notas_entrada_itens']) {
    const colunas = await executarAll<any>(`PRAGMA table_info(${tabela})`);
    if (!colunas.some(c => c.name === 'valor_outros')) {
      await executarRun(`ALTER TABLE ${tabela} ADD COLUMN valor_outros REAL DEFAULT 0`);
      if (colunas.some(c => c.name === 'valor_outras_despesas')) await executarRun(`UPDATE ${tabela} SET valor_outros = COALESCE(valor_outras_despesas,0)`);
    }
  }
  dados = { ...dados, lojaId: lojaCadastroAtual(Number(dados.lojaId)||undefined) };
  const xmlObjeto =
    await parsearXml(
      dados.xml
    );

  const infNFe =
    localizarInfNFe(
      xmlObjeto
    );

  if (!infNFe) {
    throw new Error(
      'Não foi possível localizar infNFe no XML.'
    );
  }

  const dadosNota =
    extrairDadosNota(
      infNFe
    );

  const notaExistente =
    await buscarNotaPorChave(
      dadosNota.chaveNfe
    );

  if (notaExistente) {
    throw new Error(
      `A NF-e ${dadosNota.numeroNota || ''} já foi importada.`
    );
  }

  const fornecedorXml =
    extrairFornecedor(
      infNFe
    );

  const fornecedorResultado =
    await localizarOuCriarFornecedor(
      fornecedorXml,
      Number(dados.lojaId)
    );

  const fornecedor: any =
    fornecedorResultado
      .fornecedor;

  const itens =
    await extrairItens(
      infNFe
    );

  if (
    itens.length === 0
  ) {
    throw new Error(
      'Nenhum item foi encontrado na NF-e.'
    );
  }

  const parcelas =
    extrairParcelas(
      infNFe
    );

  await executarRun(
    'BEGIN TRANSACTION'
  );

  try {
    const resultadoNota =
      await executarRun(
        `
          INSERT INTO notas_entrada (
            empresa_id,
            fornecedor_id,
            loja_id,
            local_estoque_id,
            chave_nfe,
            numero_nota,
            serie,
            modelo,
            natureza_operacao,
            data_emissao,
            data_saida_entrada,
            valor_produtos,
            valor_frete,
            valor_seguro,
            valor_desconto,
            valor_outros,
            valor_icms,
            valor_ipi,
            valor_pis,
            valor_cofins,
            valor_total,
            quantidade_itens,
            status,
            xml,
            arquivo_nome,
            usuario_importacao_id
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            'PENDENTE',
            ?,
            ?,
            ?
          )
        `,
        [
          1,
          fornecedor.id,

          dados.lojaId ||
            null,

          dados.localEstoqueId ||
            null,

          dadosNota.chaveNfe,

          dadosNota.numeroNota ||
            null,

          dadosNota.serie ||
            null,

          dadosNota.modelo ||
            null,

          dadosNota.naturezaOperacao ||
            null,

          dadosNota.dataEmissao ||
            null,

          dadosNota.dataSaidaEntrada ||
            null,

          dadosNota.valorProdutos,
          dadosNota.valorFrete,
          dadosNota.valorSeguro,
          dadosNota.valorDesconto,
          dadosNota.valorOutrasDespesas,
          dadosNota.valorIcms,
          dadosNota.valorIpi,
          dadosNota.valorPis,
          dadosNota.valorCofins,
          dadosNota.valorTotal,

          itens.length,

          dados.xml,

          dados.arquivoNome ||
            null,

          dados.usuarioId ||
            null,
        ]
      );

    const notaEntradaId =
      resultadoNota.lastID;

    for (
      const item of
      itens
    ) {
      await executarRun(
        `
          INSERT INTO notas_entrada_itens (
            nota_entrada_id,
            fornecedor_id,
            produto_id,
            numero_item,
            codigo_fornecedor,
            ean,
            descricao,
            ncm,
            cest,
            cfop,
            unidade,
            quantidade,
            valor_unitario,
            valor_total,
            valor_desconto,
            valor_frete,
            valor_seguro,
            valor_outros,
            valor_icms,
            valor_ipi,
            valor_pis,
            valor_cofins,
            status_vinculo
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `,
        [
          notaEntradaId,
          fornecedor.id,
          item.produtoId || null,
          item.numeroItem,
          item.codigoFornecedor || null,
          item.ean || null,
          item.descricao,
          item.ncm || null,
          item.cest || null,
          item.cfop || null,
          item.unidade || null,
          item.quantidade,
          item.valorUnitario,
          item.valorTotal,
          item.valorDesconto,
          item.valorFrete,
          item.valorSeguro,
          item.valorOutrasDespesas,
          item.valorIcms,
          item.valorIpi,
          item.valorPis,
          item.valorCofins,
          item.statusVinculo,
        ]
      );
    }

    for (
      const parcela of
      parcelas
    ) {
      await executarRun(
        `
          INSERT INTO notas_entrada_parcelas (
            nota_entrada_id,
            numero_parcela,
            vencimento,
            valor,
            status
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            'PENDENTE'
          )
        `,
        [
          notaEntradaId,
          parcela.numeroParcela ||
            null,
          parcela.vencimento ||
            null,
          parcela.valor,
        ]
      );
    }

    await executarRun(
      'COMMIT'
    );

    const vinculados =
      itens.filter(
        (item) =>
          item.statusVinculo ===
          'VINCULADO'
      ).length;

    const pendentes =
      itens.filter(
        (item) =>
          item.statusVinculo ===
          'PENDENTE'
      ).length;

    return {
      sucesso: true,

      notaEntradaId,

      fornecedor: {
        id:
          fornecedor.id,

        nomeFantasia:
          fornecedor.nome_fantasia,

        razaoSocial:
          fornecedor.razao_social,

        cpfCnpj:
          fornecedor.cpf_cnpj,

        cadastradoAutomaticamente:
          fornecedorResultado.criado,
      },

      nota: {
        chaveNfe:
          dadosNota.chaveNfe,

        numeroNota:
          dadosNota.numeroNota,

        serie:
          dadosNota.serie,

        dataEmissao:
          dadosNota.dataEmissao,

        valorProdutos:
          dadosNota.valorProdutos,

        valorTotal:
          dadosNota.valorTotal,

        quantidadeItens:
          itens.length,

        status:
          'PENDENTE',
      },

      resumoItens: {
        total:
          itens.length,
        vinculados,
        pendentes,
      },

      itens,
      parcelas,
    };
  } catch (error) {
    await executarRun(
      'ROLLBACK'
    );

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| LISTAR NOTAS
|--------------------------------------------------------------------------
*/

export async function listarNotasEntrada(
  limite = 200
) {
  return executarAll(
    `
      SELECT
        n.id,
        n.loja_id,
        n.local_estoque_id,
        n.chave_nfe,
        n.numero_nota,
        n.serie,
        n.data_emissao,
        n.valor_produtos,
        n.valor_total,
        n.quantidade_itens,
        n.status,
        n.importado_em,
        n.efetivado_em,

        f.id
          AS fornecedor_id,

        COALESCE(
          NULLIF(
            f.nome_fantasia,
            ''
          ),
          f.razao_social
        )
          AS fornecedor,

        f.cpf_cnpj,

        l.nome
          AS loja,

        le.nome
          AS local_estoque,

        (
          SELECT COUNT(*)

          FROM notas_entrada_itens ni

          WHERE
            ni.nota_entrada_id =
            n.id

            AND
            ni.produto_id
            IS NULL
        )
          AS itens_pendentes

      FROM notas_entrada n

      INNER JOIN fornecedores f
        ON f.id =
          n.fornecedor_id

      LEFT JOIN lojas l
        ON l.id =
          n.loja_id

      LEFT JOIN locais_estoque le
        ON le.id =
          n.local_estoque_id

      WHERE ${escopoLojaSql('n.loja_id')}

      ORDER BY
        n.id DESC

      LIMIT ?
    `,
    [
      Math.max(
        1,
        Math.min(
          limite,
          1000
        )
      ),
    ]
  );
}

/*
|--------------------------------------------------------------------------
| BUSCAR NOTA COMPLETA
|--------------------------------------------------------------------------
*/

export async function buscarNotaEntradaPorId(
  id: number
) {
  const nota =
    await executarGet(
      `
        SELECT
          n.*,

          f.nome_fantasia
            AS fornecedor_nome_fantasia,

          f.razao_social
            AS fornecedor_razao_social,

          f.cpf_cnpj
            AS fornecedor_cpf_cnpj,

          l.nome
            AS loja,

          le.nome
            AS local_estoque

        FROM notas_entrada n

        INNER JOIN fornecedores f
          ON f.id =
            n.fornecedor_id

        LEFT JOIN lojas l
          ON l.id =
            n.loja_id

        LEFT JOIN locais_estoque le
          ON le.id =
            n.local_estoque_id

        WHERE
          n.id = ?
          AND ${escopoLojaSql('n.loja_id')}

        LIMIT 1
      `,
      [id]
    );

  if (!nota) {
    throw new Error(
      'Nota de entrada não encontrada.'
    );
  }

  const itens =
    await executarAll(
      `
        SELECT
          ni.*,

          p.nome
            AS produto_local,

          p.marca
            AS produto_marca,

          p.preco_custo
            AS produto_preco_custo,

          p.preco_venda
            AS produto_preco_venda

        FROM notas_entrada_itens ni

        LEFT JOIN produtos p
          ON p.id =
            ni.produto_id

        WHERE
          ni.nota_entrada_id = ?

        ORDER BY
          ni.numero_item,
          ni.id
      `,
      [id]
    );

  const parcelas =
    await executarAll(
      `
        SELECT
          *

        FROM notas_entrada_parcelas

        WHERE
          nota_entrada_id = ?

        ORDER BY
          vencimento,
          id
      `,
      [id]
    );

  return {
    nota,
    itens,
    parcelas,
  };
}

/*
|--------------------------------------------------------------------------
| VINCULAR ITEM A PRODUTO EXISTENTE
|--------------------------------------------------------------------------
*/

async function vincularItemNotaProdutoImpl(
  notaItemId: number,
  produtoId: number
) {
  const item =
    await executarGet(
      `
        SELECT
          *

        FROM notas_entrada_itens

        WHERE id = ?
          AND EXISTS (SELECT 1 FROM notas_entrada n_ativa WHERE n_ativa.id = notas_entrada_itens.nota_entrada_id AND ${escopoLojaSql('n_ativa.loja_id')})

        LIMIT 1
      `,
      [notaItemId]
    );

  if (!item) {
    throw new Error(
      'Item da NF-e não encontrado.'
    );
  }

  const produto =
    await executarGet(
      `
        SELECT
          id,
          nome,
          ean

        FROM produtos

        WHERE id = ?
          AND EXISTS (SELECT 1 FROM produtos_lojas pl_ativo WHERE pl_ativo.produto_id = produtos.id
            AND pl_ativo.ativo = 1 AND ${escopoLojaSql('pl_ativo.loja_id')})

        LIMIT 1
      `,
      [produtoId]
    );

  if (!produto) {
    throw new Error(
      'Produto não encontrado.'
    );
  }

  await executarRun(
    `
      UPDATE notas_entrada_itens

      SET
        produto_id = ?,

        status_vinculo =
          'VINCULADO',

        atualizado_em =
          CURRENT_TIMESTAMP

      WHERE id = ?
    `,
    [
      produtoId,
      notaItemId,
    ]
  );

  return executarGet(
    `
      SELECT
        *

      FROM notas_entrada_itens

      WHERE id = ?

      LIMIT 1
    `,
    [notaItemId]
  );
}
/*
|--------------------------------------------------------------------------
| EFETIVAR ENTRADA DA NF-e
|--------------------------------------------------------------------------
|
| Esta é a função que realmente movimenta o estoque.
|
| Regras:
|
| - Nota precisa estar PENDENTE
| - Todos os produtos precisam estar vinculados
| - A nota precisa ter unidade e local definidos
| - Uma nota EFETIVADA não pode ser lançada novamente
|
*/

async function efetivarNotaEntradaImpl(
  notaEntradaId: number,
  usuarioId?: number | null
) {
  /*
  |--------------------------------------------------------------------------
  | BUSCAR NOTA
  |--------------------------------------------------------------------------
  */

  const nota: any =
    await executarGet(
      `
        SELECT
          *

        FROM notas_entrada

        WHERE id = ?
          AND ${escopoLojaSql('loja_id')}

        LIMIT 1
      `,
      [notaEntradaId]
    );

  if (!nota) {
    throw new Error(
      'Nota de entrada não encontrada.'
    );
  }

  /*
  |--------------------------------------------------------------------------
  | STATUS
  |--------------------------------------------------------------------------
  */

  if (
    String(nota.status).toUpperCase() ===
    'EFETIVADA'
  ) {
    throw new Error(
      'Esta NF-e já foi efetivada anteriormente.'
    );
  }

  if (
    String(nota.status).toUpperCase() !==
    'PENDENTE'
  ) {
    throw new Error(
      `A NF-e está com status ${nota.status} e não pode ser efetivada.`
    );
  }

  /*
  |--------------------------------------------------------------------------
  | DESTINO
  |--------------------------------------------------------------------------
  */

  if (!nota.loja_id) {
    throw new Error(
      'A NF-e não possui unidade de destino definida.'
    );
  }

  if (!nota.local_estoque_id) {
    throw new Error(
      'A NF-e não possui local de estoque definido.'
    );
  }

  /*
  |--------------------------------------------------------------------------
  | VALIDAR LOCAL
  |--------------------------------------------------------------------------
  */

  const local: any =
    await executarGet(
      `
        SELECT
          id,
          loja_id,
          nome,
          tipo,
          ativo

        FROM locais_estoque

        WHERE id = ?

        LIMIT 1
      `,
      [nota.local_estoque_id]
    );

  if (!local) {
    throw new Error(
      'Local de estoque da NF-e não encontrado.'
    );
  }

  if (
    Number(local.loja_id) !==
    Number(nota.loja_id)
  ) {
    throw new Error(
      'O local de estoque não pertence à unidade selecionada.'
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ITENS
  |--------------------------------------------------------------------------
  */

  const itens: any[] =
    await executarAll(
      `
        SELECT
          *

        FROM notas_entrada_itens

        WHERE nota_entrada_id = ?

        ORDER BY
          numero_item,
          id
      `,
      [notaEntradaId]
    );

  if (
    itens.length === 0
  ) {
    throw new Error(
      'A NF-e não possui itens.'
    );
  }

  /*
  |--------------------------------------------------------------------------
  | VERIFICAR PRODUTOS PENDENTES
  |--------------------------------------------------------------------------
  */

  const itensPendentes =
    itens.filter(
      (item) =>
        !item.produto_id
    );

  if (
    itensPendentes.length > 0
  ) {
    throw new Error(
      `Existem ${itensPendentes.length} item(ns) da NF-e sem produto vinculado.`
    );
  }

  /*
  |--------------------------------------------------------------------------
  | TRANSAÇÃO
  |--------------------------------------------------------------------------
  */

  await executarRun(
    'BEGIN TRANSACTION'
  );

  try {
    /*
    |--------------------------------------------------------------------------
    | PROCESSAR CADA ITEM
    |--------------------------------------------------------------------------
    */

    for (
      const item of itens
    ) {
      const produtoId =
        Number(
          item.produto_id
        );

      const quantidadeEntrada =
        Number(
          item.quantidade || 0
        );

      const custoUnitario =
        Number(
          item.valor_unitario || 0
        );

      if (
        quantidadeEntrada <= 0
      ) {
        throw new Error(
          `Quantidade inválida no item ${item.numero_item}.`
        );
      }

      /*
      |--------------------------------------------------------------------------
      | PRODUTO
      |--------------------------------------------------------------------------
      */

      const produto: any =
        await executarGet(
          `
            SELECT
              id,
              nome,
              ean

            FROM produtos

            WHERE id = ?

            LIMIT 1
          `,
          [produtoId]
        );

      if (!produto) {
        throw new Error(
          `Produto do item ${item.numero_item} não encontrado.`
        );
      }

      /*
      |--------------------------------------------------------------------------
      | SALDO ATUAL
      |--------------------------------------------------------------------------
      */

      const saldoAtual: any =
        await executarGet(
          `
            SELECT
              id,
              quantidade,
              custo_medio

            FROM estoque_saldos

            WHERE
              produto_id = ?
              AND loja_id = ?
              AND local_id = ?

            LIMIT 1
          `,
          [
            produtoId,
            nota.loja_id,
            nota.local_estoque_id,
          ]
        );

      const quantidadeAnterior =
        Number(
          saldoAtual?.quantidade || 0
        );

      const custoAnterior =
        Number(
          saldoAtual?.custo_medio || 0
        );

      const novaQuantidade =
        quantidadeAnterior +
        quantidadeEntrada;

      /*
      |--------------------------------------------------------------------------
      | CUSTO MÉDIO
      |--------------------------------------------------------------------------
      |
      | Neste momento usamos o valor unitário do XML.
      |
      */

      let novoCustoMedio =
        custoUnitario;

      if (
        novaQuantidade > 0
      ) {
        const valorAnterior =
          quantidadeAnterior *
          custoAnterior;

        const valorEntrada =
          quantidadeEntrada *
          custoUnitario;

        novoCustoMedio =
          (
            valorAnterior +
            valorEntrada
          ) /
          novaQuantidade;
      }

      /*
      |--------------------------------------------------------------------------
      | ATUALIZAR / CRIAR SALDO
      |--------------------------------------------------------------------------
      */

      if (saldoAtual) {
        await executarRun(
          `
            UPDATE estoque_saldos

            SET
              quantidade = ?,

              custo_medio = ?,

              atualizado_em =
                CURRENT_TIMESTAMP

            WHERE id = ?
          `,
          [
            novaQuantidade,
            novoCustoMedio,
            saldoAtual.id,
          ]
        );
      } else {
        await executarRun(
          `
            INSERT INTO estoque_saldos (
              produto_id,
              loja_id,
              local_id,
              quantidade,
              custo_medio
            )

            VALUES (
              ?, ?, ?, ?, ?
            )
          `,
          [
            produtoId,
            nota.loja_id,
            nota.local_estoque_id,
            quantidadeEntrada,
            custoUnitario,
          ]
        );
      }

      /*
      |--------------------------------------------------------------------------
      | MOVIMENTAÇÃO DE ESTOQUE
      |--------------------------------------------------------------------------
      */

      await executarRun(
        `
          INSERT INTO movimentacoes_estoque (
            produto_id,

            tipo,

            quantidade,

            custo_unitario,

            loja_destino_id,

            local_destino_id,

            usuario_id,

            referencia,

            observacao
          )

          VALUES (
            ?,
            'ENTRADA_NF',
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
        `,
        [
          produtoId,

          quantidadeEntrada,

          custoUnitario,

          nota.loja_id,

          nota.local_estoque_id,

          usuarioId || null,

          `NF-e ${nota.numero_nota || ''}`,

          `Entrada pela NF-e ${nota.numero_nota || ''} - chave ${nota.chave_nfe}`,
        ]
      );

      /*
      |--------------------------------------------------------------------------
      | HISTÓRICO DE PREÇO DO FORNECEDOR
      |--------------------------------------------------------------------------
      */

      await registrarPrecoFornecedor({
        fornecedorId: Number(nota.fornecedor_id), produtoId, lojaId: Number(nota.loja_id),
        codigoProdutoFornecedor: item.codigo_fornecedor || undefined,
        custoUnitario, quantidade: quantidadeEntrada,
        numeroNota: nota.numero_nota || undefined, chaveNfe: nota.chave_nfe || undefined,
        dataCompra: nota.data_emissao || undefined,
        observacao: 'Preço registrado automaticamente pela efetivação da NF-e.',
      });
      /*
      |--------------------------------------------------------------------------
      | SINCRONIZAR PRODUTO
      |--------------------------------------------------------------------------
      |
      | produtos.estoque continua servindo para a tela Produtos.
      |
      */

      const totalProduto: any =
        await executarGet(
          `
            SELECT
              COALESCE(
                SUM(quantidade),
                0
              )
                AS quantidade_total,

              COALESCE(
                SUM(
                  quantidade *
                  custo_medio
                ),
                0
              )
                AS valor_total

            FROM estoque_saldos

            WHERE produto_id = ?
          `,
          [produtoId]
        );

      const quantidadeTotal =
        Number(
          totalProduto
            ?.quantidade_total ||
            0
        );

      const valorTotalEstoque =
        Number(
          totalProduto
            ?.valor_total ||
            0
        );

      const custoMedioProduto =
        quantidadeTotal > 0
          ? valorTotalEstoque /
            quantidadeTotal
          : custoUnitario;

      await executarRun(
        `
          UPDATE produtos

          SET
            estoque = ?,

            preco_custo = ?,

            atualizado_em =
              CURRENT_TIMESTAMP

          WHERE id = ?
        `,
        [
          quantidadeTotal,
          custoMedioProduto,
          produtoId,
        ]
      );
    }

    /*
    |--------------------------------------------------------------------------
    | EFETIVAR NOTA
    |--------------------------------------------------------------------------
    */

    await executarRun(
      `
        UPDATE notas_entrada

        SET
          status = 'EFETIVADA',

          usuario_efetivacao_id = ?,

          efetivado_em =
            CURRENT_TIMESTAMP,

          atualizado_em =
            CURRENT_TIMESTAMP

        WHERE id = ?
      `,
      [
        usuarioId || null,
        notaEntradaId,
      ]
    );

    await executarRun(
      'COMMIT'
    );
  } catch (error) {
    await executarRun(
      'ROLLBACK'
    );

    throw error;
  }

  /*
  |--------------------------------------------------------------------------
  | RETORNAR NOTA ATUALIZADA
  |--------------------------------------------------------------------------
  */

  return buscarNotaEntradaPorId(
    notaEntradaId
  );
}

export function importarNfeXml(...args: Parameters<typeof importarNfeXmlImpl>) { return comBloqueioBanco(() => importarNfeXmlImpl(...args)); }

export function vincularItemNotaProduto(...args: Parameters<typeof vincularItemNotaProdutoImpl>) { return comBloqueioBanco(() => vincularItemNotaProdutoImpl(...args)); }

export function efetivarNotaEntrada(...args: Parameters<typeof efetivarNotaEntradaImpl>) { return comBloqueioBanco(() => efetivarNotaEntradaImpl(...args)); }
