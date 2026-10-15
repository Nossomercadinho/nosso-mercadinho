import sqlite3 from 'sqlite3';
import path from 'path';

const sqlite = sqlite3.verbose();
let resolverBanco!: () => void;
let rejeitarBanco!: (error: Error) => void;
export const bancoPronto = new Promise<void>((resolve,reject) => { resolverBanco=resolve;rejeitarBanco=reject; });

/*
|--------------------------------------------------------------------------
| CAMINHO DO BANCO
|--------------------------------------------------------------------------
*/

const caminhoBanco = path.resolve(
  process.cwd(),
  'src',
  'database',
  'nosso-mercadinho.db'
);

console.log(
  'Banco utilizado:',
  caminhoBanco
);

const db = new sqlite.Database(
  caminhoBanco,
  (erro) => {
    if (erro) {
      rejeitarBanco(erro);
      console.error(
        'Erro ao abrir banco:',
        erro.message
      );

      return;
    }

    console.log(
      'Banco de dados conectado.'
    );
  }
);

/*
|--------------------------------------------------------------------------
| FOREIGN KEYS
|--------------------------------------------------------------------------
*/

db.run(
  'PRAGMA foreign_keys = ON'
);

db.serialize(() => {
  /*
  |--------------------------------------------------------------------------
  | EMPRESAS
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE TABLE IF NOT EXISTS empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      nome TEXT NOT NULL,
      razao_social TEXT,
      cnpj TEXT,

      ativo INTEGER DEFAULT 1,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  /*
  |--------------------------------------------------------------------------
  | LOJAS / UNIDADES
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE TABLE IF NOT EXISTS lojas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      empresa_id INTEGER,

      nome TEXT NOT NULL,
      codigo TEXT,

      tipo TEXT DEFAULT 'FILIAL',

      cnpj TEXT,

      endereco TEXT,
      numero TEXT,
      complemento TEXT,
      bairro TEXT,
      cidade TEXT,
      estado TEXT,
      cep TEXT,

      telefone TEXT,

      ativo INTEGER DEFAULT 1,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (empresa_id)
        REFERENCES empresas(id)
    )
  `);

  /*
  |--------------------------------------------------------------------------
  | LOCAIS DE ESTOQUE
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE TABLE IF NOT EXISTS locais_estoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      loja_id INTEGER NOT NULL,

      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,

      permite_venda INTEGER DEFAULT 0,

      ativo INTEGER DEFAULT 1,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (loja_id)
        REFERENCES lojas(id)
    )
  `);

  /*
  |--------------------------------------------------------------------------
  | USUÁRIOS
  |--------------------------------------------------------------------------
  */

  db.run(
    `
      CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        nome TEXT NOT NULL,

        email TEXT NOT NULL UNIQUE,

        senha TEXT NOT NULL,

        perfil TEXT NOT NULL DEFAULT 'OPERADOR',

        ativo INTEGER DEFAULT 1,

        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
    (erro) => {
      if (erro) {
        console.error(
          'Erro ao criar tabela usuarios:',
          erro.message
        );

        return;
      }

      console.log(
        'Tabela usuarios preparada.'
      );
    }
  );

  // Estruturas utilizadas pelas rotas operacionais também precisam existir
  // em instalações novas. IF NOT EXISTS preserva bancos já utilizados.
  db.run(`
    CREATE TABLE IF NOT EXISTS executores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS auditoria_operacoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      executor_id INTEGER NOT NULL,
      usuario_sessao_id INTEGER,
      modulo TEXT NOT NULL,
      acao TEXT NOT NULL,
      entidade TEXT,
      entidade_id INTEGER,
      descricao TEXT,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (executor_id) REFERENCES executores(id),
      FOREIGN KEY (usuario_sessao_id) REFERENCES usuarios(id)
    )
  `);

  /*
  |--------------------------------------------------------------------------
  | PRODUTOS
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      ean TEXT NOT NULL UNIQUE,

      nome TEXT NOT NULL,
      marca TEXT,
      foto TEXT,

      categoria TEXT,
      fornecedor TEXT,

      preco_custo REAL DEFAULT 0,
      preco_venda REAL DEFAULT 0,

      estoque REAL DEFAULT 0,
      estoque_minimo REAL DEFAULT 0,

      unidade_medida TEXT,

      ncm TEXT,
      cest TEXT,
      descricao_ncm TEXT,

      ativo INTEGER DEFAULT 1,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS produtos_lojas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      loja_id INTEGER NOT NULL,
      preco_venda REAL NOT NULL DEFAULT 0,
      estoque_minimo REAL NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (produto_id, loja_id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id),
      FOREIGN KEY (loja_id) REFERENCES lojas(id)
    )
  `);

  /*
  |--------------------------------------------------------------------------
  | FORNECEDORES
  |--------------------------------------------------------------------------
  |
  | Cadastro completo do fornecedor.
  |
  | Posteriormente a NF-e poderá identificar
  | automaticamente o fornecedor pelo CNPJ.
  |
  */

  db.run(
    `
      CREATE TABLE IF NOT EXISTS fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        empresa_id INTEGER,

        tipo_pessoa TEXT DEFAULT 'JURIDICA',

        nome_fantasia TEXT,
        razao_social TEXT NOT NULL,

        cpf_cnpj TEXT UNIQUE,

        inscricao_estadual TEXT,
        inscricao_municipal TEXT,

        telefone TEXT,
        whatsapp TEXT,

        email TEXT,
        site TEXT,

        contato_nome TEXT,
        contato_cargo TEXT,
        contato_telefone TEXT,
        contato_email TEXT,

        cep TEXT,

        endereco TEXT,
        numero TEXT,
        complemento TEXT,
        bairro TEXT,

        cidade TEXT,
        estado TEXT,

        prazo_pagamento_dias INTEGER DEFAULT 0,

        observacao TEXT,

        ativo INTEGER DEFAULT 1,

        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (empresa_id)
          REFERENCES empresas(id)
      )
    `,
    (erro) => {
      if (erro) {
        console.error(
          'Erro ao criar tabela fornecedores:',
          erro.message
        );

        return;
      }

      console.log(
        'Tabela fornecedores preparada.'
      );
    }
  );

  /*
  |--------------------------------------------------------------------------
  | PRODUTOS POR FORNECEDOR
  |--------------------------------------------------------------------------
  |
  | Um mesmo produto pode ser comprado
  | de fornecedores diferentes.
  |
  | Aqui teremos:
  |
  | - código usado pelo fornecedor
  | - último custo
  | - menor custo
  | - maior custo
  | - custo médio
  | - última compra
  |
  */

  db.run(
    `
      CREATE TABLE IF NOT EXISTS fornecedor_produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        fornecedor_id INTEGER NOT NULL,

        produto_id INTEGER NOT NULL,

        codigo_produto_fornecedor TEXT,

        ultimo_custo REAL DEFAULT 0,
        menor_custo REAL DEFAULT 0,
        maior_custo REAL DEFAULT 0,
        custo_medio REAL DEFAULT 0,

        quantidade_comprada REAL DEFAULT 0,

        ultima_compra_em DATETIME,

        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (fornecedor_id)
          REFERENCES fornecedores(id),

        FOREIGN KEY (produto_id)
          REFERENCES produtos(id),

        UNIQUE (
          fornecedor_id,
          produto_id
        )
      )
    `,
    (erro) => {
      if (erro) {
        console.error(
          'Erro ao criar tabela fornecedor_produtos:',
          erro.message
        );

        return;
      }

      console.log(
        'Tabela fornecedor_produtos preparada.'
      );
    }
  );

  /*
  |--------------------------------------------------------------------------
  | HISTÓRICO DE PREÇOS DOS FORNECEDORES
  |--------------------------------------------------------------------------
  |
  | Diferente de fornecedor_produtos,
  | esta tabela NÃO guarda apenas o último custo.
  |
  | Ela guarda cada compra.
  |
  | Assim poderemos saber:
  |
  | - quando comprou
  | - de quem comprou
  | - quanto pagou
  | - quantidade
  | - NF-e relacionada
  |
  */

  db.run(
    `
      CREATE TABLE IF NOT EXISTS fornecedor_precos_historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,

        fornecedor_id INTEGER NOT NULL,

        produto_id INTEGER NOT NULL,

        custo_unitario REAL NOT NULL,

        quantidade REAL DEFAULT 0,

        numero_nota TEXT,
        chave_nfe TEXT,

        data_compra DATETIME DEFAULT CURRENT_TIMESTAMP,

        observacao TEXT,

        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (fornecedor_id)
          REFERENCES fornecedores(id),

        FOREIGN KEY (produto_id)
          REFERENCES produtos(id)
      )
    `,
    (erro) => {
      if (erro) {
        console.error(
          'Erro ao criar histórico de preços:',
          erro.message
        );

        return;
      }

      console.log(
        'Tabela fornecedor_precos_historico preparada.'
      );
    }
  );

  /*
  |--------------------------------------------------------------------------
  | SALDOS DE ESTOQUE
  |--------------------------------------------------------------------------
  |
  | Exemplo:
  |
  | MATRIZ
  |   Depósito
  |   Área de Venda
  |
  | MAISON
  |   Depósito
  |   Área de Venda
  |
  */

  db.run(`
    CREATE TABLE IF NOT EXISTS estoque_saldos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      produto_id INTEGER NOT NULL,

      loja_id INTEGER NOT NULL,

      local_id INTEGER NOT NULL,

      quantidade REAL DEFAULT 0,

      custo_medio REAL DEFAULT 0,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (produto_id)
        REFERENCES produtos(id),

      FOREIGN KEY (loja_id)
        REFERENCES lojas(id),

      FOREIGN KEY (local_id)
        REFERENCES locais_estoque(id),

      UNIQUE (
        produto_id,
        loja_id,
        local_id
      )
    )
  `);

  /*
  |--------------------------------------------------------------------------
  | MOVIMENTAÇÕES DE ESTOQUE
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      produto_id INTEGER NOT NULL,

      tipo TEXT NOT NULL,

      quantidade REAL NOT NULL,

      custo_unitario REAL DEFAULT 0,

      loja_origem_id INTEGER,
      local_origem_id INTEGER,

      loja_destino_id INTEGER,
      local_destino_id INTEGER,

      usuario_id INTEGER,

      referencia TEXT,
      observacao TEXT,
      justificativa TEXT,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (produto_id)
        REFERENCES produtos(id),

      FOREIGN KEY (loja_origem_id)
        REFERENCES lojas(id),

      FOREIGN KEY (local_origem_id)
        REFERENCES locais_estoque(id),

      FOREIGN KEY (loja_destino_id)
        REFERENCES lojas(id),

      FOREIGN KEY (local_destino_id)
        REFERENCES locais_estoque(id),

      FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id)
    )
  `);

  /*
  |--------------------------------------------------------------------------
  | ÍNDICES - PRODUTOS
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_produtos_nome
    ON produtos(nome)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_produtos_ncm
    ON produtos(ncm)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_produtos_ativo
    ON produtos(ativo)
  `);

  /*
  |--------------------------------------------------------------------------
  | ÍNDICES - EMPRESA / LOJAS
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_lojas_empresa
    ON lojas(empresa_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_locais_loja
    ON locais_estoque(loja_id)
  `);

  /*
  |--------------------------------------------------------------------------
  | ÍNDICES - USUÁRIOS
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_usuarios_email
    ON usuarios(email)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_usuarios_ativo
    ON usuarios(ativo)
  `);

  /*
  |--------------------------------------------------------------------------
  | ÍNDICES - FORNECEDORES
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fornecedores_nome_fantasia
    ON fornecedores(nome_fantasia)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fornecedores_razao_social
    ON fornecedores(razao_social)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fornecedores_cpf_cnpj
    ON fornecedores(cpf_cnpj)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fornecedores_ativo
    ON fornecedores(ativo)
  `);

  /*
  |--------------------------------------------------------------------------
  | ÍNDICES - FORNECEDOR / PRODUTOS
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fornecedor_produtos_fornecedor
    ON fornecedor_produtos(fornecedor_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fornecedor_produtos_produto
    ON fornecedor_produtos(produto_id)
  `);

  /*
  |--------------------------------------------------------------------------
  | ÍNDICES - HISTÓRICO DE PREÇOS
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fornecedor_precos_fornecedor
    ON fornecedor_precos_historico(fornecedor_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fornecedor_precos_produto
    ON fornecedor_precos_historico(produto_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fornecedor_precos_data
    ON fornecedor_precos_historico(data_compra)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_fornecedor_precos_nfe
    ON fornecedor_precos_historico(chave_nfe)
  `);

  /*
  |--------------------------------------------------------------------------
  | ÍNDICES - ESTOQUE
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_estoque_produto
    ON estoque_saldos(produto_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_estoque_loja
    ON estoque_saldos(loja_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_estoque_local
    ON estoque_saldos(local_id)
  `);

  /*
  |--------------------------------------------------------------------------
  | ÍNDICES - MOVIMENTAÇÕES
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto
    ON movimentacoes_estoque(produto_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_movimentacoes_tipo
    ON movimentacoes_estoque(tipo)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_movimentacoes_usuario
    ON movimentacoes_estoque(usuario_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_movimentacoes_data
    ON movimentacoes_estoque(criado_em)
  `);

  /*
|--------------------------------------------------------------------------
| NF-e / NOTAS DE ENTRADA
|--------------------------------------------------------------------------
|
| Estrutura utilizada pelo módulo Compras para armazenar a NF-e importada,
| seus itens e suas parcelas/duplicatas antes da efetivação no estoque e
| da integração com o Financeiro.
|
| IMPORTANTE:
| - CREATE TABLE IF NOT EXISTS preserva os dados existentes.
| - As tabelas são criadas antes do Financeiro porque
|   financeiro_lancamentos referencia notas_entrada e notas_entrada_parcelas.
|
*/

/*
|--------------------------------------------------------------------------
| NOTAS DE ENTRADA
|--------------------------------------------------------------------------
*/

db.run(
  `
    CREATE TABLE IF NOT EXISTS notas_entrada (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      empresa_id INTEGER NOT NULL,

      fornecedor_id INTEGER,

      loja_id INTEGER,
      local_estoque_id INTEGER,

      chave_nfe TEXT NOT NULL UNIQUE,

      numero_nota TEXT,
      serie TEXT,
      modelo TEXT DEFAULT '55',

      natureza_operacao TEXT,

      data_emissao TEXT,
      data_saida_entrada TEXT,

      valor_produtos REAL DEFAULT 0,
      valor_frete REAL DEFAULT 0,
      valor_seguro REAL DEFAULT 0,
      valor_desconto REAL DEFAULT 0,
      valor_outros REAL DEFAULT 0,

      valor_icms REAL DEFAULT 0,
      valor_icms_st REAL DEFAULT 0,
      valor_ipi REAL DEFAULT 0,
      valor_pis REAL DEFAULT 0,
      valor_cofins REAL DEFAULT 0,

      valor_total REAL DEFAULT 0,

      quantidade_itens INTEGER DEFAULT 0,

      status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (
          status IN (
            'PENDENTE',
            'EFETIVADA',
            'CANCELADA'
          )
        ),

      xml TEXT,
      arquivo_nome TEXT,

      observacao TEXT,

      usuario_importacao_id INTEGER,
      usuario_efetivacao_id INTEGER,

      importado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      efetivado_em DATETIME,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (empresa_id)
        REFERENCES empresas(id),

      FOREIGN KEY (fornecedor_id)
        REFERENCES fornecedores(id),

      FOREIGN KEY (loja_id)
        REFERENCES lojas(id),

      FOREIGN KEY (local_estoque_id)
        REFERENCES locais_estoque(id),

      FOREIGN KEY (usuario_importacao_id)
        REFERENCES usuarios(id),

      FOREIGN KEY (usuario_efetivacao_id)
        REFERENCES usuarios(id)
    )
  `,
  (erro) => {
    if (erro) {
      console.error(
        'Erro ao criar tabela notas_entrada:',
        erro.message
      );

      return;
    }

    console.log(
      'Tabela notas_entrada preparada.'
    );
  }
);

/*
|--------------------------------------------------------------------------
| ITENS DAS NOTAS DE ENTRADA
|--------------------------------------------------------------------------
*/

db.run(
  `
    CREATE TABLE IF NOT EXISTS notas_entrada_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      nota_entrada_id INTEGER NOT NULL,
      fornecedor_id INTEGER,
      produto_id INTEGER,

      numero_item INTEGER,

      codigo_fornecedor TEXT,
      ean TEXT,

      descricao TEXT NOT NULL,

      ncm TEXT,
      cest TEXT,
      cfop TEXT,
      unidade TEXT,

      quantidade REAL NOT NULL DEFAULT 0,
      valor_unitario REAL NOT NULL DEFAULT 0,
      valor_total REAL NOT NULL DEFAULT 0,

      valor_desconto REAL DEFAULT 0,
      valor_frete REAL DEFAULT 0,
      valor_seguro REAL DEFAULT 0,
      valor_outros REAL DEFAULT 0,

      valor_icms REAL DEFAULT 0,
      valor_icms_st REAL DEFAULT 0,
      valor_ipi REAL DEFAULT 0,
      valor_pis REAL DEFAULT 0,
      valor_cofins REAL DEFAULT 0,

      status_vinculo TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (
          status_vinculo IN (
            'PENDENTE',
            'VINCULADO'
          )
        ),

      observacao TEXT,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (nota_entrada_id)
        REFERENCES notas_entrada(id),

      FOREIGN KEY (fornecedor_id)
        REFERENCES fornecedores(id),

      FOREIGN KEY (produto_id)
        REFERENCES produtos(id)
    )
  `,
  (erro) => {
    if (erro) {
      console.error(
        'Erro ao criar tabela notas_entrada_itens:',
        erro.message
      );

      return;
    }

    console.log(
      'Tabela notas_entrada_itens preparada.'
    );
  }
);

/*
|--------------------------------------------------------------------------
| PARCELAS / DUPLICATAS DAS NF-e
|--------------------------------------------------------------------------
*/

db.run(
  `
    CREATE TABLE IF NOT EXISTS notas_entrada_parcelas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      nota_entrada_id INTEGER NOT NULL,

      numero_parcela TEXT,
      vencimento TEXT,

      valor REAL NOT NULL DEFAULT 0,

      status TEXT NOT NULL DEFAULT 'PENDENTE'
        CHECK (
          status IN (
            'PENDENTE',
            'PAGO',
            'CANCELADO'
          )
        ),

      observacao TEXT,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (nota_entrada_id)
        REFERENCES notas_entrada(id)
    )
  `,
  (erro) => {
    if (erro) {
      console.error(
        'Erro ao criar tabela notas_entrada_parcelas:',
        erro.message
      );

      return;
    }

    console.log(
      'Tabela notas_entrada_parcelas preparada.'
    );
  }
);

/*
|--------------------------------------------------------------------------
| ÍNDICES - NF-e / NOTAS DE ENTRADA
|--------------------------------------------------------------------------
*/

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_fornecedor
  ON notas_entrada(fornecedor_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_loja
  ON notas_entrada(loja_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_local
  ON notas_entrada(local_estoque_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_status
  ON notas_entrada(status)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_data_emissao
  ON notas_entrada(data_emissao)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_itens_nota
  ON notas_entrada_itens(nota_entrada_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_itens_produto
  ON notas_entrada_itens(produto_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_itens_ean
  ON notas_entrada_itens(ean)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_parcelas_nota
  ON notas_entrada_parcelas(nota_entrada_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_parcelas_vencimento
  ON notas_entrada_parcelas(vencimento)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_notas_entrada_parcelas_status
  ON notas_entrada_parcelas(status)
`);

  /*
|--------------------------------------------------------------------------
| FINANCEIRO
|--------------------------------------------------------------------------
*/

/*
|--------------------------------------------------------------------------
| CATEGORIAS FINANCEIRAS
|--------------------------------------------------------------------------
*/

db.run(`
  CREATE TABLE IF NOT EXISTS financeiro_categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER,

    nome TEXT NOT NULL,

    tipo TEXT NOT NULL DEFAULT 'AMBOS'
      CHECK (tipo IN ('ENTRADA', 'SAIDA', 'AMBOS')),

    ativo INTEGER NOT NULL DEFAULT 1,

    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (empresa_id)
      REFERENCES empresas(id)
  )
`);

/*
|--------------------------------------------------------------------------
| LANÇAMENTOS FINANCEIROS
|--------------------------------------------------------------------------
*/

db.run(`
  CREATE TABLE IF NOT EXISTS financeiro_lancamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    empresa_id INTEGER NOT NULL,

    tipo TEXT NOT NULL
      CHECK (tipo IN ('ENTRADA', 'SAIDA')),

    fornecedor_id INTEGER,

    loja_id INTEGER,

    categoria_id INTEGER,

    descricao TEXT NOT NULL,

    numero_documento TEXT,

    valor_original REAL NOT NULL DEFAULT 0,

    data_emissao TEXT,

    data_vencimento TEXT NOT NULL,

    forma_pagamento TEXT,

    status TEXT NOT NULL DEFAULT 'PENDENTE'
      CHECK (
        status IN (
          'PENDENTE',
          'PAGO',
          'RECEBIDO',
          'CANCELADO'
        )
      ),

    nota_entrada_id INTEGER,

    nota_entrada_parcela_id INTEGER,

    observacao TEXT,

    usuario_criacao_id INTEGER,

    usuario_alteracao_id INTEGER,

    usuario_baixa_id INTEGER,

    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

    baixado_em DATETIME,

    cancelado_em DATETIME,

    motivo_cancelamento TEXT,

    FOREIGN KEY (empresa_id)
      REFERENCES empresas(id),

    FOREIGN KEY (fornecedor_id)
      REFERENCES fornecedores(id),

    FOREIGN KEY (loja_id)
      REFERENCES lojas(id),

    FOREIGN KEY (categoria_id)
      REFERENCES financeiro_categorias(id),

    FOREIGN KEY (nota_entrada_id)
      REFERENCES notas_entrada(id),

    FOREIGN KEY (nota_entrada_parcela_id)
      REFERENCES notas_entrada_parcelas(id),

    FOREIGN KEY (usuario_criacao_id)
      REFERENCES usuarios(id),

    FOREIGN KEY (usuario_alteracao_id)
      REFERENCES usuarios(id),

    FOREIGN KEY (usuario_baixa_id)
      REFERENCES usuarios(id)
  )
`);

/*
|--------------------------------------------------------------------------
| BAIXAS FINANCEIRAS
|--------------------------------------------------------------------------
|
| Uma conta pode ter uma ou várias baixas.
|
| Exemplo:
|
| Conta: R$ 5.000,00
|
| Pagamento 1: R$ 2.000,00
| Pagamento 2: R$ 3.000,00
|
|--------------------------------------------------------------------------
*/

db.run(`
  CREATE TABLE IF NOT EXISTS financeiro_baixas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    lancamento_id INTEGER NOT NULL,

    valor REAL NOT NULL,

    data_baixa TEXT NOT NULL,

    forma_pagamento TEXT,

    observacao TEXT,

    usuario_id INTEGER,

    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lancamento_id)
      REFERENCES financeiro_lancamentos(id),

    FOREIGN KEY (usuario_id)
      REFERENCES usuarios(id)
  )
`);

/*
|--------------------------------------------------------------------------
| HISTÓRICO / AUDITORIA FINANCEIRA
|--------------------------------------------------------------------------
*/

db.run(`
  CREATE TABLE IF NOT EXISTS financeiro_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    lancamento_id INTEGER NOT NULL,

    usuario_id INTEGER,

    acao TEXT NOT NULL,

    descricao TEXT,

    valor_anterior TEXT,

    valor_novo TEXT,

    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (lancamento_id)
      REFERENCES financeiro_lancamentos(id),

    FOREIGN KEY (usuario_id)
      REFERENCES usuarios(id)
  )
`);

/*
|--------------------------------------------------------------------------
| ÍNDICES - FINANCEIRO
|--------------------------------------------------------------------------
*/

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_tipo
  ON financeiro_lancamentos(tipo)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_status
  ON financeiro_lancamentos(status)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_vencimento
  ON financeiro_lancamentos(data_vencimento)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_fornecedor
  ON financeiro_lancamentos(fornecedor_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_loja
  ON financeiro_lancamentos(loja_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_categoria
  ON financeiro_lancamentos(categoria_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_nota
  ON financeiro_lancamentos(nota_entrada_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_usuario_criacao
  ON financeiro_lancamentos(usuario_criacao_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_baixa_lancamento
  ON financeiro_baixas(lancamento_id)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_baixa_data
  ON financeiro_baixas(data_baixa)
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_financeiro_historico_lancamento
  ON financeiro_historico(lancamento_id)
`);

  /*
  |--------------------------------------------------------------------------
  | VENDAS / PDV
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      loja_id INTEGER NOT NULL,
      local_id INTEGER NOT NULL,

      usuario_id INTEGER,
      executor_id INTEGER,

      status TEXT NOT NULL DEFAULT 'CONCLUIDA'
        CHECK (
          status IN (
            'CONCLUIDA',
            'CANCELADA'
          )
        ),

      valor_total REAL NOT NULL DEFAULT 0,

      observacao TEXT,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
      cancelado_em DATETIME,

      FOREIGN KEY (loja_id)
        REFERENCES lojas(id),

      FOREIGN KEY (local_id)
        REFERENCES locais_estoque(id),

      FOREIGN KEY (usuario_id)
        REFERENCES usuarios(id),

      FOREIGN KEY (executor_id)
        REFERENCES executores(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS venda_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      venda_id INTEGER NOT NULL,
      produto_id INTEGER NOT NULL,

      ean TEXT,
      descricao TEXT NOT NULL,

      quantidade REAL NOT NULL,
      preco_unitario REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (venda_id)
        REFERENCES vendas(id),

      FOREIGN KEY (produto_id)
        REFERENCES produtos(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS venda_pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      venda_id INTEGER NOT NULL,

      forma_pagamento TEXT NOT NULL,
      valor REAL NOT NULL DEFAULT 0,

      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (venda_id)
        REFERENCES vendas(id)
    )
  `);

  /*
  |--------------------------------------------------------------------------
  | ÍNDICES - VENDAS / PDV
  |--------------------------------------------------------------------------
  */

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_vendas_loja
    ON vendas(loja_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_vendas_local
    ON vendas(local_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_vendas_usuario
    ON vendas(usuario_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_vendas_executor
    ON vendas(executor_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_vendas_status
    ON vendas(status)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_vendas_data
    ON vendas(criado_em)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_venda_itens_venda
    ON venda_itens(venda_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_venda_itens_produto
    ON venda_itens(produto_id)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_venda_itens_ean
    ON venda_itens(ean)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_venda_pagamentos_venda
    ON venda_pagamentos(venda_id)
  `);

  /*
  |--------------------------------------------------------------------------
  | EMPRESA INICIAL
  |--------------------------------------------------------------------------
  */

  db.get(
    `
      SELECT id
      FROM empresas
      LIMIT 1
    `,
    [],
    (
      erro,
      empresa: any
    ) => {
      if (erro) {
        console.error(
          'Erro ao verificar empresa:',
          erro.message
        );
        rejeitarBanco(erro);
        return;
      }

      if (!empresa) {
        db.run(
          `
            INSERT INTO empresas (
              nome
            )

            VALUES (?)
          `,
          [
            'Nosso Mercadinho',
          ],
          function (erroInsert) {
            if (
              erroInsert
            ) {
              console.error(
                'Erro ao criar empresa inicial:',
                erroInsert.message
              );
              rejeitarBanco(erroInsert);
              return;
            }

            console.log(
              'Empresa Nosso Mercadinho criada.'
            );
            prepararMatrizInicial(this.lastID).then(resolverBanco,rejeitarBanco);
          }
        );
      } else {
        prepararMatrizInicial(empresa.id).then(resolverBanco,rejeitarBanco);
      }
    }
  );

  /*
  |--------------------------------------------------------------------------
  | FINALIZAÇÃO
  |--------------------------------------------------------------------------
  */

  console.log(
    'Estrutura completa do banco preparada.'
  );
});

// O catálogo e o PDV usam loja/local 1 como Matriz e Área de Venda.
// Inicializar somente bancos sem unidades e sem histórico de IDs.
function prepararMatrizInicial(empresaId: number): Promise<void> {
  return new Promise((resolve,reject) => {
  db.run(
    `INSERT INTO lojas (id, empresa_id, nome, codigo, tipo)
     SELECT 1, ?, 'Matriz', 'MATRIZ', 'MATRIZ'
     WHERE NOT EXISTS (SELECT 1 FROM lojas)
       AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'lojas' AND seq > 0)`,
    [empresaId],
    function (erro) {
      if (erro) { reject(erro); return; }
      if (!this.changes) { resolve(); return; }
      db.run(
        `INSERT INTO locais_estoque (id, loja_id, nome, tipo, permite_venda)
         SELECT 1, 1, 'Área de Venda', 'VENDA', 1
         WHERE NOT EXISTS (SELECT 1 FROM locais_estoque)
           AND NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name = 'locais_estoque' AND seq > 0)`,
        erroLocal => { if (erroLocal) reject(erroLocal); else resolve(); }
      );
    }
  );
  });
}

export default db;
