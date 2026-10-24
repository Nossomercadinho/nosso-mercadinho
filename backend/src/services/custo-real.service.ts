import crypto from 'node:crypto';
import { calcularCustoReal, compararCusto, decimal, ErroCusto } from '../domain/custo-real';
import type { ConferenciaCusto } from '../domain/custo-real';
import { lerTextoConferencia, lerXmlConferencia, validarChaveNfe } from '../domain/ler-nota';
import { executarCadastro as run, consultarCadastro as get, listarCadastro as all, exigirCadastroNaLoja, garantirVinculosCadastros } from './cadastros-lojas.service';
import { prepararCustoReal } from './compras-schema.service';
import { transacaoCaixa } from './caixas.service';
import { criarFornecedor, buscarBeneficiarioPorNome } from './fornecedores.service';
import { criarProdutoNaLoja, garantirPrecosCatalogoLoja, ErroCatalogo } from './catalogo-lojas.service';
import type { UsuarioAcesso } from './acessos.service';

const data=()=>new Date().toISOString();
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const normalizar=(s:unknown)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const LIMITE_DOCUMENTOS=2621440;
async function preparar(){await garantirVinculosCadastros();await garantirPrecosCatalogoLoja();await prepararCustoReal();}
function erro(mensagem:string,status=400):never{throw new ErroCatalogo(mensagem,status);}

export async function conferirCustos(estado:ConferenciaCusto,lojaId:number){
  await preparar();
  if(!estado||!Array.isArray(estado.itens)||!estado.itens.length||estado.itens.length>200)erro('Inclua de 1 a 200 produtos na nota.');
  const dados=clone(estado);
  if(!['XML','PDF','FOTO','MANUAL'].includes(dados.origem)||typeof dados.fornecedorNome!=='string'||dados.itens.some(i=>!i||typeof i.descricao!=='string'))erro('Confira os dados da conferência.');
  if(dados.chave)dados.chave=validarChaveNfe(dados.chave);
  let fornecedor:any;
  if(dados.fornecedorId){await exigirCadastroNaLoja('fornecedor',Number(dados.fornecedorId),lojaId);fornecedor=await get('SELECT id FROM fornecedores WHERE id=?',[dados.fornecedorId]);}
  else if(dados.fornecedorCnpj){fornecedor=await get('SELECT f.id FROM fornecedores f JOIN fornecedores_lojas fl ON fl.fornecedor_id=f.id WHERE fl.loja_id=? AND f.cpf_cnpj=?',[lojaId,String(dados.fornecedorCnpj).replace(/\D/g,'')]);if(fornecedor)dados.fornecedorId=fornecedor.id;}
  const catalogo=await all<any>(`SELECT p.id,p.ean,p.nome,p.marca,CAST(COALESCE(pl.preco_custo,p.preco_custo,0) AS TEXT) AS custo,
    CAST(CASE WHEN pl.precos_personalizados=1 OR pl.preco_venda<>0 THEN pl.preco_venda ELSE p.preco_venda END AS TEXT) AS venda
    FROM produtos p JOIN produtos_lojas pl ON pl.produto_id=p.id WHERE pl.loja_id=? AND pl.ativo=1 AND p.ativo=1`,[lojaId]);
  const correspondencias:any[]=[];
  for(const item of dados.itens){
    let produto:any,criterio='';
    if(item.produtoId){produto=await get('SELECT id,ean,nome FROM produtos WHERE id=? AND ativo=1',[item.produtoId]);if(!produto)erro('Produto selecionado não existe ou está inativo.');criterio='SELECIONADO';}
    else if(item.ean){produto=await get('SELECT id,ean,nome FROM produtos WHERE ean=? AND ativo=1',[item.ean]);if(produto){item.produtoId=produto.id;criterio='EAN';}}
    if(!produto && fornecedor && item.codigoFornecedor){
      const encontrados=await all<any>(`SELECT p.id,p.ean,p.nome FROM produtos p JOIN fornecedor_produtos_lojas fp ON fp.produto_id=p.id
        WHERE fp.fornecedor_id=? AND fp.loja_id=? AND fp.codigo_produto_fornecedor=? AND p.ativo=1`,[fornecedor.id,lojaId,item.codigoFornecedor]);
      if(encontrados.length===1){produto=encontrados[0];item.produtoId=produto.id;criterio='CODIGO_FORNECEDOR';}
    }
    if(produto && item.ean && produto.ean!==item.ean)erro('O EAN informado não corresponde ao produto selecionado.');
    if(produto && !item.ean)item.ean=produto.ean;
    if(produto && fornecedor && (item.unidadesEmbalagem===null||item.unidadesEmbalagem==='')){
      const embalagem=await get('SELECT CAST(unidades_embalagem AS TEXT) AS fator FROM compras_embalagens WHERE loja_id=? AND fornecedor_id=? AND produto_id=?',[lojaId,fornecedor.id,produto.id]);
      if(embalagem)item.unidadesEmbalagem=embalagem.fator;
    }
    const tokens=normalizar(item.descricao).split(' ').filter(Boolean);
    const sugestoes=produto?[]:catalogo.map(p=>{const words=normalizar(`${p.nome} ${p.marca}`).split(' ');const score=tokens.filter(t=>words.includes(t)).length/Math.max(tokens.length,1);return {id:p.id,nome:p.nome,ean:p.ean,marca:p.marca,score};}).filter(p=>p.score>=0.35).sort((a,b)=>b.score-a.score).slice(0,5);
    correspondencias.push({itemId:item.id,produtoId:produto?.id||null,nome:produto?.nome||null,criterio,sugestoes});
  }
  let calculo:ReturnType<typeof calcularCustoReal>|null=null,erroCalculo='';
  try{calculo=calcularCustoReal(dados);}catch(e){if(!(e instanceof ErroCusto))throw e;erroCalculo=e.message;}
  const comparacoes=calculo?.itens.map((i,k)=>{const atual=catalogo.find(p=>Number(p.id)===Number(dados.itens[k].produtoId));return {itemId:i.id,...compararCusto(atual?.custo||'0',i.custoUnitario||'0',atual?.venda||'0')};});
  return {estado:dados,calculo,erroCalculo,correspondencias,comparacoes:comparacoes||[]};
}

export async function lerDocumento(body:any,lojaId:number){
  const estado=body?.xml?lerXmlConferencia(body.xml):lerTextoConferencia(String(body?.texto||''),body?.origem==='PDF'?'PDF':'FOTO');
  return conferirCustos(estado,lojaId);
}

export function documentosValidados(documentos:any[]){
  if(!Array.isArray(documentos)||!documentos.length||documentos.length>12)erro('Anexe de 1 a 12 documentos.');
  let total=0;
  return documentos.map(doc=>{
    if(!['image/jpeg','image/png','image/webp','application/pdf','application/xml','text/xml'].includes(doc.mime)||typeof doc.base64!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(doc.base64))erro('Formato de documento não suportado.');
    const bytes=Buffer.from(doc.base64,'base64');total+=bytes.length;
    if(!bytes.length||total>LIMITE_DOCUMENTOS||bytes.toString('base64')!==doc.base64)erro('Os documentos devem somar até 2,5 MB. Recorte ou reduza as fotos.');
    const magic=bytes.subarray(0,12);
    if(doc.mime==='application/pdf'&&!magic.toString().startsWith('%PDF-'))erro('PDF inválido.');
    if(doc.mime==='image/png'&&!magic.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))erro('PNG inválido.');
    if(doc.mime==='image/jpeg'&&!(magic[0]===255&&magic[1]===216))erro('JPEG inválido.');
    if(doc.mime==='image/webp'&&!(magic.toString().startsWith('RIFF')&&magic.subarray(8,12).toString()==='WEBP'))erro('WebP inválido.');
    if(doc.mime.includes('xml'))lerXmlConferencia(bytes.toString('utf8'));
    return {nome:String(doc.nome||'documento').replace(/[\r\n/\\]/g,'_').slice(0,180),mime:String(doc.mime),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),base64:doc.base64};
  });
}

async function buscarRascunho(id:number,lojaId:number){
  const row=await get<any>('SELECT * FROM compras_conferencias WHERE id=? AND loja_id=?',[id,lojaId]);
  if(!row)erro('Conferência não encontrada neste mercado.',404);return row;
}
export async function listarConferencias(lojaId:number){await preparar();return all('SELECT id,origem,status,versao,nota_entrada_id,criado_em,atualizado_em FROM compras_conferencias WHERE loja_id=? ORDER BY id DESC LIMIT 100',[lojaId]);}
export async function abrirConferencia(id:number,lojaId:number){await preparar();const row=await buscarRascunho(id,lojaId);const documentos=await all('SELECT id,nome,mime,sha256 FROM compras_documentos WHERE conferencia_id=?',[id]);return {id:row.id,status:row.status,versao:row.versao,notaId:row.nota_entrada_id,documentos,...await conferirCustos(JSON.parse(row.estado_json),lojaId)};}
export async function baixarDocumento(id:number,lojaId:number){await preparar();const row=await get<any>('SELECT d.nome,d.mime,d.conteudo_base64 FROM compras_documentos d JOIN compras_conferencias c ON c.id=d.conferencia_id WHERE d.id=? AND c.loja_id=?',[id,lojaId]);if(!row)erro('Documento não encontrado.',404);return {nome:row.nome,mime:row.mime,bytes:Buffer.from(row.conteudo_base64,'base64')};}

export async function salvarConferencia(body:any,usuario:UsuarioAcesso,lojaId:number){
  const conferencia=await conferirCustos(body.estado,lojaId);
  const docs=body.id?[]:documentosValidados(body.documentos);
  const justificativa=String(body.justificativa||'').trim();
  return transacaoCaixa(async()=>{
    let id=Number(body.id),versao=1;
    const now=data();
    if(id){
      const atual=await buscarRascunho(id,lojaId);
      if(atual.status!=='RASCUNHO')erro('Esta entrada já foi confirmada. Não pode ser regravada.',409);
      if(Number(body.versao)!==Number(atual.versao))erro('A conferência mudou. Recarregue antes de salvar.',409);
      if(JSON.stringify(conferencia.estado)!==atual.estado_json && justificativa.length<5)erro('Justifique as correções de impostos, valores, produtos ou embalagens.');
      const original=JSON.parse(atual.original_json);
      if(original.origem==='XML'&&original.chave!==conferencia.estado.chave)erro('A chave do XML original não pode ser substituída. Importe o documento correto.');
      const identificador=conferencia.estado.chave?`NFE:${validarChaveNfe(conferencia.estado.chave)}`:atual.identificador;
      if(identificador!==atual.identificador&&await get('SELECT id FROM compras_conferencias WHERE identificador=? AND id<>?',[identificador,id]))erro('Esta chave já está em outra conferência.',409);
      versao=Number(atual.versao)+1;
      await run('UPDATE compras_conferencias SET estado_json=?,versao=?,local_estoque_id=?,atualizado_em=?,identificador=? WHERE id=?',[JSON.stringify(conferencia.estado),versao,conferencia.estado.localEstoqueId||null,now,identificador,id]);
      await run(`INSERT INTO compras_custos_historico(loja_id,conferencia_id,usuario_id,origem,componentes_json,justificativa) VALUES(?,?,?,'REVISAO',?,?)`,[lojaId,id,usuario.id,JSON.stringify({antes:JSON.parse(atual.estado_json),depois:conferencia.estado}),justificativa]);
    }else{
      const identificador=conferencia.estado.chave?`NFE:${validarChaveNfe(conferencia.estado.chave)}`:`DOC:${crypto.createHash('sha256').update(docs.map(d=>d.sha256).sort().join(':')).digest('hex')}`;
      const existente=await get<any>('SELECT id,loja_id FROM compras_conferencias WHERE identificador=?',[identificador]);
      if(existente){if(Number(existente.loja_id)!==lojaId)erro('Este documento já está registrado.',409);return abrirConferencia(existente.id,lojaId);}
      if(conferencia.estado.chave && await get('SELECT id FROM notas_entrada WHERE chave_nfe=?',[conferencia.estado.chave]))erro('A NF-e já está no histórico de entradas.',409);
      id=(await run(`INSERT INTO compras_conferencias(loja_id,local_estoque_id,usuario_criacao_id,identificador,origem,estado_json,original_json,atualizado_em) VALUES(?,?,?,?,?,?,?,?)`,[lojaId,conferencia.estado.localEstoqueId||null,usuario.id,identificador,conferencia.estado.origem,JSON.stringify(conferencia.estado),JSON.stringify(conferencia.estado),now])).lastID;
      for(const doc of docs)await run('INSERT INTO compras_documentos(conferencia_id,nome,mime,sha256,conteudo_base64) VALUES(?,?,?,?,?)',[id,doc.nome,doc.mime,doc.sha256,doc.base64]);
    }
    return {id,versao,status:'RASCUNHO',...conferencia};
  });
}

export async function confirmarConferencia(id:number,body:any,usuario:UsuarioAcesso,lojaId:number){
  await preparar();
  if(body.confirmado!==true)erro('Confirme expressamente a entrada e a movimentação de estoque.');
  return transacaoCaixa(async()=>{
    const r=await buscarRascunho(id,lojaId);
    if(r.status==='CONFIRMADA')return {notaId:r.nota_entrada_id,jaConfirmada:true};
    if(Number(body.versao)!==Number(r.versao))erro('Conferência alterada. Abra a versão atual.',409);
    const revisao=await conferirCustos(JSON.parse(r.estado_json),lojaId),d=revisao.estado,calc=revisao.calculo;
    if(!calc)erro(revisao.erroCalculo||'Confira os valores antes de confirmar.');
    if(!calc.podeConfirmar)erro(calc.alerta||'Confirme os itens e os fatores de embalagem antes de dar entrada.');
    const localId=Number(d.localEstoqueId);
    const loja=await get<any>('SELECT empresa_id FROM lojas WHERE id=? AND ativo=1',[lojaId]);
    if(!loja||!await get('SELECT id FROM locais_estoque WHERE id=? AND loja_id=? AND ativo=1',[localId,lojaId]))erro('Selecione um local ativo deste mercado.');
    if(!d.numero?.trim()&&!d.chave)erro('Informe o número da nota ou a chave para prevenir duplicação.');
    let fornecedorId=Number(d.fornecedorId)||0;
    if(fornecedorId){await exigirCadastroNaLoja('fornecedor',fornecedorId,lojaId);if(!await get('SELECT fornecedor_id FROM fornecedores_lojas WHERE fornecedor_id=? AND loja_id=? AND ativo=1',[fornecedorId,lojaId]))erro('Fornecedor inativo.');}
    else{
      if(d.fornecedorNome.trim().length<2)erro('Informe o fornecedor.');
      const f=d.fornecedorCnpj?null:await buscarBeneficiarioPorNome(d.fornecedorNome,lojaId);
      fornecedorId=Number((f||await criarFornecedor({razaoSocial:d.fornecedorNome,cpfCnpj:d.fornecedorCnpj,lojaId,empresaId:loja.empresa_id||1})).id);
    }
    const chave=d.chave?validarChaveNfe(d.chave):`CONFERENCIA:${id}`;
    if(await get('SELECT id FROM notas_entrada WHERE chave_nfe=?',[chave]))erro('Esta NF-e já foi importada.',409);
    if(d.numero && await get("SELECT id FROM notas_entrada WHERE fornecedor_id=? AND numero_nota=? AND COALESCE(serie,'')=? AND status<>'CANCELADA'",[fornecedorId,d.numero,d.serie||'']))erro('Já existe entrada deste fornecedor com o mesmo número e série.',409);
    const vistos=new Set<number>();
    const notaId=(await run(`INSERT INTO notas_entrada(empresa_id,fornecedor_id,loja_id,local_estoque_id,chave_nfe,numero_nota,serie,modelo,data_emissao,valor_produtos,valor_desconto,valor_frete,valor_seguro,valor_outros,valor_ipi,valor_icms_st,valor_total,quantidade_itens,status,usuario_importacao_id,usuario_efetivacao_id,efetivado_em,observacao)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'EFETIVADA',?,?,?,?)`,[loja.empresa_id||1,fornecedorId,lojaId,localId,chave,d.numero||'',d.serie||'',d.origem==='XML'?'55':d.origem,d.dataEmissao||null,calc.totais.valorProdutos,calc.totais.desconto,calc.totais.frete,calc.totais.seguro,decimal(calc.totais.despesas).plus(calc.totais.outros).plus(calc.totais.fcpSt).toFixed(2),calc.totais.ipi,calc.totais.icmsSt,calc.totais.calculado,d.itens.length,usuario.id,usuario.id,data(),`Entrada conferida com custo real. Documentos privados na conferência ${id}. Simples Nacional; sem créditos presumidos.`])).lastID;
    for(let k=0;k<d.itens.length;k++){
      const item=d.itens[k],c=calc.itens[k];let produtoId=Number(item.produtoId)||0;
      if(!produtoId){
        if(!usuario.permissoes.includes('produtos'))erro('Seu papel não pode criar produtos novos.',403);
        if(!/^\d{8}$|^\d{12,14}$/.test(item.ean||''))erro('Selecione um produto existente ou informe o EAN do novo produto.');
        const existente=await get<any>('SELECT id,ativo FROM produtos WHERE ean=?',[item.ean]);
        if(existente){if(existente.ativo!==1)erro('Produto inativo: revise o cadastro.');produtoId=Number(existente.id);}
        else produtoId=(await criarProdutoNaLoja(lojaId,{ean:item.ean,nome:item.descricao,precoVenda:0,precoCusto:0,estoqueInicial:0,unidadeMedida:'UN',marca:item.marca||''})).id;
      }
      if(vistos.has(produtoId))erro('O mesmo produto está em mais de uma linha. Agrupe os itens para confirmar.');vistos.add(produtoId);
      await run(`INSERT INTO produtos_lojas(produto_id,loja_id,preco_venda,estoque_minimo,preco_custo,precos_personalizados,ativo)
        SELECT id,?,preco_venda,estoque_minimo,0,0,1 FROM produtos WHERE id=? AND ativo=1
        ON CONFLICT(produto_id,loja_id) DO NOTHING`,[lojaId,produtoId]);
      const anterior=await get<any>('SELECT CAST(preco_custo AS TEXT) AS custo FROM produtos_lojas WHERE produto_id=? AND loja_id=? AND ativo=1',[produtoId,lojaId]);
      if(!anterior)erro('Produto desativado neste mercado.');
      const saldo=await get<any>('SELECT CAST(quantidade AS TEXT) AS quantidade,CAST(custo_medio AS TEXT) AS custo FROM estoque_saldos WHERE produto_id=? AND loja_id=? AND local_id=?',[produtoId,lojaId,localId]);
      const quantidade=decimal(saldo?.quantidade||'0','saldo',true).plus(c.quantidadeUnidades!);
      const medio=quantidade.gt(0)?decimal(saldo?.quantidade||'0','saldo',true).times(decimal(saldo?.custo||'0')).plus(c.custoTotal).div(quantidade):decimal(c.custoUnitario!);
      await run(`INSERT INTO estoque_saldos(produto_id,loja_id,local_id,quantidade,custo_medio) VALUES(?,?,?,?,?)
        ON CONFLICT(produto_id,loja_id,local_id) DO UPDATE SET quantidade=excluded.quantidade,custo_medio=excluded.custo_medio,atualizado_em=CURRENT_TIMESTAMP`,[produtoId,lojaId,localId,quantidade.toString(),medio.toFixed(10)]);
      await run('UPDATE produtos_lojas SET preco_custo=?,atualizado_em=CURRENT_TIMESTAMP WHERE produto_id=? AND loja_id=?',[c.custoUnitario,produtoId,lojaId]);
      await run(`INSERT INTO notas_entrada_itens(nota_entrada_id,fornecedor_id,produto_id,numero_item,codigo_fornecedor,ean,descricao,unidade,quantidade,valor_unitario,valor_total,status_vinculo,observacao)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'VINCULADO',?)`,[notaId,fornecedorId,produtoId,k+1,item.codigoFornecedor||'',item.ean||'',item.descricao,'UN',c.quantidadeUnidades,c.custoUnitario,c.custoTotal,JSON.stringify({quantidadeCompra:item.quantidadeCompra,unidadesEmbalagem:item.unidadesEmbalagem,componentes:c.componentes,icmsProprioInformativo:item.icmsProprio})]);
      await run(`INSERT INTO movimentacoes_estoque(produto_id,tipo,quantidade,custo_unitario,loja_destino_id,local_destino_id,usuario_id,referencia,observacao) VALUES(?,'ENTRADA',?,?,?,?,?,?,?)`,[produtoId,c.quantidadeUnidades,c.custoUnitario,lojaId,localId,usuario.id,`Compra conferida ${notaId}`,`Conferência de custo real ${id}. Sem alteração de preço de venda.`]);
      await run('INSERT INTO fornecedor_precos_historico(fornecedor_id,produto_id,loja_id,custo_unitario,quantidade,numero_nota,chave_nfe,observacao) VALUES(?,?,?,?,?,?,?,?)',[fornecedorId,produtoId,lojaId,c.custoUnitario,c.quantidadeUnidades,d.numero||'',chave,`Custo real; conferência ${id}`]);
      await run(`INSERT INTO fornecedor_produtos_lojas(fornecedor_id,produto_id,loja_id,codigo_produto_fornecedor,ultimo_custo,menor_custo,maior_custo,custo_medio,quantidade_comprada,ultima_compra_em)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fornecedor_id,produto_id,loja_id) DO UPDATE SET codigo_produto_fornecedor=COALESCE(excluded.codigo_produto_fornecedor,fornecedor_produtos_lojas.codigo_produto_fornecedor),ultimo_custo=excluded.ultimo_custo,menor_custo=CASE WHEN fornecedor_produtos_lojas.menor_custo<excluded.menor_custo THEN fornecedor_produtos_lojas.menor_custo ELSE excluded.menor_custo END,maior_custo=CASE WHEN fornecedor_produtos_lojas.maior_custo>excluded.maior_custo THEN fornecedor_produtos_lojas.maior_custo ELSE excluded.maior_custo END,custo_medio=CASE WHEN COALESCE(fornecedor_produtos_lojas.quantidade_comprada,0)+excluded.quantidade_comprada>0 THEN (COALESCE(fornecedor_produtos_lojas.custo_medio,0)*COALESCE(fornecedor_produtos_lojas.quantidade_comprada,0)+excluded.custo_medio*excluded.quantidade_comprada)/(COALESCE(fornecedor_produtos_lojas.quantidade_comprada,0)+excluded.quantidade_comprada) ELSE excluded.custo_medio END,quantidade_comprada=COALESCE(fornecedor_produtos_lojas.quantidade_comprada,0)+excluded.quantidade_comprada,ultima_compra_em=excluded.ultima_compra_em,atualizado_em=CURRENT_TIMESTAMP`,[fornecedorId,produtoId,lojaId,item.codigoFornecedor||null,c.custoUnitario,c.custoUnitario,c.custoUnitario,c.custoUnitario,c.quantidadeUnidades,data()]);
      if(item.salvarEmbalagem)await run(`INSERT INTO compras_embalagens(loja_id,fornecedor_id,produto_id,codigo_fornecedor,unidades_embalagem,atualizado_em) VALUES(?,?,?,?,?,?)
        ON CONFLICT(loja_id,fornecedor_id,produto_id) DO UPDATE SET codigo_fornecedor=excluded.codigo_fornecedor,unidades_embalagem=excluded.unidades_embalagem,atualizado_em=excluded.atualizado_em`,[lojaId,fornecedorId,produtoId,item.codigoFornecedor||null,item.unidadesEmbalagem,data()]);
      await run(`INSERT INTO compras_custos_historico(loja_id,produto_id,fornecedor_id,conferencia_id,usuario_id,origem,custo_anterior,custo_novo,quantidade,componentes_json) VALUES(?,?,?,?,?,'ENTRADA',?,?,?,?)`,[lojaId,produtoId,fornecedorId,id,usuario.id,anterior.custo||'0',c.custoUnitario,c.quantidadeUnidades,JSON.stringify({item,calculo:c,notaId})]);
    }
    await run("UPDATE compras_conferencias SET status='CONFIRMADA',nota_entrada_id=?,usuario_confirmacao_id=?,confirmado_em=?,atualizado_em=? WHERE id=?",[notaId,usuario.id,data(),data(),id]);
    return {notaId,jaConfirmada:false};
  });
}

export async function salvarCustoManual(body:any,usuario:UsuarioAcesso,lojaId:number){
  await preparar();if(body.confirmado!==true)erro('Confirme a gravação do custo.');
  if(!usuario.permissoes.includes('produtos'))erro('Seu papel não permite atualizar o cadastro de produtos.',403);
  const justificativa=String(body.justificativa||'').trim();if(justificativa.length<5)erro('Informe a justificativa deste custo.');
  const calculo=calcularCustoReal(body.estado);
  if(calculo.itens.length!==1||!calculo.itens[0].custoUnitario)erro('Informe uma simulação com um produto e fator de embalagem.');
  const produtoId=Number(body.produtoId);
  return transacaoCaixa(async()=>{
    const atual=await get<any>('SELECT CAST(preco_custo AS TEXT) AS custo FROM produtos_lojas WHERE produto_id=? AND loja_id=? AND ativo=1',[produtoId,lojaId]);
    if(!atual)erro('Selecione um produto ativo desta loja.');
    if(body.custoAnteriorEsperado!=null&&!decimal(atual.custo||'0').eq(decimal(body.custoAnteriorEsperado)))erro('O custo mudou desde a consulta. Reabra o produto.',409);
    const novo=calculo.itens[0].custoUnitario;
    await run('UPDATE produtos_lojas SET preco_custo=?,atualizado_em=CURRENT_TIMESTAMP WHERE produto_id=? AND loja_id=?',[novo,produtoId,lojaId]);
    await run(`INSERT INTO compras_custos_historico(loja_id,produto_id,usuario_id,origem,custo_anterior,custo_novo,componentes_json,justificativa) VALUES(?,?,?,'CALCULADORA',?,?,?,?)`,[lojaId,produtoId,usuario.id,atual.custo||'0',novo,JSON.stringify({entrada:body.estado,calculo}),justificativa]);
    return {produtoId,custoUnitario:novo,estoqueAlterado:false,precoVendaAlterado:false};
  });
}
export async function historicoCustos(lojaId:number,produtoId?:number){await preparar();return all(`SELECT h.*,p.nome AS produto FROM compras_custos_historico h LEFT JOIN produtos p ON p.id=h.produto_id WHERE h.loja_id=?${produtoId?' AND h.produto_id=?':''} ORDER BY h.id DESC LIMIT 200`,produtoId?[lojaId,produtoId]:[lojaId]);}
export async function recuperarXml(chave:unknown){
  const key=validarChaveNfe(chave),base=process.env.NFE_INTEGRATION_URL,token=process.env.NFE_INTEGRATION_TOKEN;
  if(!base||!token)erro('Chave identificada. Recuperação automática indisponível: configure uma integração autorizada ou anexe o XML.',501);
  const url=new URL(base);if(url.protocol!=='https:')erro('A integração autorizada deve usar HTTPS.');
  url.searchParams.set('chave',key);
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/xml'},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)erro('A integração autorizada não disponibilizou este XML.',502);
  if(Number(response.headers.get('content-length')||0)>LIMITE_DOCUMENTOS)erro('XML da integração acima do limite.',502);
  const reader=response.body?.getReader();if(!reader)erro('A integração não retornou um documento.',502);
  const chunks:Uint8Array[]=[];let tamanho=0;
  try{while(true){const r=await reader.read();if(r.done)break;tamanho+=r.value.byteLength;if(tamanho>LIMITE_DOCUMENTOS){await reader.cancel();erro('XML da integração acima do limite.',502);}chunks.push(r.value);}}finally{reader.releaseLock();}
  const xml=Buffer.concat(chunks).toString('utf8');const d=lerXmlConferencia(xml);if(d.chave!==key)erro('A integração retornou uma nota diferente.',502);return xml;
}
