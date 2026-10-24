import { Router, Response, NextFunction } from 'express';
import { autorizarModulo, RequestAutenticada } from '../middleware/auth.middleware';
import { ErroCatalogo, lojaDoCatalogo } from '../services/catalogo-lojas.service';
import { ErroCusto } from '../domain/custo-real';
import * as service from '../services/custo-real.service';

const router=Router();
router.use(autorizarModulo('compras'));
function endpoint(fn:(req:RequestAutenticada,res:Response,loja:number)=>Promise<unknown>){
  return async(req:RequestAutenticada,res:Response,next:NextFunction)=>{
    try{const loja=lojaDoCatalogo(req.usuario!,req.lojaAtivaId,req.body?.lojaId??req.query.lojaId);await fn(req,res,loja);}
    catch(e){
      if(e instanceof ErroCatalogo)return res.status(e.status).json({sucesso:false,erro:e.message});
      if(e instanceof ErroCusto)return res.status(400).json({sucesso:false,erro:e.message});
      if((e as any)?.code==='SQLITE_CONSTRAINT')return res.status(409).json({sucesso:false,erro:'Cadastro ou documento em conflito. Confira o histórico antes de repetir.'});
      next(e);
    }
  };
}
function id(value:unknown){const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw new ErroCatalogo('Identificador inválido.');return n;}
router.post('/ler',endpoint(async(req,res,loja)=>res.json({sucesso:true,...await service.lerDocumento(req.body,loja)})));
router.post('/conferir',endpoint(async(req,res,loja)=>res.json({sucesso:true,...await service.conferirCustos(req.body.estado,loja)})));
router.post('/chave',endpoint(async(req,res,loja)=>{const xml=await service.recuperarXml(req.body.chave);res.json({sucesso:true,xml,...await service.lerDocumento({xml},loja)});}));
router.get('/rascunhos',endpoint(async(_req,res,loja)=>res.json({sucesso:true,conferencias:await service.listarConferencias(loja)})));
router.post('/rascunhos',endpoint(async(req,res,loja)=>res.json({sucesso:true,...await service.salvarConferencia(req.body,req.usuario!,loja)})));
router.get('/rascunhos/:id',endpoint(async(req,res,loja)=>res.json({sucesso:true,...await service.abrirConferencia(id(req.params.id),loja)})));
router.post('/rascunhos/:id/confirmar',endpoint(async(req,res,loja)=>res.json({sucesso:true,...await service.confirmarConferencia(id(req.params.id),req.body,req.usuario!,loja)})));
router.get('/documentos/:id',endpoint(async(req,res,loja)=>{const doc=await service.baixarDocumento(id(req.params.id),loja);res.set({'Content-Type':doc.mime,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(doc.nome)}`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'});res.send(doc.bytes);}));
router.post('/manual/salvar',autorizarModulo('produtos'),endpoint(async(req,res,loja)=>res.json({sucesso:true,...await service.salvarCustoManual(req.body,req.usuario!,loja)})));
router.get('/historico',endpoint(async(req,res,loja)=>res.json({sucesso:true,historico:await service.historicoCustos(loja,req.query.produtoId?id(req.query.produtoId):undefined)})));
export default router;
