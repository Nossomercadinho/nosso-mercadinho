import { comBloqueioBanco } from './caixas.service';
import db from '../database/database';
import { escopoLojaSql } from './escopo-lojas.service';
import { cadastroVisivelSql, garantirVinculosCadastros, lojaCadastroAtual, exigirCadastroNaLoja, vincularCadastroNaLoja } from './cadastros-lojas.service';
export type FornecedorPayload = {
    empresaId?: number | null;
    tipoPessoa?: 'FISICA' | 'JURIDICA';
    nomeFantasia?: string;
    razaoSocial: string;
    cpfCnpj?: string;
    inscricaoEstadual?: string;
    inscricaoMunicipal?: string;
    telefone?: string;
    whatsapp?: string;
    email?: string;
    site?: string;
    contatoNome?: string;
    contatoCargo?: string;
    contatoTelefone?: string;
    contatoEmail?: string;
    cep?: string;
    endereco?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    prazoPagamentoDias?: number | string;
    observacao?: string;
    ativo?: number | boolean;
    lojaId?: number;
};
export type VinculoFornecedorProdutoPayload = {
    fornecedorId: number;
    produtoId: number;
    codigoProdutoFornecedor?: string;
    custoUnitario?: number | string;
    quantidade?: number | string;
    numeroNota?: string;
    chaveNfe?: string;
    dataCompra?: string;
    observacao?: string;
    lojaId?: number;
};
const run = (sql: string, args: any[] = []) => new Promise<{
    lastID: number;
    changes: number;
}>((resolve, reject) => db.run(sql, args, function (e) { e ? reject(e) : resolve({ lastID: this.lastID, changes: this.changes }); }));
const get = <T = any>(sql: string, args: any[] = []) => new Promise<T | undefined>((resolve, reject) => db.get(sql, args, (e, row) => e ? reject(e) : resolve(row as T | undefined)));
const all = <T = any>(sql: string, args: any[] = []) => new Promise<T[]>((resolve, reject) => db.all(sql, args, (e, rows) => e ? reject(e) : resolve(rows as T[])));
const digitos = (v: unknown) => String(v || '').replace(/\D/g, '');
const numero = (v: unknown) => { const s = String(v ?? '0'); const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : 0; };
const texto = (v: unknown) => String(v ?? '').trim() || null;
const campos: Record<string, string> = { empresaId: 'empresa_id', tipoPessoa: 'tipo_pessoa', nomeFantasia: 'nome_fantasia', razaoSocial: 'razao_social', cpfCnpj: 'cpf_cnpj', inscricaoEstadual: 'inscricao_estadual', inscricaoMunicipal: 'inscricao_municipal', telefone: 'telefone', whatsapp: 'whatsapp', email: 'email', site: 'site', contatoNome: 'contato_nome', contatoCargo: 'contato_cargo', contatoTelefone: 'contato_telefone', contatoEmail: 'contato_email', cep: 'cep', endereco: 'endereco', numero: 'numero', complemento: 'complemento', bairro: 'bairro', cidade: 'cidade', estado: 'estado', prazoPagamentoDias: 'prazo_pagamento_dias', observacao: 'observacao' };
function dadosFornecedor(body: any) {
    const out: Record<string, unknown> = {};
    for (const [api, db] of Object.entries(campos))
        if (body[api] !== undefined)
            out[db] = api === 'cpfCnpj' || api === 'cep' ? digitos(body[api]) || null : api === 'prazoPagamentoDias' ? Math.max(0, Math.trunc(numero(body[api]))) : api === 'empresaId' ? Number(body[api]) || 1 : texto(body[api]);
    return out;
}
function publico(row: any) {
    let alteracoes = {};
    try {
        alteracoes = JSON.parse(row.dados_json || '{}');
    }
    catch { }
    const { dados_json, vinculoAtivo, ...base } = row;
    return { ...base, ...alteracoes, ativo: vinculoAtivo ?? base.ativo };
}
async function validarFornecedor(id: number) { return buscarFornecedorPorId(id); }
async function validarProduto(id: number, lojaId = lojaCadastroAtual()) {
    const p = await get('SELECT p.id FROM produtos p JOIN produtos_lojas pl ON pl.produto_id=p.id WHERE p.id=? AND pl.loja_id=? AND pl.ativo=1', [id, lojaId]);
    if (!p)
        throw new Error('Produto não encontrado no mercado ativo.');
    return p;
}
export async function listarFornecedores(busca?: string, somenteAtivos = false) {
    await garantirVinculosCadastros();
    const rows = await all(`SELECT f.*,fl.ativo AS vinculoAtivo,fl.dados_json,
    (SELECT COUNT(*) FROM fornecedor_produtos_lojas fp WHERE fp.fornecedor_id=f.id AND ${escopoLojaSql('fp.loja_id')}) AS total_produtos,
    (SELECT COUNT(*) FROM fornecedor_precos_historico h WHERE h.fornecedor_id=f.id AND ${escopoLojaSql('h.loja_id')}) AS total_compras_registradas
    FROM fornecedores f JOIN fornecedores_lojas fl ON fl.fornecedor_id=f.id
    WHERE ${escopoLojaSql('fl.loja_id')}
      AND fl.loja_id=(SELECT MIN(fl_preferido.loja_id) FROM fornecedores_lojas fl_preferido
        WHERE fl_preferido.fornecedor_id=f.id AND ${escopoLojaSql('fl_preferido.loja_id')})
    ORDER BY f.razao_social COLLATE NOCASE`);
    const termo = String(busca || '').trim().toLocaleLowerCase('pt-BR');
    return rows.map(publico).filter(f => (!somenteAtivos || Number(f.ativo) === 1) && (!termo || [f.nome_fantasia, f.razao_social, f.cpf_cnpj, f.telefone, f.whatsapp, f.email, f.cidade].some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(termo))));
}
export async function buscarFornecedorPorId(id: number) {
    await garantirVinculosCadastros();
    const row = await get(`SELECT f.*,fl.ativo AS vinculoAtivo,fl.dados_json FROM fornecedores f JOIN fornecedores_lojas fl ON fl.fornecedor_id=f.id WHERE f.id=? AND ${escopoLojaSql('fl.loja_id')} LIMIT 1`, [id]);
    if (!row)
        throw new Error('Fornecedor não encontrado.');
    return publico(row);
}
export async function buscarFornecedorPorCpfCnpj(cpfCnpj: string) {
    await garantirVinculosCadastros();
    const doc = digitos(cpfCnpj);
    if (!doc)
        return null;
    const row = await get(`SELECT f.*,fl.ativo AS vinculoAtivo,fl.dados_json FROM fornecedores f JOIN fornecedores_lojas fl ON fl.fornecedor_id=f.id WHERE f.cpf_cnpj=? AND ${escopoLojaSql('fl.loja_id')} LIMIT 1`, [doc]);
    return row ? publico(row) : null;
}
/** Name-only beneficiaries must never match a supplier from another store. */
export async function buscarBeneficiarioPorNome(nome: string, lojaId: number) {
    const normalizar = (valor: unknown) => String(valor || '').normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    const termo = normalizar(nome);
    const rows = await all(`SELECT f.*,fl.ativo AS vinculoAtivo,fl.dados_json
        FROM fornecedores f JOIN fornecedores_lojas fl ON fl.fornecedor_id=f.id WHERE fl.loja_id=?`, [lojaId]);
    const encontrados = rows.map(publico).filter(f =>
        [f.razao_social, f.nome_fantasia].some(n => normalizar(n) === termo));
    if (encontrados.length > 1) throw new Error('Há mais de um fornecedor com este nome. Selecione o beneficiário na pesquisa.');
    const fornecedor = encontrados[0];
    if (fornecedor && Number(fornecedor.ativo) !== 1) throw new Error('Este fornecedor está inativo no mercado. Revise seu cadastro antes de salvar o boleto.');
    return fornecedor;
}
async function criarFornecedorImpl(body: FornecedorPayload) {
    await garantirVinculosCadastros();
    const lojaId = lojaCadastroAtual(body.lojaId);
    const dados = dadosFornecedor(body);
    if (String(dados.razao_social || '').trim().length < 2)
        throw new Error('Informe a razão social ou nome do fornecedor.');
    let existente = dados.cpf_cnpj ? await get('SELECT id FROM fornecedores WHERE cpf_cnpj=?', [dados.cpf_cnpj]) : undefined;
    let id: number;
    if (existente)
        id = Number(existente.id);
    else {
        const cols = Object.keys(dados);
        id = (await run(`INSERT INTO fornecedores (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, Object.values(dados))).lastID;
    }
    await vincularCadastroNaLoja('fornecedor', id, lojaId);
    await run('UPDATE fornecedores_lojas SET dados_json=?,ativo=? WHERE fornecedor_id=? AND loja_id=?', [JSON.stringify(dados), body.ativo === false || body.ativo === 0 ? 0 : 1, id, lojaId]);
    return buscarFornecedorPorId(id);
}
async function atualizarFornecedorImpl(id: number, body: FornecedorPayload) {
    await validarFornecedor(id);
    const lojaId = lojaCadastroAtual(body.lojaId);
    await exigirCadastroNaLoja('fornecedor', id, lojaId);
    const atual = await get('SELECT cpf_cnpj FROM fornecedores WHERE id=?', [id]);
    const dados = dadosFornecedor(body);
    if (dados.razao_social !== undefined && String(dados.razao_social || '').trim().length < 2)
        throw new Error('Informe a razão social ou nome do fornecedor.');
    if (dados.cpf_cnpj !== undefined && dados.cpf_cnpj !== atual?.cpf_cnpj) {
        const vinculos = await get('SELECT COUNT(*) AS total FROM fornecedores_lojas WHERE fornecedor_id=?', [id]);
        if (vinculos.total > 1)
            throw new Error('Informe o mesmo CPF/CNPJ do cadastro compartilhado entre mercados.');
        if (await get('SELECT id FROM fornecedores WHERE cpf_cnpj=? AND id<>?', [dados.cpf_cnpj, id]))
            throw new Error('Já existe outro fornecedor com este CPF/CNPJ.');
        await run('UPDATE fornecedores SET cpf_cnpj=? WHERE id=?', [dados.cpf_cnpj, id]);
    }
    const vinculo = await get('SELECT dados_json,ativo FROM fornecedores_lojas WHERE fornecedor_id=? AND loja_id=?', [id, lojaId]);
    let anterior = {};
    try {
        anterior = JSON.parse(vinculo.dados_json || '{}');
    }
    catch { }
    await run('UPDATE fornecedores_lojas SET dados_json=?,ativo=? WHERE fornecedor_id=? AND loja_id=?', [JSON.stringify({ ...anterior, ...dados }), body.ativo === undefined ? vinculo.ativo : body.ativo ? 1 : 0, id, lojaId]);
    return buscarFornecedorPorId(id);
}
async function desativarFornecedorImpl(id: number) { await validarFornecedor(id); await run('UPDATE fornecedores_lojas SET ativo=0 WHERE fornecedor_id=? AND loja_id=?', [id, lojaCadastroAtual()]); return { sucesso: true, id }; }
async function reativarFornecedorImpl(id: number) { await validarFornecedor(id); await run('UPDATE fornecedores_lojas SET ativo=1 WHERE fornecedor_id=? AND loja_id=?', [id, lojaCadastroAtual()]); return { sucesso: true, id }; }
export async function listarProdutosFornecedor(id: number) {
    await validarFornecedor(id);
    return all(`SELECT fp.*,p.ean,p.nome AS produto,p.marca,p.categoria FROM fornecedor_produtos_lojas fp JOIN produtos p ON p.id=fp.produto_id WHERE fp.fornecedor_id=? AND ${escopoLojaSql('fp.loja_id')} ORDER BY p.nome COLLATE NOCASE`, [id]);
}
export async function listarFornecedoresProduto(id: number) {
    await garantirVinculosCadastros();
    return all(`SELECT fp.*,f.nome_fantasia,f.razao_social,f.cpf_cnpj FROM fornecedor_produtos_lojas fp JOIN fornecedores f ON f.id=fp.fornecedor_id WHERE fp.produto_id=? AND ${escopoLojaSql('fp.loja_id')} ORDER BY fp.ultimo_custo`, [id]);
}
async function vincularProdutoFornecedorImpl(fornecedorId: number, produtoId: number, codigoProdutoFornecedor?: string, lojaExplicita?: number) {
    await garantirVinculosCadastros();
    const loja = lojaCadastroAtual(lojaExplicita);
    await exigirCadastroNaLoja('fornecedor', fornecedorId, loja);
    await validarProduto(produtoId, loja);
    await run(`INSERT INTO fornecedor_produtos_lojas(fornecedor_id,produto_id,loja_id,codigo_produto_fornecedor) VALUES(?,?,?,?) ON CONFLICT(fornecedor_id,produto_id,loja_id) DO UPDATE SET codigo_produto_fornecedor=excluded.codigo_produto_fornecedor,atualizado_em=CURRENT_TIMESTAMP`, [fornecedorId, produtoId, loja, texto(codigoProdutoFornecedor)]);
    return get('SELECT * FROM fornecedor_produtos_lojas WHERE fornecedor_id=? AND produto_id=? AND loja_id=?', [fornecedorId, produtoId, loja]);
}
async function registrarPrecoFornecedorImpl(dados: VinculoFornecedorProdutoPayload) {
    await garantirVinculosCadastros();
    const loja = lojaCadastroAtual(dados.lojaId);
    await exigirCadastroNaLoja('fornecedor', dados.fornecedorId, loja);
    await validarProduto(dados.produtoId, loja);
    const custo = numero(dados.custoUnitario), qtd = numero(dados.quantidade);
    if (custo <= 0)
        throw new Error('O custo unitário deve ser maior que zero.');
    if (qtd < 0)
        throw new Error('A quantidade não pode ser negativa.');
    const atual = await get('SELECT * FROM fornecedor_produtos_lojas WHERE fornecedor_id=? AND produto_id=? AND loja_id=?', [dados.fornecedorId, dados.produtoId, loja]);
    const qtdAnterior = numero(atual?.quantidade_comprada), quantidade = qtdAnterior + qtd;
    const medio = quantidade > 0 ? (qtdAnterior * numero(atual?.custo_medio) + qtd * custo) / quantidade : custo;
    const minimo = numero(atual?.menor_custo) > 0 ? Math.min(custo, numero(atual.menor_custo)) : custo;
    await run(`INSERT INTO fornecedor_produtos_lojas(fornecedor_id,produto_id,loja_id,codigo_produto_fornecedor,ultimo_custo,menor_custo,maior_custo,custo_medio,quantidade_comprada,ultima_compra_em)
    VALUES(?,?,?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP)) ON CONFLICT(fornecedor_id,produto_id,loja_id) DO UPDATE SET codigo_produto_fornecedor=COALESCE(excluded.codigo_produto_fornecedor,fornecedor_produtos_lojas.codigo_produto_fornecedor),ultimo_custo=excluded.ultimo_custo,menor_custo=excluded.menor_custo,maior_custo=excluded.maior_custo,custo_medio=excluded.custo_medio,quantidade_comprada=excluded.quantidade_comprada,ultima_compra_em=excluded.ultima_compra_em,atualizado_em=CURRENT_TIMESTAMP`, [dados.fornecedorId, dados.produtoId, loja, texto(dados.codigoProdutoFornecedor), custo, minimo, Math.max(custo, numero(atual?.maior_custo)), medio, quantidade, texto(dados.dataCompra)]);
    const historico = await run(`INSERT INTO fornecedor_precos_historico(fornecedor_id,produto_id,loja_id,custo_unitario,quantidade,numero_nota,chave_nfe,data_compra,observacao) VALUES(?,?,?,?,?,?,?,COALESCE(?,CURRENT_TIMESTAMP),?)`, [dados.fornecedorId, dados.produtoId, loja, custo, qtd, texto(dados.numeroNota), texto(dados.chaveNfe), texto(dados.dataCompra), texto(dados.observacao)]);
    return { sucesso: true, historicoId: historico.lastID, fornecedorProduto: await get('SELECT * FROM fornecedor_produtos_lojas WHERE fornecedor_id=? AND produto_id=? AND loja_id=?', [dados.fornecedorId, dados.produtoId, loja]) };
}
async function historico(filtro: string, id: number, limite: number) { await garantirVinculosCadastros(); return all(`SELECT h.*,f.nome_fantasia,f.razao_social,f.cpf_cnpj,p.nome AS produto,p.ean,p.marca FROM fornecedor_precos_historico h JOIN fornecedores f ON f.id=h.fornecedor_id JOIN produtos p ON p.id=h.produto_id WHERE ${filtro}=? AND ${escopoLojaSql('h.loja_id')} ORDER BY h.data_compra DESC,h.id DESC LIMIT ?`, [id, Math.max(1, Math.min(Number(limite) || 200, 1000))]); }
export async function historicoPrecosFornecedor(id: number, limite = 200) { await validarFornecedor(id); return historico('h.fornecedor_id', id, limite); }
export async function historicoPrecosProduto(id: number, limite = 200) { return historico('h.produto_id', id, limite); }
export async function compararPrecosProduto(id: number) { const rows = await listarFornecedoresProduto(id); return rows.map(r => ({ ...r, fornecedor: r.nome_fantasia || r.razao_social, ordem_preco: numero(r.ultimo_custo) > 0 ? r.ultimo_custo : 999999999 })); }
export async function resumoFornecedores() { const rows = await listarFornecedores(); const produtos = await get(`SELECT COUNT(*) AS total FROM fornecedor_produtos_lojas fp WHERE ${escopoLojaSql('fp.loja_id')}`); const compras = await get(`SELECT COUNT(*) AS total FROM fornecedor_precos_historico h WHERE ${escopoLojaSql('h.loja_id')}`); return { totalFornecedores: rows.length, ativos: rows.filter(r => Number(r.ativo) === 1).length, inativos: rows.filter(r => Number(r.ativo) !== 1).length, produtosVinculados: Number(produtos?.total || 0), comprasRegistradas: Number(compras?.total || 0) }; }
export function criarFornecedor(...args: Parameters<typeof criarFornecedorImpl>) { return comBloqueioBanco(() => criarFornecedorImpl(...args)); }
export function atualizarFornecedor(...args: Parameters<typeof atualizarFornecedorImpl>) { return comBloqueioBanco(() => atualizarFornecedorImpl(...args)); }
export function desativarFornecedor(...args: Parameters<typeof desativarFornecedorImpl>) { return comBloqueioBanco(() => desativarFornecedorImpl(...args)); }
export function reativarFornecedor(...args: Parameters<typeof reativarFornecedorImpl>) { return comBloqueioBanco(() => reativarFornecedorImpl(...args)); }
export function vincularProdutoFornecedor(...args: Parameters<typeof vincularProdutoFornecedorImpl>) { return comBloqueioBanco(() => vincularProdutoFornecedorImpl(...args)); }
export function registrarPrecoFornecedor(...args: Parameters<typeof registrarPrecoFornecedorImpl>) { return comBloqueioBanco(() => registrarPrecoFornecedorImpl(...args)); }
