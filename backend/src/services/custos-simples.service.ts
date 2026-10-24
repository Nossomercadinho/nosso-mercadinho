import {calcularCustoSimples,decimal} from '../domain/custo-real';
import {ErroCatalogo,garantirPrecosCatalogoLoja} from './catalogo-lojas.service';
import {prepararCustoReal} from './compras-schema.service';
import {transacaoCaixa} from './caixas.service';
import {consultarCadastro as get,executarCadastro as run} from './cadastros-lojas.service';
import type {UsuarioAcesso} from './acessos.service';

export async function salvarCustosSimples(body:any,usuario:UsuarioAcesso,lojaId:number){
  if(!usuario.permissoes.includes('produtos'))throw new ErroCatalogo('Seu papel não permite alterar custos de produtos.',403);
  if(body?.confirmado!==true)throw new ErroCatalogo('Use Salvar custos para confirmar os valores informados.');
  if(!Array.isArray(body.itens)||!body.itens.length||body.itens.length>100)throw new ErroCatalogo('Informe de 1 a 100 produtos por salvamento.');
  const ids=new Set<number>();
  const itens=body.itens.map((i:any)=>{
    const id=Number(i?.produtoId);
    if(!Number.isSafeInteger(id)||id<=0||ids.has(id))throw new ErroCatalogo('Produto inválido ou repetido na tabela.');
    ids.add(id);
    if(i.custoAnteriorEsperado===undefined||i.custoAnteriorEsperado===null)throw new ErroCatalogo('Atualize a lista antes de salvar os custos.');
    return {produtoId:id,...calcularCustoSimples(i.valorTotal,i.quantidade),esperado:decimal(i.custoAnteriorEsperado,'custo anterior')};
  });
  await garantirPrecosCatalogoLoja();await prepararCustoReal();
  return transacaoCaixa(async()=>{
    const conferidos=[];
    for(const i of itens){
      const p=await get<any>(`SELECT p.nome,p.unidade_medida,CAST(COALESCE(pl.preco_custo,p.preco_custo,0) AS TEXT) AS custo
        FROM produtos p JOIN produtos_lojas pl ON pl.produto_id=p.id JOIN lojas l ON l.id=pl.loja_id
        WHERE p.id=? AND p.ativo=1 AND pl.loja_id=? AND pl.ativo=1 AND l.ativo=1`,[i.produtoId,lojaId]);
      if(!p)throw new ErroCatalogo('Um dos produtos não está ativo no catálogo desta unidade. Atualize a lista.',404);
      if(!decimal(p.custo).eq(i.esperado))throw new ErroCatalogo(`O custo de ${p.nome} mudou. Atualize a lista e confira antes de salvar.`,409);
      conferidos.push({...i,nome:p.nome,unidade:p.unidade_medida||'UN',anterior:p.custo,alterado:!decimal(p.custo).eq(i.custoUnitario)});
    }
    for(const i of conferidos){
      if(!i.alterado)continue;
      await run('UPDATE produtos_lojas SET preco_custo=?,atualizado_em=CURRENT_TIMESTAMP WHERE produto_id=? AND loja_id=?',[i.custoUnitario,i.produtoId,lojaId]);
      await run(`INSERT INTO compras_custos_historico(loja_id,produto_id,usuario_id,origem,custo_anterior,custo_novo,quantidade,componentes_json,justificativa)
        VALUES(?,?,?,'TABELA_SIMPLES',?,?,?,?,?)`,[lojaId,i.produtoId,usuario.id,i.anterior,i.custoUnitario,i.quantidade,JSON.stringify({valorTotal:i.valorTotal,quantidade:i.quantidade,unidade:i.unidade,formula:'valorTotal / quantidade'}),'Custo informado manualmente na tabela: valor total dividido pela quantidade.']);
    }
    return {lojaId,atualizados:conferidos.filter(i=>i.alterado).length,itens:conferidos.map(i=>({produtoId:i.produtoId,custoUnitario:i.custoUnitario,alterado:i.alterado})),estoqueAlterado:false,precoVendaAlterado:false};
  });
}
